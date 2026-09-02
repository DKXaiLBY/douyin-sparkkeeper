/**
 * 扫码登录服务（单例）：服务端启动一次 Chromium 打开抖音聊天页，把登录二维码截图回传前端；
 * 用户用手机抖音扫码后，通过 **Cookie 中的 sessionid / sessionid_ss** 判定登录成功，
 * 随即导出 Playwright storage_state 交给上层（路由）加密落盘。
 *
 * 设计要点：
 * 1. 单例：同一时刻只允许一个扫码会话。重复 start 会先取消上一个会话
 *    （对应前端「重新获取二维码」按钮的语义）。
 * 2. 登录成功判定复用 DouyinWebAdapter.checkLoginState 的**硬指标**：
 *    context.cookies('https://www.douyin.com') 中存在 sessionid / sessionid_ss。
 *    **绝不用页面元素 / 类名判定**——抖音 DOM 频繁改版，靠元素判定会误报，本项目已踩过坑。
 * 3. 二维码会定时刷新，因此每次 getStatus() 都重新截图，前端每次拿到的都是最新二维码。
 * 4. 健壮性（关键防御）：
 *    - 任何异常都不能让进程崩溃：所有 Playwright 调用都在 try/catch 内；
 *    - 截图失败**不能吞掉真正的错误**：失败会累计，达到阈值才置 'error'，
 *      且错误信息是真实异常信息（不是一句空泛的「二维码获取失败」）；
 *    - 浏览器在 success / expired / error / cancelled / 超时 等**所有退出路径**上都会被 close()。
 *
 * ⚠️ 验证状态：本文件的 Playwright 交互路径「需在有 Chromium 的真实环境验证」。
 *    当前开发沙箱无浏览器二进制，仅验证了错误分支（未安装 Chromium → 明确中文错误）
 *    与纯逻辑（Cookie 判定、错误映射、过期计算）的单元测试。
 */

import type { Browser, BrowserContext, Page } from 'playwright';
import { AppError, ErrorCode } from '../lib/errors.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('qr-login');

/** 扫码会话状态机。 */
export type QrLoginStatus =
  | 'idle' // 未开始
  | 'starting' // 浏览器启动中 / 页面加载中
  | 'waiting' // 二维码就绪，等待扫描
  | 'scanned' // 已扫码，等待手机端确认（**仅用于 UI 提示，不参与成功判定**）
  | 'success' // 登录成功，storage_state 已捕获
  | 'expired' // 超过会话时限未成功
  | 'error' // 启动/运行异常
  | 'cancelled'; // 用户主动取消

/** 对外暴露的会话快照。 */
export interface QrLoginSnapshot {
  status: QrLoginStatus;
  /** 二维码 PNG 的 dataURL（data:image/png;base64,...）。二维码会刷新，每次重新截取。 */
  qr?: string;
  /** 面向用户的中文提示。 */
  message?: string;
  /**
   * 启动进度（0-100，整数）。基于真实阶段（启动浏览器/打开页面/渲染二维码），
   * 不是假百分比；二维码就绪后恒为 100。
   */
  progress?: number;
}

/** 抖音聊天页地址（与 DouyinWebAdapter 保持一致）。 */
const DOUYIN_CHAT_URL = 'https://www.douyin.com/chat';
/** 判定登录态的 Cookie 域名（与 DouyinWebAdapter.checkLoginState 一致）。 */
const DOUYIN_COOKIE_URL = 'https://www.douyin.com';
/** 登录态 Cookie 名（可靠硬指标）。 */
const SESSION_COOKIE_NAMES = ['sessionid', 'sessionid_ss'] as const;

/** 会话总时限：起始后 5 分钟未成功则自动关闭并置 expired。 */
const DEFAULT_SESSION_TIMEOUT_MS = 5 * 60 * 1000;
/** 页面首次加载后等待二维码渲染的上限（不是固定 sleep，用 waitForSelector 等真实渲染）。 */
const QR_READY_TIMEOUT_MS = 20_000;
/** 二维码渲染出来之后的额外稳定时间（二维码图片本身还有一段加载/动画）。 */
const QR_SETTLE_MS = 1200;
/** 单次元素截图超时。 */
const SHOT_TIMEOUT_MS = 5_000;
/** 连续截图失败多少次才判定为真正的错误（避免偶发抖动误报）。 */
const MAX_CONSECUTIVE_SHOT_FAILURES = 3;
/** 二维码元素的最小边长：小于该值视为无关小图标（如 1x1 埋点像素），跳过。 */
const MIN_QR_SIZE_PX = 80;
/** 登录成功后 storage_state 明文在内存中的最长保留时间（防御：上层未取走则主动丢弃）。 */
const STORAGE_STATE_TTL_MS = 60_000;

