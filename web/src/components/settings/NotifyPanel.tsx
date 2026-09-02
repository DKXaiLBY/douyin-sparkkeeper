import { useState } from 'react';
import { GlassPanel } from '@/components/layout/GlassPanel.tsx';
import { api } from '@/api/client.ts';
import type { AppConfig, NotifyChannel } from '@/api/types.ts';

interface NotifyPanelProps {
  config: AppConfig;
  update: (patch: unknown) => Promise<unknown>;
}

/** 通道一句话说明（默认展开的只有这一行，详细教程放在折叠区，不铺开吓人）。 */
const CHANNEL_HINTS: Record<NotifyChannel, string> = {
  none: '不配外部通道：异常提醒只在网页右上角铃铛里显示。建议先跑通再配。',
  webhook: '推荐企业微信机器人（最省事）或钉钉机器人：出事时消息推到你的微信/钉钉群，手机实时收到。',
  telegram: 'Telegram Bot：需要能访问 Telegram（国内网络通常不可用）。',
};

/** 当前通知配置是否能真的推送到外部。 */
function isExternal(n: AppConfig['notify']): boolean {
  if (n.channel === 'webhook') return Boolean(n.webhookUrl);
  if (n.channel === 'telegram') return Boolean(n.telegramToken && n.telegramChatId);
  return false;
}

/** 通知推送面板：通道选择 + 折叠配置教程 + 测试验证。 */
export function NotifyPanel({ config, update }: NotifyPanelProps) {
  const n = config.notify;
  const [webhookUrl, setWebhookUrl] = useState(n.webhookUrl ?? '');
  const [token, setToken] = useState(n.telegramToken ?? '');
  const [chatId, setChatId] = useState(n.telegramChatId ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const save = async () => {
    setSaving(true);
    setMsg('');
    try {
      await update({
        notify: { channel: n.channel, webhookUrl, telegramToken: token, telegramChatId: chatId },
      });
      setMsg('✅ 已保存');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : '保存失败'}`);
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setMsg('');
    try {
      const r = await api.notifications.test();
      setMsg(`✅ ${r.note ?? '测试消息已发送，请检查是否收到'}`);
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : '测试发送失败'}`);
    }
  };

  return (
    <GlassPanel title="通知推送" icon="🔔">
      <div className="field">
        <label>通道</label>
        <select
          className="select"
          value={n.channel}
          onChange={(e) =>
            void update({ notify: { channel: e.target.value as NotifyChannel } })
          }
        >
          <option value="none">仅控制台（默认，零外部依赖）</option>
          <option value="webhook">Webhook（企业微信 / 钉钉机器人）</option>
          <option value="telegram">Telegram Bot</option>
        </select>
        <p style={{ color: 'var(--txt-dim)', fontSize: 12, lineHeight: 1.6, margin: '8px 0 0' }}>
          {CHANNEL_HINTS[n.channel]}
        </p>
      </div>

      {n.channel === 'webhook' && (
        <>
          <div className="field">
            <label>Webhook URL</label>
            <input
              className="input"
              placeholder="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
          </div>

          {/* 配置教程：默认收起，点开才看到步骤 */}
          <details
            style={{
              marginBottom: 14,
              padding: '12px 14px',
              borderRadius: 14,
              background: 'rgba(255,255,255,.04)',
              border: '1px solid rgba(255,255,255,.1)',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontSize: 12.5,
                color: 'var(--txt-dim)',
                userSelect: 'none',
              }}
            >
              📖 怎么获取企业微信 / 钉钉的 Webhook？（点开看步骤）
            </summary>

            <div style={{ fontSize: 12.5, lineHeight: 1.9, marginTop: 12 }}>
              <b style={{ color: 'var(--ember-2)' }}>企业微信（推荐，最简单）</b>
              <br />
              1. 打开企业微信 → 进入一个群（随便建个「火花守护」群）
              <br />
              2. 点右上角「⋯」→「添加群机器人」→ 创建机器人
              <br />
              3. 复制机器人「Webhook 地址」（形如
              <span style={{ color: 'var(--txt)' }}>
                {' '}
                https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx
              </span>
              ）
              <br />
              4. 粘贴到上面的输入框 → 点「保存通知配置」→ 点「发送测试通知」，手机微信应收到
              <br />
              <span style={{ color: 'var(--txt-faint)' }}>
                企业微信机器人没有关键词限制，最省心。
              </span>

              <br />
              <br />
              <b style={{ color: 'var(--ember-2)' }}>钉钉机器人（也可以）</b>
              <br />
              1. 打开钉钉 → 进入一个群 → 右上角「群设置」→「智能群助手」
              <br />
              2. 「添加机器人」→ 选「自定义」
              <br />
              3. 安全设置：勾选「自定义关键词」，填{' '}
              <span style={{ color: 'var(--ember-1)' }}>通知</span>（见下方提醒）
              <br />
              4. 复制 Webhook 地址（形如
              <span style={{ color: 'var(--txt)' }}>
                {' '}
                https://oapi.dingtalk.com/robot/send?access_token=xxx
              </span>
              ）→ 粘贴 → 保存 → 测试
              <br />
              <span style={{ color: 'var(--ember-3)' }}>
                ⚠️ 钉钉限制：机器人消息必须包含你设置的关键词，否则会被丢弃。
                「测试通知 / 每日日报」含「通知」能过，但「验证码 / 发送失败」不含——
                想全覆盖请填多个关键词（如：通知、验证码、登录、发送、日报）。
              </span>
            </div>
          </details>
        </>
      )}

      {n.channel === 'telegram' && (
        <>
          <div className="field">
            <label>Bot Token</label>
            <input className="input" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div className="field">
            <label>Chat ID</label>
            <input className="input" value={chatId} onChange={(e) => setChatId(e.target.value)} />
          </div>
        </>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" disabled={saving} onClick={save}>
          {saving ? '保存中…' : '保存通知配置'}
        </button>
        {isExternal(n) && (
          <button className="btn" onClick={test}>
            发送测试通知
          </button>
        )}
      </div>

      {msg && (
        <p style={{ marginTop: 10, fontSize: 12.5, color: 'var(--txt-dim)' }}>{msg}</p>
      )}

      <p style={{ color: 'var(--txt-dim)', fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
        验证码 / 登录过期 / 发送失败 / 每日日报会推送到你配的群。登录态过期是最高频故障，
        配了它火花才不会悄悄断。
      </p>
    </GlassPanel>
  );
}
