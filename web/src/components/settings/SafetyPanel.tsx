import { useEffect, useState } from 'react';
import { GlassPanel } from '@/components/layout/GlassPanel.tsx';
import type { AppConfig, SafetyConfig } from '@/api/types.ts';

interface SafetyPanelProps {
  config: AppConfig;
  update: (patch: unknown) => Promise<unknown>;
}

/**
 * 安全模式面板：总开关 / 每日上限 / 随机延迟 / 错峰窗口。
 *
 * ⚠️ 交互约定：改为「本地草稿 + 显式保存」。
 * 原实现每个 onChange 都立即 PUT 并用响应覆盖 state，导致数字输入被反复打断
 * （删空即变 0、光标跳动），用户观感是「改不动、点了没反应」。
 */
export function SafetyPanel({ config, update }: SafetyPanelProps) {
  const [draft, setDraft] = useState<SafetyConfig>(config.safety);
  const [enabled, setEnabled] = useState<boolean>(config.safetyMode);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  /**
   * 数字输入框的字符串镜像（允许「暂时为空」）。
   * 旧实现 `v === '' ? 0 : Number(v)` 会把清空瞬间变成 0 —— 用户永远删不干净，
   * 再输入时数字排在 0 后面（如 05）。改为：输入中允许空串，失焦时才回填合法值。
   */
  const [numTextMap, setNumTextMap] = useState<Record<string, string>>({});

  // 外部配置刷新（如切换页面/其它面板保存后）时同步回来
  useEffect(() => {
    setDraft(config.safety);
    setEnabled(config.safetyMode);
  }, [config.safety, config.safetyMode]);

  /** 输入框显示值：优先用「输入中的字符串」（可为空），否则回落到 draft 数值。
   *  ⚠️ staggerStart/staggerEnd 是输入镜像的 key，draft 里没有这两个字段——
   *  真实数据是 staggerHours[0]/[1]，必须显式映射，否则显示 undefined。 */
  const numText = (key: string): string => {
    const mirror = numTextMap[key];
    if (mirror !== undefined) return mirror;
    if (key === 'staggerStart') return String(draft.staggerHours[0]);
    if (key === 'staggerEnd') return String(draft.staggerHours[1]);
    return String(draft[key as keyof SafetyConfig]);
  };

  /** 输入中：允许空串（只更新显示，不写入 draft）；只保留数字字符。 */
  const onNumInput = (key: keyof SafetyConfig, raw: string): void => {
    const v = raw.replace(/[^0-9]/g, ''); // 过滤非数字，避免 '12a' 这类污染
    setNumTextMap((t) => ({ ...t, [key]: v }));
    if (v.trim() === '') return;
    const n = Number(v);
    if (Number.isFinite(n)) setDraft((d) => ({ ...d, [key]: n }));
  };

  /** 失焦：若为空/非法，回填合法值（各字段下限）。 */
  const onNumCommit = (key: keyof SafetyConfig, fallback: number): void => {
    const raw = (numTextMap[key] ?? '').trim();
    const n = Number(raw);
    const final = raw === '' || !Number.isFinite(n) ? fallback : n;
    setNumTextMap((t) => ({ ...t, [key]: String(final) }));
    setDraft((d) => ({ ...d, [key]: final }));
  };

  /** 错峰小时：同样允许空，失焦时钳制到 0–23。 */
  const onHourInput = (idx: 0 | 1, raw: string): void => {
    const key = idx === 0 ? 'staggerStart' : 'staggerEnd';
    const v = raw.replace(/[^0-9]/g, '');
    setNumTextMap((t) => ({ ...t, [key]: v }));
    if (v.trim() === '') return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    setDraft((d) => {
      const next: [number, number] = [...d.staggerHours] as [number, number];
      next[idx] = Math.max(0, Math.min(23, n));
      return { ...d, staggerHours: next };
    });
  };

  const onHourCommit = (idx: 0 | 1, fallback: number): void => {
    const key = idx === 0 ? 'staggerStart' : 'staggerEnd';
    const raw = (numTextMap[key] ?? '').trim();
    const final =
      raw === '' || !Number.isFinite(Number(raw))
        ? fallback
        : Math.max(0, Math.min(23, Number(raw)));
    setNumTextMap((t) => ({ ...t, [key]: String(final) }));
    setDraft((d) => {
      const next: [number, number] = [...d.staggerHours] as [number, number];
      next[idx] = final;
      return { ...d, staggerHours: next };
    });
  };

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next); // 乐观更新，开关类操作立即反馈
    setMsg('');
    try {
      await update({ safetyMode: next });
      setMsg(next ? '安全模式已开启' : '安全模式已关闭（请谨慎）');
    } catch (e) {
      setEnabled(!next); // 失败回滚
      setMsg(`❌ ${e instanceof Error ? e.message : '切换失败'}`);
    }
  };

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await update({ safety: draft });
      setMsg('✅ 已保存');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : '保存失败'}`);
    } finally {
      setSaving(false);
    }
  };

  const dirty =
    JSON.stringify(draft) !== JSON.stringify(config.safety) || enabled !== config.safetyMode;

  /**
   * 每日触发模式：显式取 'random'/'fixed'，后端未返回（旧配置）时按 'random' 处理，
   * 避免用 !== 'fixed' 这类反向判断导致「选项看起来已选中、点了却没反应」。
   */
  const mode: 'fixed' | 'random' = config.sendMode === 'fixed' ? 'fixed' : 'random';
  const [modeErr, setModeErr] = useState('');

  const switchMode = async (next: 'fixed' | 'random') => {
    setModeErr('');
    try {
      await update({ sendMode: next });
    } catch (e) {
      setModeErr(e instanceof Error ? e.message : '切换失败');
    }
  };

  return (
    <GlassPanel title="安全模式" icon="🛡️">
      <button
        type="button"
        onClick={toggleEnabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 16,
          padding: '6px 12px 6px 6px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,.16)',
          background: 'rgba(255,255,255,.06)',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        <span
          style={{
            width: 44,
            height: 26,
            borderRadius: 999,
            position: 'relative',
            transition: '0.3s',
            background: enabled
              ? 'linear-gradient(135deg, var(--ember-1), var(--ember-2))'
              : 'rgba(255,255,255,.15)',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: 3,
              left: enabled ? 21 : 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              transition: '0.3s',
            }}
          />
        </span>
        启用安全模式{enabled ? '（已开启）' : '（已关闭）'}
      </button>
      <p style={{ color: 'var(--txt-dim)', fontSize: 12, lineHeight: 1.7, marginTop: 8 }}>
        {enabled
          ? '✅ 已保护：发送前随机等待、每天限量、只在错峰时段内发、连续失败自动暂停——行为更像真人，更不易被风控盯上。'
          : '⚠️ 已关闭：点击发送会立即执行、不限次数、任何时间都能发——速度快，但行为模式更像机器人，账号更容易被风控，请谨慎。'}
      </p>

      {/* 每日触发模式：random=窗口内随机（默认，拟人）；fixed=固定时刻 */}
      <div className="field">
        <label>每日触发模式</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', userSelect: 'none', lineHeight: 1.6 }}>
            <input
              type="radio"
              name="sendMode"
              style={{ accentColor: '#ff8a3d', marginTop: 3 }}
              checked={mode === 'random'}
              onChange={() => void switchMode('random')}
            />
            <span>
              窗口内随机（推荐）——每天在下方错峰时段内随机挑一个时刻发送，
              打破规律性，更像真人，更不易被风控识别为定时脚本
            </span>
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', userSelect: 'none', lineHeight: 1.6 }}>
            <input
              type="radio"
              name="sendMode"
              style={{ accentColor: '#ff8a3d', marginTop: 3 }}
              checked={mode === 'fixed'}
              onChange={() => void switchMode('fixed')}
            />
            <span>固定时刻——每天固定时间发送（行为规律，风控识别风险相对更高）</span>
          </label>
        </div>
        {modeErr && (
          <p style={{ color: '#ff5d73', fontSize: 12, marginTop: 6 }}>
            ❌ 切换失败：{modeErr}（请确认后端在运行）
          </p>
        )}
        {mode === 'fixed' && (
          <input
            className="input"
            style={{ marginTop: 8 }}
            defaultValue={config.cron}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) void update({ cron: v });
            }}
            placeholder="cron 表达式，如 0 20 * * *（每天 20:00）"
          />
        )}
      </div>

      <div className="grid-12">
        <div className="field span6">
          <label>每日发送人数上限</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={numText('dailyCap')}
            onChange={(e) => onNumInput('dailyCap', e.target.value)}
            onBlur={() => onNumCommit('dailyCap', 1)}
          />
        </div>
        <div className="field span6">
          <label>随机延迟下限（秒）</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={numText('delayMinSec')}
            onChange={(e) => onNumInput('delayMinSec', e.target.value)}
            onBlur={() => onNumCommit('delayMinSec', 0)}
          />
        </div>
        <div className="field span6">
          <label>随机延迟上限（秒）</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={numText('delayMaxSec')}
            onChange={(e) => onNumInput('delayMaxSec', e.target.value)}
            onBlur={() => onNumCommit('delayMaxSec', Math.max(1, draft.delayMinSec || 1))}
          />
        </div>
        <div className="field span6">
          <label>错峰开始（0–23 时）</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={numText('staggerStart')}
            onChange={(e) => onHourInput(0, e.target.value)}
            onBlur={() => onHourCommit(0, 19)}
          />
        </div>
        <div className="field span6">
          <label>错峰结束（0–23 时）</label>
          <input
            className="input"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={numText('staggerEnd')}
            onChange={(e) => onHourInput(1, e.target.value)}
            onBlur={() => onHourCommit(1, 23)}
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
        <button
          className="btn btn-primary"
          disabled={saving || !dirty}
          onClick={save}
          style={{ opacity: dirty ? 1 : 0.5 }}
        >
          {saving ? '保存中…' : '保存安全模式配置'}
        </button>
        {dirty && <span style={{ fontSize: 12, color: '#ffb454' }}>有未保存的修改</span>}
      </div>

      {msg && (
        <p style={{ marginTop: 8, fontSize: 12, color: 'var(--txt-dim)' }}>{msg}</p>
      )}

      <p style={{ color: 'var(--txt-dim)', fontSize: 12, lineHeight: 1.6, marginTop: 8 }}>
        修改后需点「保存」才会生效。
      </p>
    </GlassPanel>
  );
}