/** 等待「登录页/二维码区域出现」的选择器（用于 waitForSelector，逗号分隔表示任一命中）。 */
const QR_READY_SELECTOR = [
  'iframe[src*="passport"]',
  '.login-container iframe',
  '#animate_qrcode_container',
  '#douyin_login_comp_scan_code',
  '[id*="qrcode" i]',
  '[class*="qrcode" i]',
  '[class*="qr-code" i]',
  'canvas',
  '.login',
  '#douyin_login_comp_flat_panel',
].join(',');

/** passport 登录 iframe 内部的二维码元素候选（按 spec 顺序尝试）。 */
const PASSPORT_FRAME_QR_SELECTORS = ['img', 'canvas', '[class*="qrcode" i]', '[class*="qr-code" i]'];
/** 主页面（非 iframe）的二维码元素候选（按 spec 顺序尝试；补充抖音当前 DOM 的 id/父容器）。 */
const PAGE_QR_SELECTORS = [
  '#animate_qrcode_container img', // 抖音当前结构：二维码图片父容器 id 含 qrcode
  '#douyin_login_comp_scan_code img',
  '[id*="qrcode" i]',
  '[class*="qrcode" i]',
  '[class*="qr-code" i]',
  'canvas',
  'img[src*="qrcode" i]',
  '.login',
  '#douyin_login_comp_flat_panel',
];
/** 兜底：整页登录容器（当上面都定位不到时，截取它比截取整个视口更聚焦）。 */
const LOGIN_CONTAINER_IFRAME_SELECTOR = '.login-container iframe';
/** 已扫码待确认的界面文案（**仅用于 UI 提示**，绝不能作为登录成功依据）。 */
const SCANNED_HINT_PATTERN = /扫描成功|扫码成功|已扫描|请在手机上确认|请在手机端确认|确认登录/i;

/** 需要持续轮询（浏览器仍在跑）的状态。 */
const ACTIVE_STATUSES: ReadonlySet<QrLoginStatus> = new Set<QrLoginStatus>([
  'starting',
  'waiting',
  'scanned',
]);

/**
 * 判定 Cookie 列表中是否存在抖音登录态凭证。
 * 与 DouyinWebAdapter.checkLoginState 完全一致的硬指标，抽成纯函数以便单元测试。
 */
export function hasDouyinSession(cookies: ReadonlyArray<{ name: string }>): boolean {
  return cookies.some((c) => (SESSION_COOKIE_NAMES as readonly string[]).includes(c.name));
}

/** 会话是否已超时应过期（纯函数，便于单元测试）。 */
export function isSessionExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

/**
 * 把 Playwright 启动异常映射为面向用户的中文 AppError。
 * 场景一：浏览器二进制未下载（本沙箱就是这个情况）→ 给出可直接复制的安装命令。
 * 场景二：其它启动失败 → 保留原始错误首行，便于排障。
 */
export function describePlaywrightLaunchError(e: unknown): AppError {
  const raw = e instanceof Error ? e.message : String(e);
  const lower = raw.toLowerCase();
  const firstLine = raw.split('\n').find((l) => l.trim().length > 0) ?? raw;

  const missingBrowser =
    lower.includes("executable doesn't exist") ||
    lower.includes('npx playwright install') ||
    lower.includes('please run the following command') ||
    lower.includes('missing browser') ||
    lower.includes('browser executable') ||
    lower.includes('no usable sandbox');

  if (missingBrowser) {
    return new AppError(
      ErrorCode.ADAPTER_ERROR,
      '未检测到 Chromium 浏览器（Playwright 依赖未安装二进制）。' +
        '请在 server 目录执行：`npx playwright install chromium`（首次约需下载 150MB），安装完成后再重试扫码登录。',
      500,
      { detail: firstLine, fix: 'npx playwright install chromium' },
    );
  }
  return new AppError(ErrorCode.ADAPTER_ERROR, `启动浏览器失败：${firstLine}`, 500, {
    detail: raw.slice(0, 500),
  });
}

