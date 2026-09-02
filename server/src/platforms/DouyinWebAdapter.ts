/**
 * 抖音网页适配器（Playwright）。
 *
 * ⚠️ 验证状态：本文件为完整实现，但「需用户在真实本机/服务器验证」，当前开发沙箱未实跑
 *    （无法登录抖音、未下载浏览器二进制）。选择器基于抖音网页版聊天页公开结构的最佳估计，
 *    抖音改版时需同步更新。本适配器不绕过验证码；检测到验证码即返回 captcha 标记，由上层暂停并推送。
 *
 * 合规：仅做「自动化发私信」，不提供绕过验证码、不批量骚扰、不逆向 API。
 */

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Browser, BrowserContext, Page } from 'playwright';
import type {
  AdapterProbeResult,
  ConversationSummary,
  LoginState,
  SendOutcome,
} from '../lib/types.ts';
import type { AdapterContext, PlatformAdapter } from './PlatformAdapter.ts';
import { AppError, ErrorCode } from '../lib/errors.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('douyin-adapter');

const DOUYIN_CHAT_URL = 'https://www.douyin.com/chat';
// 首屏 SPA 渲染较慢，给足超时（会话列表渲染、编辑器挂载都需要时间）
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_SCREENSHOT_DIR = 'data/screenshots';

/**
 * 聊天输入框候选选择器。
 * 实测结构（2026-08 真实页面 dump）：聊天区是 Slate 编辑器，
 * 元素为 contenteditable 的 div（`.messageEditorinputArea`），**不是 textarea**；
 * 且只有选中某个会话后才会渲染。
 */
const INPUT_SELECTORS = [
  '.messageEditorinputArea[contenteditable="true"]',
  '[data-e2e="msg-input"] [contenteditable="true"]',
  '.messageEditorimChatEditorContainer [contenteditable="true"]',
  'textarea[placeholder]',
  '[contenteditable="true"]',
];
/**
 * 发送按钮候选选择器。
 * 实测结构：发送按钮是 **svg**（`.messageMsgInputpublishBtn.e2e-send-msg`），不是 button，
 * 因此 `button:has-text("发送")` 永远命中不了。
 */
const SEND_SELECTORS = [
  '.e2e-send-msg',
  '.messageMsgInputpublishBtn',
  '[data-e2e="send-msg"]',
  '.send-btn',
  '.chat-send',
];
/** 会话项容器与其中显示好友名的节点（实测 data-e2e + 标题 div）。 */
const SESSION_ITEM_SELECTOR = '[data-e2e="conversation-item"]';
const SESSION_TITLE_SELECTOR = '.conversationConversationItemtitle';
/** 打开页面时可能出现的「是否保存登录信息」对话框，需先关闭否则遮挡点击。 */
const TRUST_DIALOG_CONFIRM = '.trust-login-dialog-button-confirm';
/** 验证码元素候选。 */
const CAPTCHA_SELECTORS = [
  '.captcha-wrap',
  '.verify-container',
  'iframe[src*="captcha"]',
  '.secsdk-captcha',
];

/**
 * 转义拼入选择器字符串字面量的值（防引号/反斜杠注入破坏选择器语义）。
 * 仅用于属性值与 :has-text() 参数，不改变选择器结构。
 */
