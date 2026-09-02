/**
 * 全局共享领域类型（后端）。
 * 前端镜像见 web/src/api/types.ts（不跨仓 import，避免耦合）。
 */

/** 好友等级（由系统按连续天数与风险推断，展示用，不自承平台权威）。 */
export type FriendLevel = '挚友' | '聊愈' | '普通' | '危险';

/** 好友（火花对象）。 */
export interface Friend {
  id: string;
  nickname: string;
  /** 平台会话/用户标识，由 adapter 内部使用（抖音为会话 id）。 */
  platformId: string;
  remark?: string;
  streakDays: number;
  level: FriendLevel;
  /** 是否纳入自动续火。 */
  enabled: boolean;
  timezone: string;
  lastSentAt?: string;
  /** 距火花熄灭的预计时间（ISO8601）。 */
  nextDueAt: string;
  createdAt: string;
}

export type SendStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/** 发送任务。 */
export interface SendTask {
  id: string;
  friendId: string;
  /** 日期 YYYY-MM-DD。 */
  scheduledFor: string;
  status: SendStatus;
  content: string;
  dryRun: boolean;
  createdAt: string;
  sentAt?: string;
}

/** 发送结果。 */
export interface SendResult {
  id: string;
  taskId: string;
  friendId: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
  durationMs: number;
  captchaDetected: boolean;
  retryCount: number;
  sentAt: string;
}

/** 加密存储形态（绝不明文）。 */
export interface Credential {
  id: string;
  platform: 'douyin';
  iv: string;
  authTag: string;
  ciphertext: string;
  salt: string;
  createdAt: string;
  expiresAt?: string;
}

/** AES-256-GCM 密文块（base64 字段）。 */
export interface EncryptedBlob {
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface SafetyConfig {
  enabled: boolean;
  dailyCap: number;
  delayMinSec: number;
  delayMaxSec: number;
  staggerHours: [number, number];
}

export type LlmProviderName = 'deepseek' | 'glm' | 'openai';

export interface LlmConfig {
  enabled: boolean;
  provider: LlmProviderName;
  baseUrl: string;
  model: string;
  /** 加密后存储，绝不明文。 */
  apiKeyEnc?: string;
}

export type NotifyChannel = 'webhook' | 'telegram' | 'none';

export interface NotifyConfig {
  channel: NotifyChannel;
  webhookUrl?: string;
  telegramToken?: string;
  telegramChatId?: string;
}

export interface ContentConfig {
  /**
   * 自定义文案模板（每项一条；为空数组则使用内置模板）。
   * 支持变量：{nickname} {weekday} {weather} {mood}；未提供的变量原样保留。
   */
  templates: string[];
}

export interface AppConfig {
  port: number;
  dataDir: string;
  platform: PlatformName;
  safetyMode: boolean;
  safety: SafetyConfig;
  llm: LlmConfig;
  notify: NotifyConfig;
  cron: string;
  /** 每日触发模式：fixed=固定时刻；random=错峰窗口内每日随机。 */
  sendMode: 'fixed' | 'random';
  weatherEnabled: boolean;
  passphraseMinLen: number;
  content: ContentConfig;
}

export type PlatformName = 'douyin' | 'mock';

export type NotificationType =
  | 'captcha'
  | 'login_expired'
  | 'send_failed'
  | 'daily_summary';

export interface Notification {
  id: string;
  type: NotificationType;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

/** 仪表盘聚合。 */
export interface DashboardSummary {
  protectedCount: number;
  sentToday: number;
  longestStreak: number;
  successRate30d: number;
  dueToday: DueItem[];
  friends: Friend[];
  heatmap: HeatCell[];
  draftPreview: DraftPreview;
}

export interface DueItem {
  friendId: string;
  nickname: string;
  hoursToExpire: number;
  done: boolean;
}

export interface HeatCell {
  date: string;
  status: 'none' | 'done' | 'missed';
}

export interface DraftPreview {
  friendId: string;
  nickname: string;
  content: string;
  vars: Record<string, string>;
}

export type LoginState = 'ok' | 'expired' | 'captcha' | 'unknown';

export interface SendOutcome {
  ok: boolean;
  errorCode?: string;
  captcha?: boolean;
}

/** 单次发送报告（用于 Dry Run 与真实回执）。 */
export interface SendReportItem {
  friendId: string;
  nickname: string;
  content: string;
  ok: boolean;
  errorCode?: string;
  captcha?: boolean;
  durationMs?: number;
  skipped?: boolean;
  skipReason?: string;
}

export interface SendReport {
  dryRun: boolean;
  triggeredAt: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  captchaDetected: boolean;
  loginState: LoginState;
  paused: boolean;
  /** 暂停的具体原因（登录过期 / 验证码 / 熔断），避免 UI 只报“已暂停”让人一头雾水。 */
  pauseReason?: string;
  items: SendReportItem[];
}

/** 适配器链路探测结果（Dry Run 真实验证用：打开浏览器验证定位，但不点发送）。 */
export interface AdapterProbeResult {
  /** 好友会话是否定位成功。 */
  sessionFound: boolean;
  /** 输入框是否定位成功。 */
  inputFound: boolean;
  /** 发送按钮是否定位成功。 */
  sendButtonFound: boolean;
  /** 三者齐全即为 true。 */
  ok: boolean;
  /** 失败原因（人类可读，直接用于排障与选择器校准）。 */
  reason?: string;
}

/** 运行期可变配置补丁（PUT /api/config）。 */
export interface ConfigPatch {
  safetyMode?: boolean;
  safety?: Partial<SafetyConfig>;
  /** LLM 补丁：apiKey 为一次性明文，后端加密后存储为 apiKeyEnc。 */
  llm?: Partial<LlmConfig> & { apiKey?: string };
  notify?: Partial<NotifyConfig>;
  cron?: string;
  /** 每日触发模式：fixed=固定时刻；random=错峰窗口内每日随机。 */
  sendMode?: 'fixed' | 'random';
  weatherEnabled?: boolean;
  platform?: PlatformName;
  /** 内容配置补丁（自定义文案模板）。 */
  content?: Partial<ContentConfig>;
}

/** 抖音会话摘要（好友自动提取用：登录后从会话列表拉取候选好友名）。 */
export interface ConversationSummary {
  /** 会话显示名（即对方昵称，作为好友的 platformId）。 */
  title: string;
}
