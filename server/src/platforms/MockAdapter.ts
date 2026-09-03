/**
 * Mock 适配器：不真正登录/发送，用于开发、CI 与 Dry Run 验证整条链路。
 * 与真实发送共用「文案生成 + 调度编排」，仅最后一步 send() 不同。
 */

import type { ConversationSummary, LoginState, SendOutcome } from '../lib/types.ts';
import type { AdapterContext, PlatformAdapter } from './PlatformAdapter.ts';

export interface MockAdapterOptions {
  /** 模拟失败概率 0~1（默认 0，即全部成功）。 */
  failRate?: number;
  /** 强制返回验证码（用于测试暂停/推送路径）。 */
  forceCaptcha?: boolean;
  /** 模拟网络往返延迟（毫秒，默认 20）。 */
  latencyMs?: number;
  /** 固定返回（测试可注入），优先级高于随机。 */
  forcedOutcome?: SendOutcome;
}

export class MockAdapter implements PlatformAdapter {
  public readonly name = 'mock' as const;
  private readonly opts: Required<Omit<MockAdapterOptions, 'forcedOutcome'>> &
    Pick<MockAdapterOptions, 'forcedOutcome'>;
  private loggedIn = false;

  constructor(options: MockAdapterOptions = {}) {
    this.opts = {
      failRate: options.failRate ?? 0,
      forceCaptcha: options.forceCaptcha ?? false,
      latencyMs: options.latencyMs ?? 20,
      forcedOutcome: options.forcedOutcome,
    };
  }

  async login(_storageState: unknown): Promise<void> {
    this.loggedIn = true;
  }

  async checkLoginState(): Promise<LoginState> {
    return this.loggedIn ? 'ok' : 'unknown';
  }

  async detectCaptcha(): Promise<boolean> {
    return this.opts.forceCaptcha;
  }

  async sendMessage(targetId: string, content: string): Promise<SendOutcome> {
    await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    if (this.opts.forcedOutcome) return this.opts.forcedOutcome;
    if (this.opts.forceCaptcha) {
      return { ok: false, captcha: true, errorCode: 'CAPTCHA_REQUIRED' };
    }
    if (Math.random() < this.opts.failRate) {
      return { ok: false, errorCode: 'NETWORK' };
    }
    return { ok: true };
  }

  /**
   * Mock：返回虚构演示会话，供前端联调「好友自动提取」与 README 截图。
   * ⚠️ 必须用「一眼假的通用网名」——截图会公开到 GitHub，绝不能出现任何可能
   *    对应真实用户的昵称（曾因演示数据疑似来自真实会话被标记为隐私风险）。
   */
  async listConversations(): Promise<ConversationSummary[]> {
    await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    return ['星星', '阿茶', '北北', '小满', '图图'].map((title) => ({ title }));
  }

  async close(): Promise<void> {
    this.loggedIn = false;
  }
}
