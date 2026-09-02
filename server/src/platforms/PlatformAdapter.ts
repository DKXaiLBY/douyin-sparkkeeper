/**
 * 平台适配器接口（强解耦核心）。
 * 业务逻辑（调度/内容/安全）只依赖本接口，不关心底层是抖音网页还是 Mock。
 * 新增平台（微信/Telegram）只需新增实现，不动核心。
 */

import type {
  AdapterProbeResult,
  ConversationSummary,
  LoginState,
  PlatformName,
  SendOutcome,
} from '../lib/types.ts';

export interface PlatformAdapter {
  /** 适配器标识。 */
  readonly name: PlatformName;

  /**
   * 登录 / 注入登录态。
   * @param storageState 平台相关登录态（抖音为 Playwright storage_state）。
   */
  login(storageState: unknown): Promise<void>;

  /** 向目标发送一条消息。 */
  sendMessage(targetId: string, content: string): Promise<SendOutcome>;

  /** 探测当前登录态。 */
  checkLoginState(): Promise<LoginState>;

  /** 检测是否出现验证码（出现即应暂停并推送，不绕过）。 */
  detectCaptcha(): Promise<boolean>;

  /**
   * 链路探测（可选）：真实打开页面验证「能否定位会话 / 输入框 / 发送按钮」，
   * 但**绝不点击发送**。用于 Dry Run 的真实验证——对齐同类项目的演练语义。
   * 未实现的适配器（如 Mock）走纯文案预览。
   */
  probe?(targetId: string): Promise<AdapterProbeResult>;

  /**
   * 列举当前账号的会话列表（可选）：用于「好友自动提取」——
   * 登录后拉取会话名作为候选好友，用户勾选即可添加，避免手打名字打错人。
   * 未实现的适配器视为不支持，路由层返回明确提示。
   */
  listConversations?(): Promise<ConversationSummary[]>;

  /** 释放资源（关闭浏览器等）。 */
  close(): Promise<void>;
}

/** 适配器构造参数（统一）。 */
export interface AdapterContext {
  headless?: boolean;
  /** 超时（毫秒）。 */
  timeoutMs?: number;
  /** 发送失败时的页面截图存证目录（仅 Playwright 适配器使用，默认 data/screenshots）。 */
  screenshotDir?: string;
}

/**
 * 适配器工厂（异步，避免静态循环依赖；抖音适配器按需动态加载 Playwright）。
 */
export async function createAdapter(
  name: PlatformName,
  ctx: AdapterContext = {},
): Promise<PlatformAdapter> {
  if (name === 'mock') {
    const { MockAdapter } = await import('./MockAdapter.ts');
    return new MockAdapter();
  }
  if (name === 'douyin') {
    const { DouyinWebAdapter } = await import('./DouyinWebAdapter.ts');
    return new DouyinWebAdapter(ctx);
  }
  throw new Error(`Unknown platform adapter: ${name}`);
}
