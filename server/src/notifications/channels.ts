/**
 * 通知通道：控制台（默认）、Webhook、Telegram、none。
 * 所有通道均为「尽力而为」，失败只记录不抛致命异常，避免阻断主流程。
 */

import type { NotifyChannel, NotifyConfig } from '../lib/types.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('notify-channel');

export interface ChannelPayload {
  title: string;
  body: string;
  type: string;
}

export interface Channel {
  readonly name: NotifyChannel | 'console';
  send(payload: ChannelPayload): Promise<void>;
}

/** 控制台通道：结构化日志输出（本地优先、零外部依赖）。 */
export class ConsoleChannel implements Channel {
  readonly name = 'console' as const;
  async send(p: ChannelPayload): Promise<void> {
    log.info({ notify: p.type, title: p.title, body: p.body }, 'notification');
  }
}

/** Webhook 通道：POST JSON 到用户配置的地址（如 Bark / 企业微信 / 自建）。 */
export class WebhookChannel implements Channel {
  readonly name = 'webhook' as const;
  constructor(private readonly url: string) {}
  async send(p: ChannelPayload): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      log.warn({ err: String(e) }, 'webhook notify failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Telegram 通道：通过 Bot API 发送文本。 */
export class TelegramChannel implements Channel {
  readonly name = 'telegram' as const;
  constructor(
    private readonly token: string,
    private readonly chatId: string,
  ) {}
  async send(p: ChannelPayload): Promise<void> {
    const text = `【${p.title}】\n${p.body}`;
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'HTML' }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      log.warn({ err: String(e) }, 'telegram notify failed');
    } finally {
      clearTimeout(timer);
    }
  }
}

/** 工厂：根据配置创建外部通道（不含控制台）。 */
export function createExternalChannel(config: NotifyConfig): Channel | null {
  switch (config.channel) {
    case 'webhook':
      return config.webhookUrl ? new WebhookChannel(config.webhookUrl) : null;
    case 'telegram':
      return config.telegramToken && config.telegramChatId
        ? new TelegramChannel(config.telegramToken, config.telegramChatId)
        : null;
    case 'none':
    default:
      return null;
  }
}
