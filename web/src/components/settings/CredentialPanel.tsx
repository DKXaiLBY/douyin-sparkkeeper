import { useCallback, useEffect, useRef, useState } from 'react';
import { GlassPanel } from '@/components/layout/GlassPanel.tsx';
import { StatusPill } from '@/components/layout/StatusPill.tsx';
import { api, ApiError } from '@/api/client.ts';
import type { QrLoginState } from '@/api/types.ts';

/** 轮询间隔（毫秒）：二维码刷新较快，2s 足够及时又不至于打满后端。 */
const QR_POLL_INTERVAL_MS = 2_000;

/** 「记住口令」的 localStorage 键。仅本机自用场景（服务只监听 127.0.0.1）。 */
const REMEMBER_KEY = 'sparkkeeper-passphrase';

/** 轮询终止状态：到达这些状态就停表，避免空转。 */
const TERMINAL_STATUSES = new Set(['success', 'cancelled', 'error', 'expired', 'idle']);

/** 子区块通用样式（与 LlmPanel 的分组卡片一致）。 */
const BLOCK_STYLE: React.CSSProperties = {
  marginBottom: 18,
  padding: 14,
  borderRadius: 12,
  background: 'rgba(255,255,255,.05)',
};

/** 根据扫码状态生成给用户的中文提示。 */
function qrTip(s: QrLoginState | null): string {
  if (!s) {
    return '点击上方按钮，页面会直接生成抖音登录二维码；用手机抖音 App 扫描即可，全程无需导出/复制任何文件。';
  }
  switch (s.status) {
    case 'idle':
      return '准备中…';
    case 'starting':
      return '正在启动浏览器并打开抖音登录页（首次约需数秒）…';
    case 'waiting':
      return '请用抖音 App 扫描下方二维码（二维码会自动刷新，请扫当前显示的这张）';
    case 'scanned':
      return '✅ 扫描成功，正在等待你在手机上确认…';
    case 'success':
      return '🎉 登录成功！凭证已加密保存';
    case 'expired':
      return '⌛ 二维码已过期，请点击「重新获取二维码」';
    case 'cancelled':
      return '已取消扫码登录';
    case 'error':
      return `❌ ${s.message ?? '扫码登录失败'}`;
    default:
      return '';
  }
}

