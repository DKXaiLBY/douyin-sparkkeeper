/** 后端领域类型的前端镜像（不跨仓 import，避免耦合）。 */

export type FriendLevel = '挚友' | '聊愈' | '普通' | '危险';

export interface Friend {
  id: string;
  nickname: string;
  platformId: string;
  remark?: string;
  streakDays: number;
  level: FriendLevel;
  enabled: boolean;
  timezone: string;
  lastSentAt?: string;
  nextDueAt: string;
  createdAt: string;
}

export type SendStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface SendTask {
  id: string;
  friendId: string;
  scheduledFor: string;
  status: SendStatus;
  content: string;
  dryRun: boolean;
  createdAt: string;
  sentAt?: string;
}

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
  hasApiKey?: boolean;
}

export type NotifyChannel = 'webhook' | 'telegram' | 'none';

export interface NotifyConfig {
  channel: NotifyChannel;
  webhookUrl?: string;
  telegramToken?: string;
  telegramChatId?: string;
}

export interface AppConfig {
  port: number;
  dataDir: string;
  platform: 'douyin' | 'mock';
  safetyMode: boolean;
  safety: SafetyConfig;
  llm: LlmConfig;
  notify: NotifyConfig;
  cron: string;
  /** 每日触发模式：fixed=固定时刻；random=错峰窗口内每日随机（默认）。 */
  sendMode: 'fixed' | 'random';
  weatherEnabled: boolean;
  passphraseMinLen: number;
  /** 自定义文案模板（与后端 AppConfig.content 同步）。 */
  content: { templates: string[] };
}

export type NotificationType = 'captcha' | 'login_expired' | 'send_failed' | 'daily_summary';

export interface Notification {
  id: string;
  type: NotificationType;
  channel: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
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
  loginState: string;
  paused: boolean;
  /** 暂停的具体原因（与后端 SendReport 同步）。 */
  pauseReason?: string;
  items: SendReportItem[];
}

/** 扫码登录会话状态机（与后端 QrLoginStatus 一致）。 */
export type QrLoginStatus =
  | 'idle'
  | 'starting'
  | 'waiting'
  | 'scanned'
  | 'success'
  | 'expired'
  | 'error'
  | 'cancelled';

export interface QrLoginState {
  status: QrLoginStatus;
  /** 二维码 PNG 的 dataURL（每次轮询都会刷新）。 */
  qr?: string;
  /** 面向用户的中文提示。 */
  message?: string;
  /** 保险库未解锁时为 true，前端需先收集口令。 */
  needsPassphrase?: boolean;
  /** 登录成功并落盘后的凭证 id。 */
  credentialId?: string;
  /** 启动进度（0-100，基于真实阶段；二维码就绪后恒为 100）。 */
  progress?: number;
}

export interface HealthStatus {
  status: string;
  time: string;
  platform: string;
  vaultUnlocked: boolean;
  credentialImported: boolean;
  schedulerRunning: boolean;
  paused: boolean;
  safetyMode: boolean;
  friends: number;
  unreadNotifications: number;
}