/** 单次扫码登录会话管理（进程内单例使用：见文件末尾 qrLoginService）。 */
export class QrLoginService {
  private status: QrLoginStatus = 'idle';
  private message = '';
  private progress = 0;
  private qrDataUrl: string | null = null;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  /** 启动中标记：防止前端连点导致并发 launch。 */
  private launching = false;
  private expiresAt = 0;
  /** 连续截图失败次数。 */
  private shotFailures = 0;
  /** 登录成功后捕获的 storage_state 明文（仅内存，取走后立刻清空）。 */
  private storageStateText: string | null = null;
  private storageStateCapturedAt = 0;
  private readonly timeoutMs: number;
  private readonly defaultHeadless: boolean;

  constructor(opts: { timeoutMs?: number; headless?: boolean } = {}) {
    this.timeoutMs = opts.timeoutMs ?? readTimeoutFromEnv();
    this.defaultHeadless = opts.headless ?? readHeadlessFromEnv();
  }

  // ---------------- 对外 API ----------------

  /**
   * 启动一次扫码会话：立即返回（status='starting' + progress），浏览器启动在后台进行。
   * 前端轮询 getStatus() 拿到实时进度（启动浏览器 10% → 打开页面 40% → 等渲染 80% → 二维码就绪 100%）。
   * 会先取消上一次会话（对应「重新获取二维码」）。
   * @param opts.headless 覆盖默认无头模式（默认读 QR_LOGIN_HEADLESS，缺省 true）。
   */
  start(opts: { headless?: boolean } = {}): QrLoginSnapshot {
    if (this.launching) {
      // 已在启动中（前端连点）：直接返回当前快照，不重复拉起浏览器
      return this.snapshot();
    }
    // 旧浏览器在后台异步关闭（closeBrowser 会先把引用置 null 再 close 旧实例，
    // 因此不会影响下面重新赋值的新会话）；**不要**在这里 await cancel()——
    // 那会把 status 置为 cancelled 并与新会话产生竞态（已踩坑：轮询一直显示 cancelled）。
    void this.closeBrowser().catch(() => undefined);

    // 同步重置全部会话字段，保证返回的快照就是新会话的初始状态
    this.status = 'starting';
    this.progress = 5;
    this.message = '正在启动浏览器…';
    this.qrDataUrl = null;
    this.shotFailures = 0;
    this.storageStateText = null;
    this.expiresAt = Date.now() + this.timeoutMs;
    this.launching = true;
    log.info({ timeoutMs: this.timeoutMs }, 'qr login session started');

    // 后台执行启动流程：不阻塞 HTTP 响应，进度通过 status 轮询暴露
    void this.launchInBackground(opts.headless ?? this.defaultHeadless);
    return this.snapshot();
  }

  /**
   * 查询当前会话状态：每次都重新截取二维码（二维码会定时刷新），并检测登录态。
   * 登录成功后立即导出 storage_state 并关闭浏览器；明文由 consumeStorageState() 取走。
   */
  async getStatus(): Promise<QrLoginSnapshot> {
    // 1) 超时保护：所有活跃状态都受总时限约束（兜底防止浏览器长期挂留）
    if (ACTIVE_STATUSES.has(this.status) && isSessionExpired(this.expiresAt, Date.now())) {
      log.warn({ timeoutMs: this.timeoutMs }, 'qr login session expired');
      await this.closeBrowser();
      this.status = 'expired';
      this.message = `二维码已过期（超过 ${Math.round(this.timeoutMs / 60000)} 分钟未完成扫码），请重新获取`;
      return this.snapshot();
    }

    // 2) 丢弃超时未被取走的明文 storage_state（防御：不把登录态长期留在内存）
    if (this.storageStateText && Date.now() - this.storageStateCapturedAt > STORAGE_STATE_TTL_MS) {
      log.warn('discarding unconsumed storage_state (ttl exceeded)');
      this.storageStateText = null;
    }

    // 3) 活跃会话：刷新二维码 + 检测登录
    if (this.status === 'waiting' || this.status === 'scanned') {
      await this.refresh();
    }
    return this.snapshot();
  }

