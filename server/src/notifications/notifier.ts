/**
 * 通知编排：验证码 / 登录过期 / 发送失败 / 每日日报。
 * 每次 push 都会：① 写入站内通知表（供仪表盘展示）② 分发到外部通道（如配置）。
 */

import { randomUUID } from 'node:crypto';
import type { NotificationType, NotifyConfig } from '../lib/types.ts';
import { NotificationRepo } from '../db/repos.ts';
import { ConsoleChannel, createExternalChannel, type Channel } from './channels.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('notifier');

export class Notifier {
  private readonly consoleChannel = new ConsoleChannel();
  private readonly external: Channel | null;

  constructor(
    private readonly config: NotifyConfig,
    private readonly repo: NotificationRepo,
  ) {
    this.external = createExternalChannel(config);
  }

  /** 推送一条通知（站内 + 外部通道）。 */
  async push(type: NotificationType, title: string, body: string): Promise<void> {
    // 站内留存
    this.repo.create({
      id: randomUUID(),
      type,
      channel: this.config.channel,
      title,
      body,
      read: false,
      createdAt: new Date().toISOString(),
    });

    const payload = { title, body, type };
    // 外部通道（尽力而为）
    if (this.external) {
      await this.external.send(payload);
    } else {
      await this.consoleChannel.send(payload);
    }
    log.debug({ type }, 'notification pushed');
  }
}
