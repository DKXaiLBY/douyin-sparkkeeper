import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/layout/GlassPanel.tsx';
import { api } from '@/api/client.ts';
import type { HealthStatus, SendReport } from '@/api/types.ts';

interface EngineControlProps {
  health: HealthStatus | null;
  onHealthChange: () => void;
  onDashboardChange: () => void;
}

/**
 * 引擎控制：暂停/接管、恢复、Dry Run、立即执行 + 开机自启开关。
 * 开机自启原为独立面板（AutoStartPanel），已按用户要求并入此处，让设置页保持 2×2 整齐。
 */
export function EngineControl({ health, onHealthChange, onDashboardChange }: EngineControlProps) {
  const [report, setReport] = useState<SendReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // ---- 开机自启（仅 Windows）----
  const [autoStart, setAutoStart] = useState(false);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoBusy, setAutoBusy] = useState(false);
  const [autoMsg, setAutoMsg] = useState('');
  const [autoUnsupported] = useState(
    () => navigator.userAgent.includes('Windows') === false,
  );

  useEffect(() => {
    let stopped = false;
    void (async () => {
      try {
        const r = await api.settings.autostart();
        if (!stopped) setAutoStart(r.enabled);
      } catch {
        /* 非 Windows 或后端未起 */
      } finally {
        if (!stopped) setAutoLoading(false);
      }
    })();
    return () => {
      stopped = true;
    };
  }, []);

  const toggleAutoStart = async (): Promise<void> => {
    const next = !autoStart;
    setAutoStart(next); // 乐观更新
    setAutoBusy(true);
    setAutoMsg('');
    try {
      const r = await api.settings.setAutostart(next);
      setAutoStart(r.enabled);
      setAutoMsg(next ? '✅ 已开启：下次开机将自动启动服务' : '已关闭开机自启');
    } catch (e) {
      setAutoStart(!next); // 失败回滚
      setAutoMsg(`❌ ${e instanceof Error ? e.message : '设置失败'}`);
    } finally {
      setAutoBusy(false);
    }
  };

  /**
   * @param asReport 结果是否为 SendReport。暂停/恢复返回的是 { paused }，
   *                 若当作报告渲染会在读取 items.length 时崩溃（曾导致页面黑屏）。
   */
  const run = async (fn: () => Promise<unknown>, okText: string, asReport = true) => {
    setBusy(true);
    setMsg('');
    try {
      const r = await fn();
      if (asReport) {
        setReport(r as SendReport);
      } else {
        setReport(null);
      }
      setMsg(`✅ ${okText}`);
      onHealthChange();
      onDashboardChange();
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : '执行失败'}`);
    } finally {
      setBusy(false);
    }
  };

  const paused = health?.paused ?? false;

  return (
    <GlassPanel title="引擎控制" icon="🎛️">
      <div className="flex gap-2 flex-wrap">
        {paused ? (
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => run(() => api.run.resume(), '已恢复', false)}
          >
            恢复引擎
          </button>
        ) : (
          <button
            className="btn btn-danger"
            disabled={busy}
            onClick={() => run(() => api.run.pause(), '已暂停（接管）', false)}
          >
            一键暂停 / 接管
          </button>
        )}
        <button className="btn" disabled={busy} onClick={() => run(() => api.run.dry(), 'Dry Run 完成（未发送）')}>
          Dry Run 预览
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => run(() => api.run.now(), '立即执行完成')}>
          立即执行
        </button>

        {/* 开机自启：与引擎控制并排——它决定的正是「引擎什么时候自己跑起来」 */}
        <button
          type="button"
          className="btn autostart-btn"
          onClick={() => void toggleAutoStart()}
          disabled={autoBusy || autoLoading || autoUnsupported}
          title={
            autoUnsupported
              ? '开机自启目前仅支持 Windows'
              : '开启后电脑一开机就会自动启动服务（隐藏窗口）'
          }
        >
          <span className={`track${autoStart ? ' on' : ''}`}>
            <span className="knob" />
          </span>
          {autoUnsupported
            ? '开机自启（仅 Windows）'
            : autoLoading
              ? '开机自启 检测中…'
              : autoStart
                ? '开机自启 已开启'
                : '开机自启 未开启'}
        </button>
      </div>

      {autoMsg && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--txt-dim)' }}>{autoMsg}</p>
      )}

      {msg && <p style={{ marginTop: 12, color: 'var(--txt-dim)', fontSize: 13 }}>{msg}</p>}

      {report && (
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--txt-dim)', lineHeight: 1.7 }}>
          {report.dryRun ? '【Dry Run】' : '【立即执行】'} 共 {report.total} · 成功 {report.sent} · 失败{' '}
          {report.failed} · 跳过 {report.skipped}
          {report.captchaDetected && ' · ⚠️ 检测到验证码，已暂停'}
          {report.paused && ' · 引擎已暂停'}
          {/* 明确说清为什么停/为什么失败，不让用户对着「成功 0 失败 0」猜 */}
          {report.pauseReason && (
            <div style={{ color: '#ffb454', marginTop: 4 }}>
              暂停原因：{report.pauseReason}
            </div>
          )}
          {/* 当总数 > 0 却既没成功也没失败也没跳过：说明在发送前就被中止 */}
          {report.total > 0 &&
            report.sent === 0 &&
            report.failed === 0 &&
            report.skipped === 0 && (
              <div style={{ color: '#ffb454', marginTop: 4 }}>
                任务未执行：在发送前被中止，请查看上方暂停原因（登录态 / 验证码 / 熔断）。
              </div>
            )}
          {report.items.length > 0 && (
            <ul style={{ marginTop: 8, paddingLeft: 18 }}>
              {report.items.map((it) => (
                <li key={it.friendId}>
                  {it.ok ? '✅' : '❌'} {it.nickname}
                  {it.content ? `：${it.content}` : ''}
                  {it.skipReason ? `（${it.skipReason}）` : ''}
                  {it.errorCode ? `（错误码 ${it.errorCode}）` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </GlassPanel>
  );
}