  /**
   * 取消会话：关闭浏览器并清理状态。
   * 无论当前处于哪个状态（含 idle），调用后一律置为 'cancelled'——行为可预测，
   * 前端「取消扫码」与 start() 内部复用同一个清理入口。
   */
  async cancel(): Promise<QrLoginSnapshot> {
    await this.closeBrowser();
    this.status = 'cancelled';
    this.message = '已取消扫码登录';
    this.qrDataUrl = null;
    this.storageStateText = null;
    return this.snapshot();
  }

  /**
   * 取走登录成功后捕获的 storage_state 明文（Playwright storage_state JSON 字符串）。
   * 取走即从内存清空，保证同一份登录态只会被落盘一次。
   */
  consumeStorageState(): string | null {
    const text = this.storageStateText;
    this.storageStateText = null;
    if (text) log.info('storage_state consumed by caller');
    return text;
  }

  // ---------------- 内部实现 ----------------

  private snapshot(): QrLoginSnapshot {
    const snap: QrLoginSnapshot = { status: this.status };
    if (this.qrDataUrl) snap.qr = this.qrDataUrl;
    if (this.message) snap.message = this.message;
    snap.progress = this.progress;
    return snap;
  }

  /** 加载 playwright 模块。未安装时给出明确中文指引。 */
  private async loadPlaywright(): Promise<typeof import('playwright')> {
    try {
      return await import('playwright');
    } catch (e) {
      throw new AppError(
        ErrorCode.ADAPTER_ERROR,
        '未安装 playwright，请先执行 `npm i playwright && npx playwright install chromium`',
        500,
        { detail: e instanceof Error ? e.message : String(e) },
      );
    }
  }

  /**
   * 后台启动流程（由 start() 触发，不阻塞 HTTP 响应）。
   * 每完成一个真实阶段就更新 progress，前端轮询即可看到确定的百分比进度。
   * 任何异常都在此收口：关浏览器 + 明确中文错误，绝不让异常逃逸到 unhandledRejection。
   */
  private async launchInBackground(headless: boolean): Promise<void> {
    try {
      const pw = await this.loadPlaywright();
      this.progress = 15;
      this.message = '正在启动浏览器…';

      let browser: Browser;
      try {
        browser = await pw.chromium.launch({
          headless,
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        });
      } catch (e) {
        throw describePlaywrightLaunchError(e);
      }
      this.browser = browser;
      this.progress = 40;
      this.message = '正在打开抖音登录页…';

      this.context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      });
      const page = await this.context.newPage();
      this.page = page;

      await page.goto(DOUYIN_CHAT_URL, {
        waitUntil: 'domcontentloaded',
        timeout: Math.max(QR_READY_TIMEOUT_MS, 30_000),
      });
      this.progress = 65;
      this.message = '正在等待二维码渲染…';

      // 不用固定 sleep 硬等：用 waitForSelector 等登录区/二维码真正渲染出来（SPA 首屏慢且不稳定）
      await page
        .waitForSelector(QR_READY_SELECTOR, { timeout: QR_READY_TIMEOUT_MS })
        .catch(() => log.warn('qr region selector not matched within timeout（页面结构可能已改版）'));
      await page.waitForTimeout(QR_SETTLE_MS);
      this.progress = 85;
      this.message = '正在生成二维码…';
      log.info({ url: page.url() }, 'login page ready');

      const qr = await this.captureQrCode(this.page);
      if (qr) this.qrDataUrl = qr;