function escapeSelectorValue(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export class DouyinWebAdapter implements PlatformAdapter {
  public readonly name = 'douyin' as const;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private readonly headless: boolean;
  private readonly timeoutMs: number;
  private readonly screenshotDir: string;

  constructor(ctx: AdapterContext = {}) {
    this.headless = ctx.headless ?? true;
    this.timeoutMs = ctx.timeoutMs ?? DEFAULT_TIMEOUT;
    this.screenshotDir = ctx.screenshotDir ?? DEFAULT_SCREENSHOT_DIR;
  }

  /** 启动浏览器并注入登录态（storage_state JSON）。 */
  async login(storageState: unknown): Promise<void> {
    const { chromium } = await import('playwright').catch(() => {
      throw new AppError(
        ErrorCode.ADAPTER_ERROR,
        '未安装 playwright，请先执行 `npm i playwright && npx playwright install chromium`',
        500,
      );
    });
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    this.context = await this.browser.newContext({
      storageState: storageState as never,
      viewport: { width: 1280, height: 900 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    });
    this.page = await this.context.newPage();
    await this.page.goto(DOUYIN_CHAT_URL, { waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(1500);
    await this.dismissTrustDialog();
    // ⚠️ 必须等待会话列表真正渲染完成：抖音聊天页是 SPA，首屏渲染常需数秒，
    //    仅靠固定 sleep 会在列表出现前就去定位，导致会话/输入框/发送按钮全部找不到。
    await this.waitForConversationList();
    log.info('douyin context initialized with injected storage_state');
  }

  /** 等待会话列表渲染完成（最多 timeoutMs，超时不抛出，由后续定位逻辑给出明确错误）。 */
  private async waitForConversationList(): Promise<void> {
    if (!this.page) return;
    try {
      await this.page.waitForSelector(SESSION_ITEM_SELECTOR, { timeout: this.timeoutMs });
      await this.page.waitForTimeout(1000); // 列表出现后再等一拍，等首屏其它区块稳定
      log.info('conversation list rendered');
    } catch {
      log.warn(
        { timeoutMs: this.timeoutMs },
        'conversation list did not render in time（可能未登录或页面结构变化）',
      );
    }
  }

  /**
   * 关闭「是否保存登录信息」对话框（实测存在，会遮挡后续点击）。
   * 这属于正常界面交互，不涉及绕过任何安全校验。
   */
  private async dismissTrustDialog(): Promise<void> {
    if (!this.page) return;
    try {
      const btn = this.page.locator(TRUST_DIALOG_CONFIRM).first();
      if ((await btn.count()) > 0 && (await btn.isVisible())) {
        await btn.click();
        await this.page.waitForTimeout(1000);
        log.info('trust-login-dialog dismissed');
      }
    } catch {
      /* 无该对话框或点击失败均忽略 */
    }
  }

  /**
   * 定位并点开目标好友的会话。
   * 实测：会话项 `[data-e2e="conversation-item"]`，好友名在其内部
   * `.conversationConversationItemtitle` 中，因此用 hasText 过滤（按文本匹配，无需选择器转义）。
   */
  private async openConversation(targetId: string): Promise<boolean> {
    if (!this.page) return false;
    try {
      const item = this.page
        .locator(SESSION_ITEM_SELECTOR)
        .filter({
          has: this.page.locator(SESSION_TITLE_SELECTOR, { hasText: targetId }),
        })
        .first();
      if ((await item.count()) === 0) {
        log.warn({ targetId }, 'conversation item not found');
        return false;
      }
      await item.click();
      await this.page.waitForTimeout(1200);
      // 聊天输入框仅在选中会话后挂载，需等它出现（超时不抛出，交由上层给出明确错误）
      await this.page
        .waitForSelector(INPUT_SELECTORS[0], { timeout: 15_000 })
        .catch(() => log.warn('chat editor did not mount in time'));
      return true;
    } catch (e) {
      log.warn({ err: String(e), targetId }, 'openConversation failed');
      return false;
    }
  }

  async checkLoginState(): Promise<LoginState> {
    if (!this.context || !this.page) return 'unknown';
    try {
      const url = this.page.url();
      if (url.includes('login') || url.includes('passport')) return 'expired';
      // 可靠判定：Cookie 中的登录态凭证 sessionid / sessionid_ss。
      // 不用页面元素：抖音 DOM 结构多变、节点类名不可预测，据此判定会误报 expired
      // 并导致整个任务被暂停（曾在真实环境踩过）。
      const cookies = await this.context.cookies('https://www.douyin.com');
      const hasSession = cookies.some(
        (c) => c.name === 'sessionid' || c.name === 'sessionid_ss',
      );
      return hasSession ? 'ok' : 'expired';
    } catch {
      return 'unknown';
    }
  }

  /**
   * 验证码检测。
   * ⚠️ 必须判断「元素真的可见」而非仅存在：抖音页面常预置隐藏的验证码容器节点，
   *    只按 count() 判定会误报，进而导致整个任务被暂停（曾在真实环境踩过）。
   */
  async detectCaptcha(): Promise<boolean> {
    if (!this.page) return false;
    for (const sel of CAPTCHA_SELECTORS) {
      try {
        const loc = this.page.locator(sel).first();
        if ((await loc.count()) === 0) continue;
        if (await loc.isVisible()) {
          log.warn({ sel }, 'visible captcha element detected');
          return true;
        }
      } catch {
        /* 忽略单个选择器错误 */
      }
    }
    return false;
  }

  async sendMessage(targetId: string, content: string): Promise<SendOutcome> {
    if (!this.page) {
      return { ok: false, errorCode: 'ADAPTER_ERROR', captcha: false };
    }
    try {
      // 1) 打开与目标的好友会话
      await this.openConversation(targetId);

      // 2) 验证码优先检测
      if (await this.detectCaptcha()) {
        log.warn('captcha detected during send');
        await this.captureFailureSnapshot('captcha-before-input');
        return { ok: false, captcha: true, errorCode: 'CAPTCHA_REQUIRED' };
      }

      // 3) 定位输入框（Slate contenteditable）并以逐字敲击输入
      const input = await this.locateFirst(this.page, INPUT_SELECTORS);
      if (!input) {
        await this.captureFailureSnapshot('input-not-found');
        return { ok: false, errorCode: 'ADAPTER_ERROR' };
      }
      await input.click();
      // contenteditable 不支持 fill()；用全选后逐字输入（pressSequentially 为 Locator 的正确 API，
      // 旧代码的 input.type() 只存在于 ElementHandle，会直接抛错导致发送失败）
      await this.page.keyboard.press('Control+A');
      await input.pressSequentially(content, { delay: 30 });

      // 4) 发送（找不到发送按钮必须报错，严禁假成功——否则会误标记 streak 并漏发）
      const sendBtn = await this.locateFirst(this.page, SEND_SELECTORS);
      if (!sendBtn) {
        log.error('send button not found');
        await this.captureFailureSnapshot('send-btn-not-found');
        return { ok: false, errorCode: 'ADAPTER_ERROR', captcha: false };
      }
      await sendBtn.click();
      await this.page.waitForTimeout(600);

      if (await this.detectCaptcha()) {
        await this.captureFailureSnapshot('captcha-after-send');
        return { ok: false, captcha: true, errorCode: 'CAPTCHA_REQUIRED' };
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error({ err: msg }, 'sendMessage failed');
      await this.captureFailureSnapshot('exception');
      return { ok: false, errorCode: 'NETWORK', captcha: false };
    }
  }

  /**
   * 链路探测：真实打开会话页，验证「会话 / 输入框 / 发送按钮」三要素能否定位。
   * ⚠️ 绝不点击发送按钮——Dry Run 只验证不发送。
   */
  async probe(targetId: string): Promise<AdapterProbeResult> {
    if (!this.page) {
      return {
        sessionFound: false,
        inputFound: false,
        sendButtonFound: false,
        ok: false,
        reason: '页面未初始化（适配器未登录）',
      };
    }
    try {
      // 会话项按「内部标题文本」匹配（实测结构）
      const item = this.page
        .locator(SESSION_ITEM_SELECTOR)
        .filter({
          has: this.page.locator(SESSION_TITLE_SELECTOR, { hasText: targetId }),
        })
        .first();
      const sessionFound = (await item.count()) > 0;
      if (sessionFound) {
        await item.click();
        await this.page.waitForTimeout(1200);
      }

      const input = await this.locateFirst(this.page, INPUT_SELECTORS);
      const sendBtn = await this.locateFirst(this.page, SEND_SELECTORS);
      const result: AdapterProbeResult = {
        sessionFound,
        inputFound: !!input,
        sendButtonFound: !!sendBtn,
        ok: sessionFound && !!input && !!sendBtn,
      };
      if (!result.ok) {
        const missing: string[] = [];
        if (!sessionFound) missing.push(`会话(${targetId})`);
        if (!input) missing.push('输入框');
        if (!sendBtn) missing.push('发送按钮');
        // 附带现场诊断，避免排障靠猜
        result.reason = `未能定位：${missing.join('、')}。${await this.collectDiagnostics()}`;
        await this.captureFailureSnapshot('dry-run-probe');
      }
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await this.captureFailureSnapshot('probe-exception');
      return {
        sessionFound: false,
        inputFound: false,
        sendButtonFound: false,
        ok: false,
        reason: `探测异常：${msg}`,
      };
    }
  }

  async close(): Promise<void> {
    try {
      await this.context?.close();
      await this.browser?.close();
    } finally {
      this.page = null;
      this.context = null;
      this.browser = null;
    }
  }

  /**
   * 采集现场诊断信息（排障用）：页面地址、登录 Cookie、会话数量与全部会话名。
   * 失败时随错误返回，让「为什么找不到」一目了然，不必再靠猜。
   */
  private async collectDiagnostics(): Promise<string> {
    if (!this.page || !this.context) return '无法采集诊断信息（页面未初始化）';
    try {
      const url = this.page.url();
      let hasSession = false;
      try {
        const cookies = await this.context.cookies('https://www.douyin.com');
        hasSession = cookies.some((c) => c.name === 'sessionid' || c.name === 'sessionid_ss');
      } catch {
        /* 忽略 */
      }
      const titles = await this.page
        .locator(SESSION_TITLE_SELECTOR)
        .allInnerTexts()
        .catch(() => [] as string[]);
      const names = titles.map((t) => t.trim()).filter(Boolean).slice(0, 20);
      return (
        `\n现场诊断：当前页面=${url}；登录Cookie=${hasSession ? '有效' : '缺失/未登录'}；` +
        `会话数=${names.length}；会话名=[${names.join(' | ')}]`
      );
    } catch (e) {
      return `诊断信息采集失败：${e instanceof Error ? e.message : String(e)}`;
    }
  }

  /**
   * 列举当前账号的会话列表（好友自动提取）。
   * 复用 sendJob 已验证的选择器（SESSION_ITEM_SELECTOR / SESSION_TITLE_SELECTOR），
   * 读取所有会话标题，去重去空白后返回；上限 50 条防止极端账号拖垮响应。
   */
  async listConversations(): Promise<ConversationSummary[]> {
    if (!this.page) {
      throw new AppError(
        ErrorCode.ADAPTER_ERROR,
        '浏览器未就绪，无法读取会话列表',
        500,
      );
    }
    // 确保会话列表已渲染（与 login() 后的等待策略一致）
    await this.page
      .waitForSelector(SESSION_ITEM_SELECTOR, { timeout: this.timeoutMs })
      .catch(() => undefined);
    await this.page.waitForTimeout(1000);

    const titles = await this.page
      .locator(SESSION_TITLE_SELECTOR)
      .allInnerTexts()
      .catch(() => [] as string[]);

    const seen = new Set<string>();
    const items: ConversationSummary[] = [];
    for (const raw of titles) {
      const title = raw.trim();
      if (!title || seen.has(title)) continue;
      seen.add(title);
      items.push({ title });
      if (items.length >= 50) break;
    }
    return items;
  }

  /** 在候选选择器中返回第一个存在的定位器。 */
  private async locateFirst(
    page: Page,
    selectors: string[],
  ): Promise<import('playwright').Locator | null> {
    for (const sel of selectors) {
      try {
        const loc = page.locator(sel).first();
        if (await loc.count()) return loc;
      } catch {
        /* 跳过无效选择器 */
      }
    }
    return null;
  }

  /**
   * 发送失败时的页面截图存证（借鉴同类项目失败诊断实践）。
   * 截图自身失败绝不吞掉原始错误：任何异常仅记日志并返回 null。
   * @param reason 失败原因短标签（用于文件名，如 input-not-found / captcha-after-send）。
   * @returns 截图文件绝对路径；截图失败返回 null。
   */
  private async captureFailureSnapshot(reason: string): Promise<string | null> {
    if (!this.page) return null;
    try {
      mkdirSync(this.screenshotDir, { recursive: true });
      const file = join(this.screenshotDir, `douyin-${reason}-${Date.now()}.png`);
      await this.page.screenshot({ path: file, fullPage: true });
      log.warn({ file, reason }, 'failure snapshot saved for diagnosis');
      return file;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn({ err: msg, reason }, 'failure snapshot capture skipped');
      return null;
    }
  }
}