/** 凭证保险库面板：扫码登录（推荐） / 口令 / 重登录检测。 */
export function CredentialPanel() {
  const [passphrase, setPassphrase] = useState('');
  /** 口令明文/密文切换（小眼睛）。 */
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [status, setStatus] = useState<{
    imported: boolean;
    unlocked: boolean;
    /** false = 首次使用（输入的任何口令都会成为新口令）。 */
    hasVerifier?: boolean;
  } | null>(null);

  // ---- 扫码登录状态 ----
  const [qrState, setQrState] = useState<QrLoginState | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrPolling, setQrPolling] = useState(false);
  /** 是否存在「需要后端清理」的活跃扫码会话（用于卸载时通知后端关浏览器）。 */
  const qrSessionActiveRef = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api.credentials.status());
    } catch {
      /* ignore */
    }
  }, []);

  // 首次挂载即拉取一次：二维码流程需要知道保险库是否已解锁
  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  // ---- 记住口令：保险库锁定时，用 localStorage 里保存的口令自动解锁 ----
  const [rememberPass, setRememberPass] = useState(
    () => localStorage.getItem(REMEMBER_KEY) !== null,
  );
  const autoUnlockDone = useRef(false);
  useEffect(() => {
    if (!status || status.unlocked || autoUnlockDone.current) return;
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (!saved) return;
    autoUnlockDone.current = true; // 每个页面生命周期只自动尝试一次，避免循环
    void (async () => {
      try {
        await api.credentials.unlock(saved);
        setPassphrase(saved);
        await loadStatus();
        setMsg('✅ 已用记住的口令自动解锁');
      } catch (e) {
        // ⚠️ 只有「确认口令错误」(401 INVALID_PASSPHRASE) 才清除记忆；
        //    网络错误（后端刚重启接口未就绪等）绝不能删口令——否则用户勾选「记住口令」
        //    后重启一次就丢失，正是之前遇到的 bug。
        if (e instanceof ApiError && e.code === 'INVALID_PASSPHRASE') {
          localStorage.removeItem(REMEMBER_KEY);
          setRememberPass(false);
        }
      }
    })();
  }, [status, loadStatus]);

  const toggleRemember = (on: boolean) => {
    setRememberPass(on);
    if (on && passphrase) localStorage.setItem(REMEMBER_KEY, passphrase);
    if (!on) localStorage.removeItem(REMEMBER_KEY);
  };

  const onVerify = async () => {
    setMsg('');
    try {
      const r = await api.credentials.verify(passphrase);
      setMsg(r.ok ? '✅ 口令正确' : '❌ 口令错误');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : '校验失败'}`);
    }
  };

  const onRelogin = async () => {
    setMsg('');
    try {
      const r = await api.credentials.relogin();
      setMsg(r.message);
      await loadStatus();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : '失败'}`);
    }
  };

  // ---------------- 扫码登录 ----------------

  /** 向后端查询一次扫码状态；到达终止状态则停表。 */
  const pollQr = useCallback(async () => {
    try {
      const s = await api.credentials.qrStatus();
      setQrState(s);
      if (TERMINAL_STATUSES.has(s.status)) {
        setQrPolling(false);
        qrSessionActiveRef.current = false;
        if (s.status === 'success') {
          setMsg('✅ 扫码登录成功，凭证已加密保存');
          rememberAfterSuccess();
          await loadStatus();
        } else if (s.status === 'expired') {
          setMsg('⌛ 二维码已过期，请点击「重新获取二维码」');
        } else if (s.status === 'error') {
          setMsg(`❌ ${s.message ?? '扫码登录失败'}`);
        }
      }
    } catch (e) {
      setQrPolling(false);
      qrSessionActiveRef.current = false;
      const m = e instanceof Error ? e.message : '查询扫码状态失败';
      setQrState({ status: 'error', message: m });
      setMsg(`❌ ${m}`);
    }
  }, [loadStatus]);

  // 轮询定时器：qrPolling 打开时启动，关闭 / 卸载时清理（绝不泄漏定时器）
  useEffect(() => {
    if (!qrPolling) return;
    let stopped = false;
    const tick = (): void => {
      if (!stopped) void pollQr();
    };
    tick(); // 立即拉一次，不等第一个间隔
    const id = window.setInterval(tick, QR_POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [qrPolling, pollQr]);

  // 组件卸载时：若会话仍在跑，通知后端关闭浏览器（放在轮询 effect 之后，卸载清理时其后执行）
  useEffect(() => {
    return () => {
      if (qrSessionActiveRef.current) {
        qrSessionActiveRef.current = false;
        void api.credentials.qrCancel().catch(() => undefined);
      }
    };
  }, []);

  const onStartQr = async () => {
    setMsg('');
    setQrBusy(true);
    try {
      const s = await api.credentials.qrStart(passphrase.trim() || undefined);
      setQrState(s);
      if (s.needsPassphrase) {
        setMsg('⚠️ 请先填写「加密口令」，再开始扫码（口令用于加密保存扫码得到的登录态）');
        return;
      }
      if (s.status === 'starting' || s.status === 'waiting' || s.status === 'scanned') {
        qrSessionActiveRef.current = true;
        setQrPolling(true);
      } else if (s.status === 'error') {
        setMsg(`❌ ${s.message ?? '启动扫码失败'}`);
      }
    } catch (e) {
      const m = e instanceof Error ? e.message : '启动扫码失败';
      setQrState({ status: 'error', message: m });
      setMsg(`❌ ${m}`);
    } finally {
      setQrBusy(false);
    }
  };

  /** 扫码成功后：若勾选了记住口令，把当前口令存下来，供下次重启自动解锁。 */
  const rememberAfterSuccess = () => {
    if (rememberPass && passphrase) localStorage.setItem(REMEMBER_KEY, passphrase);
  };

  const onCancelQr = async () => {
    setQrPolling(false);
    qrSessionActiveRef.current = false;
    try {
      await api.credentials.qrCancel();
    } catch {
      /* 取消失败也按已取消处理：前端不再轮询即可 */
    }
    setQrState({ status: 'cancelled', message: '已取消扫码登录' });
  };

  const qrFailed =
    qrState?.status === 'error' || qrState?.status === 'expired' || qrState?.status === 'cancelled';

  return (
    <GlassPanel title="凭证保险库" icon="🔐">
      <div className="flex gap-2 mb-3">
        {status && <StatusPill label={status.imported ? '已导入凭证' : '未导入'} state={status.imported ? 'ok' : 'off'} />}
        {status && <StatusPill label={status.unlocked ? '已解锁' : '已锁定'} state={status.unlocked ? 'ok' : 'bad'} />}
      </div>

      {/* ---------- 扫码登录（推荐入口） ---------- */}
      <div style={BLOCK_STYLE}>
        <div style={{ fontSize: 14, marginBottom: 8, fontWeight: 600 }}>推荐：手机扫码登录</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" disabled={qrBusy} onClick={onStartQr}>
            {qrBusy ? '正在启动…' : qrFailed ? '🔄 重新获取二维码' : '📱 扫码登录'}
          </button>
          {qrPolling && (
            <button className="btn" onClick={onCancelQr}>
              取消扫码
            </button>
          )}
        </div>

        <p style={{ color: 'var(--txt-dim)', fontSize: 12, lineHeight: 1.6, margin: '8px 0 0' }}>
          {qrTip(qrState)}
        </p>

        {/* 启动进度：后端按真实阶段上报百分比（启动浏览器 15% → 打开页面 40% → 渲染 65-85% → 就绪 100%）。
            二维码出现前始终显示进度条；达到 100% 后切换为二维码/加载提示。 */}
        {qrState && !qrFailed && (qrState.status === 'starting' || (qrState.progress ?? 0) < 100) && (
          <div style={{ margin: '14px 0 4px' }}>
            <div
              style={{
                height: 8,
                borderRadius: 999,
                background: 'rgba(255,255,255,.1)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(4, Math.min(100, qrState.progress ?? 0))}%`,
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #ff8a3d, #ffb454)',
                  transition: 'width .6s cubic-bezier(.16,1,.3,1)',
                }}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                margin: '8px 2px 0',
                fontSize: 12,
                color: 'var(--txt-dim)',
              }}
            >
              <span>{qrState.message ?? '正在启动…'}</span>
              <span style={{ color: 'var(--ember-2)', fontWeight: 500 }}>
                {qrState.progress ?? 0}%
              </span>
            </div>
            <p style={{ color: 'var(--txt-faint)', fontSize: 11.5, lineHeight: 1.6, margin: '10px 0 0', textAlign: 'center' }}>
              首次启动浏览器约需 5–15 秒，请稍候（不要关闭本窗口）
            </p>
          </div>
        )}

        {qrState?.qr && !qrFailed && !(qrBusy || qrState?.status === 'starting') && (
          <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0 4px' }}>
            {/* 白底 + 圆角：手机相机在纯白背景上识别率最高 */}
            <div
              style={{
                padding: 12,
                background: '#fff',
                borderRadius: 18,
                boxShadow: '0 8px 26px rgba(0,0,0,.28)',
              }}
            >
              <img
                src={qrState.qr}
                alt="抖音登录二维码"
                style={{ display: 'block', width: 220, height: 220, objectFit: 'contain' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ---------- 加密口令（扫码与手动导入共用） ---------- */}
      {status && !status.unlocked && status.hasVerifier === false && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: 14,
            borderRadius: 12,
            background: 'rgba(255,212,121,.1)',
            border: '1px solid rgba(255,212,121,.4)',
            color: '#ffd479',
            fontSize: 12.5,
            lineHeight: 1.7,
          }}
        >
          🔑 <b>第一次使用：在这里设置你自己的口令</b>
          <br />
          下方输入框填什么，什么就是你的保险库口令（登录凭证靠它加密保护，忘记无法找回）。
          <br />
          如果输入框里带出了旧口令，请<b>先清空再输入新口令</b>。
        </div>
      )}
      <div className="field">
        <label>
          加密口令
          <span
            className="help"
            data-tip="用于加密保存在本机的登录凭证。勾选「记住口令」后，后端重启会自动解锁，不用重复输入。"
            style={{ marginLeft: 6 }}
          >
            ?
          </span>
        </label>
        <div style={{ position: 'relative' }}>
          <input
            className="input"
            type={showPass ? 'text' : 'password'}
            value={passphrase}
            onChange={(e) => {
              const v = e.target.value;
              setPassphrase(v);
              // 勾选「记住口令」时，输入即持久化——不依赖扫码/导入成功这类特定时机，
              // 避免「先勾选后填口令」时漏存（此前 bug）。
              if (rememberPass && v) localStorage.setItem(REMEMBER_KEY, v);
            }}
            placeholder={status && !status.unlocked ? '首次使用时，此口令将作为保险库口令' : ''}
            style={{ paddingRight: 40 }}
          />
          {/* 小眼睛：切换明文/密文。口令只在你眼前——加密保险库的钥匙，输错一步都进不去。 */}
          <button
            type="button"
            onClick={() => setShowPass((v) => !v)}
            title={showPass ? '隐藏口令' : '显示口令'}
            style={{
              position: 'absolute',
              right: 6,
              top: '50%',
              transform: 'translateY(-50%)',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: 15,
              lineHeight: 1,
              padding: 6,
              opacity: 0.75,
            }}
          >
            {showPass ? '🙈' : '👁️'}
          </button>
        </div>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 12,
            color: 'var(--txt-dim)',
            cursor: 'pointer',
            margin: '8px 0 0',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={rememberPass}
            onChange={(e) => toggleRemember(e.target.checked)}
            style={{ accentColor: '#ff8a3d' }}
          />
          记住口令（重启后自动解锁）
        </label>
      </div>

      {/* 手动导入已移除：扫码登录已是最顺滑路径（前端不再暴露，后端 /credentials/import 接口仍保留作兜底） */}

      <div className="flex gap-2 flex-wrap">
        <button className="btn" onClick={onVerify}>
          校验口令
        </button>
        <button className="btn btn-danger" onClick={onRelogin}>
          重登录检测
        </button>
        <button className="btn" onClick={loadStatus}>
          刷新状态
        </button>
      </div>

      {msg && (
        <p style={{ marginTop: 12, color: 'var(--txt-dim)', fontSize: 13 }}>{msg}</p>
      )}
      {/* 合规说明较长且非常驻需要，收进「?」悬停，避免面板底部堆字 */}
      <p style={{ marginTop: 10, fontSize: 12, color: 'var(--txt-faint)' }}>
        关于安全与合规
        <span
          className="help"
          data-tip="本应用不绕过验证码：检测到验证码或登录过期会主动暂停并推送提醒，需要你人工处理。凭证仅加密保存在本机，不会上传到任何服务器。"
          style={{ marginLeft: 6 }}
        >
          ?
        </span>
      </p>
    </GlassPanel>
  );
}