      this.status = 'waiting';
      this.progress = 100;
      this.message = qr ? '请用抖音 App 扫描二维码' : '正在加载二维码…';
    } catch (e) {
      // 启动失败（最常见：未安装 chromium）→ 关浏览器 + 明确中文错误，绝不让异常逃逸
      await this.closeBrowser();
      const appErr = e instanceof AppError ? e : describePlaywrightLaunchError(e);
      this.status = 'error';
      this.message = appErr.message;
      this.progress = 100;
      log.error({ err: e instanceof Error ? e.message : String(e) }, 'qr login start failed');
    } finally {
      this.launching = false;
    }
  }

  /** 刷新一次：先判登录成功，否则重截二维码 + 探测「已扫待确认」。 */
  private async refresh(): Promise<void> {
    const page = this.page;
    const context = this.context;
    if (!page || !context) {
      // 浏览器已关但状态仍是活跃态：纠正为 error，避免前端一直空转轮询
      this.status = 'error';
      this.message = '扫码会话已中断，请重新获取二维码';
      return;
    }

    try {
      // 1) 登录成功判定（硬指标：Cookie），绝不用页面元素/类名判定
      if (await this.hasSession(context)) {
        await this.onLoginSuccess(context);
        return;
      }

      // 2) 未登录 → 重截二维码（二维码会刷新，每次都重新截）
      let shotError: unknown = null;
      try {
        const qr = await this.captureQrCode(page);
        if (qr) {
          this.qrDataUrl = qr;
          this.shotFailures = 0;
        } else {
          this.shotFailures += 1;
        }
      } catch (e) {
        // 截图失败：记录原始错误，不吞掉；累计到阈值才升级为 error
        shotError = e;
        this.shotFailures += 1;
      }

      if (this.shotFailures >= MAX_CONSECUTIVE_SHOT_FAILURES && shotError) {
        const raw = shotError instanceof Error ? shotError.message : String(shotError);
        log.error({ err: raw }, 'qr screenshot failed repeatedly');
        await this.closeBrowser();
        this.status = 'error';
        this.message = `获取二维码失败：${raw.split('\n')[0]}`;
        return;
      }

      // 3) 「已扫待确认」探测：纯 UI 提示，不参与成功判定
      this.status = (await this.detectScanned(page)) ? 'scanned' : 'waiting';
      this.message =
        this.status === 'scanned'
          ? '扫描成功，请在手机上确认登录…'
          : '请用抖音 App 扫描二维码';
    } catch (e) {
      // refresh 的兜底：任何未预期异常都不能让进程崩溃
      const raw = e instanceof Error ? e.message : String(e);
      log.error({ err: raw }, 'qr status refresh failed');
      await this.closeBrowser();
      this.status = 'error';
      this.message = `扫码会话异常：${raw.split('\n')[0]}`;
    }
  }

  /** Cookie 判定登录态（硬指标）。 */
  private async hasSession(context: BrowserContext): Promise<boolean> {
    try {
      const cookies = await context.cookies(DOUYIN_COOKIE_URL);
      return hasDouyinSession(cookies);
    } catch (e) {
      // Cookie 读取失败不能当成「已登录」也不能当成「失败」，仅记日志并返回 false
      log.warn({ err: e instanceof Error ? e.message : String(e) }, 'read douyin cookies failed');
      return false;
    }
  }

  /** 登录成功：导出 storage_state → 关闭浏览器。 */
  private async onLoginSuccess(context: BrowserContext): Promise<void> {
    try {
      const state = await context.storageState();
      this.storageStateText = JSON.stringify(state);
      this.storageStateCapturedAt = Date.now();
      this.status = 'success';
      this.message = '登录成功，凭证已获取';
      this.qrDataUrl = null;
      log.info('qr login success: storage_state captured');
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      log.error({ err: raw }, 'export storage_state failed');
      this.status = 'error';
      this.message = `登录已成功，但导出登录态失败：${raw.split('\n')[0]}`;
    } finally {
      // 无论导出成功与否都要关浏览器：登录态已拿到（或已失败），没必要再挂着 Chromium
      await this.closeBrowser();
    }
  }

  /**
   * 截取二维码，返回 dataURL；全部策略失败时返回 null（由上层决定是否重试）。
   *
   * 定位顺序（按 spec）：
   *   1. iframe[src*="passport"] 内的 img/canvas
   *   2. .login-container iframe（整块截）
   *   3. [class*="qrcode" i]  4. [class*="qr-code" i]  5. canvas
   *   6. img[src*="qrcode" i]  7. .login 容器
   *   8. 兜底：整个视口
   */
  private async captureQrCode(page: Page | null): Promise<string | null> {
    if (!page) return null;

    // 1) passport 登录 iframe 内部元素
    for (const frame of page.frames()) {
      if (!/passport/i.test(frame.url())) continue;
      for (const sel of PASSPORT_FRAME_QR_SELECTORS) {
        const shot = await this.shoot(frame.locator(sel).first(), `frame:${sel}`);
        if (shot) return shot;
      }
    }

    // 2) .login-container 里的 iframe（整块截取，比逐元素更稳）
    const containerIframe = page.locator(LOGIN_CONTAINER_IFRAME_SELECTOR).first();
    const iframeShot = await this.shoot(containerIframe, LOGIN_CONTAINER_IFRAME_SELECTOR);
    if (iframeShot) return iframeShot;

    // 3~7) 主页面候选选择器（按顺序尝试）
    for (const sel of PAGE_QR_SELECTORS) {
      const shot = await this.shoot(page.locator(sel).first(), sel);
      if (shot) return shot;
    }

    // 8) 兜底：整个视口
    try {
      const buf = await page.screenshot({ type: 'png', timeout: SHOT_TIMEOUT_MS });
      log.warn('qr code: fell back to full-viewport screenshot');
      return toDataUrl(buf);
    } catch (e) {
      log.warn({ err: e instanceof Error ? e.message : String(e) }, 'viewport screenshot failed');
      return null;
    }
  }

  /**
   * 对单个定位器截图。元素不存在 / 不可见 / 尺寸过小 → 返回 null（继续尝试下一个候选）。
   * 真正的异常（浏览器崩溃等）会向上抛出，由调用方累计并升级为 error。
   */
  private async shoot(
    locator: import('playwright').Locator,
    tag: string,
  ): Promise<string | null> {
    try {
      if ((await locator.count()) === 0) return null;
      if (!(await locator.isVisible())) return null;
      const box = await locator.boundingBox();
      if (!box || box.width < MIN_QR_SIZE_PX || box.height < MIN_QR_SIZE_PX) return null;
      const buf = await locator.screenshot({
        type: 'png',
        timeout: SHOT_TIMEOUT_MS,
        animations: 'disabled',
      });
      log.debug({ tag }, 'qr element captured');
      return toDataUrl(buf);
    } catch (e) {
      // 「元素在截图瞬间消失」这类竞态很常见，只记日志并跳到下一个候选；
      // 但若连 count()/isVisible() 都失败（通常是浏览器已关闭），把异常抛给上层处理。
      const raw = e instanceof Error ? e.message : String(e);
      if (/closed|crashed|target page/i.test(raw)) throw e;
      log.debug({ err: raw, tag }, 'qr candidate skipped');
      return null;
    }
  }

  /**
   * 探测「已扫码待确认」的界面文案。
   * ⚠️ 仅用于 UI 文案提示，**绝不能作为登录成功依据**：
   *    抖音文案随时可能改，误判会让用户以为登录成功。
   */
  private async detectScanned(page: Page): Promise<boolean> {
    try {
      for (const frame of page.frames()) {
        const text = await frame.locator('body').innerText().catch(() => '');
        if (text && SCANNED_HINT_PATTERN.test(text)) return true;
      }
    } catch {
      /* 探测失败按未扫描处理 */
    }
    return false;
  }

  /** 关闭浏览器并清空引用。所有退出路径都必须调用它。 */
  private async closeBrowser(): Promise<void> {
    const browser = this.browser;
    const context = this.context;
    this.page = null;
    this.context = null;
    this.browser = null;
    try {
      await context?.close();
      await browser?.close();
      log.info('qr login browser closed');
    } catch (e) {
      log.warn({ err: e instanceof Error ? e.message : String(e) }, 'close browser failed');
    }
  }
}

/** PNG Buffer → dataURL。 */
function toDataUrl(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/** 从环境变量读取会话时限（毫秒）。 */
function readTimeoutFromEnv(): number {
  const raw = process.env.QR_LOGIN_TIMEOUT_MS;
  if (!raw) return DEFAULT_SESSION_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 1000 ? n : DEFAULT_SESSION_TIMEOUT_MS;
}

/** 从环境变量读取无头模式（默认 true；QR_LOGIN_HEADLESS=0/false/no → 有头）。 */
function readHeadlessFromEnv(): boolean {
  const raw = (process.env.QR_LOGIN_HEADLESS ?? '').trim().toLowerCase();
  if (!raw) return true;
  return !(raw === '0' || raw === 'false' || raw === 'no');
}

/** 进程内单例：所有路由共用同一个扫码会话。 */
export const qrLoginService = new QrLoginService();
