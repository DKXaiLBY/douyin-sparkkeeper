/**
 * 应用上下文：聚合所有服务（仓储 / 凭证库 / 通知 / 熔断 / 内容 / 调度），
 * 由 index.ts 在启动时构建一次，并贯穿 REST 路由与调度任务。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  initDatabase,
} from './db/index.ts';
import {
  FriendRepo,
  TaskRepo,
  ResultRepo,
  NotificationRepo,
} from './db/repos.ts';
import { CredentialStore } from './crypto/credentialStore.ts';
import { Notifier } from './notifications/notifier.ts';
import { CircuitBreaker } from './safety/circuitBreaker.ts';
import { LlmProvider } from './content/LlmProvider.ts';
import { SendJob } from './scheduler/sendJob.ts';
import type { SchedulerLike } from './scheduler/cron.ts';
import { parseConfig } from './config/schema.ts';
import { sanitizeSafety } from './config/defaults.ts';
import { AppError, ErrorCode } from './lib/errors.ts';
import type { AppConfig, ConfigPatch, Friend, FriendLevel } from './lib/types.ts';
import { withModule } from './lib/logger.ts';

const log = withModule('context');

export class AppContext {
  config: AppConfig;
  readonly friendRepo = new FriendRepo();
  readonly taskRepo = new TaskRepo();
  readonly resultRepo = new ResultRepo();
  readonly notificationRepo = new NotificationRepo();
  readonly credentialStore: CredentialStore;
  notifier: Notifier;
  readonly circuitBreaker = new CircuitBreaker();
  llm: LlmProvider | null = null;
  sendJob: SendJob;
  scheduler: SchedulerLike | null = null;
  paused = false;
  private readonly dataDir: string;

  constructor(config: AppConfig) {
    this.config = config;
    this.dataDir = config.dataDir;
    initDatabase(this.dataDir);
    this.credentialStore = new CredentialStore(this.dataDir);
    this.notifier = new Notifier(config.notify, this.notificationRepo);
    this.llm = this.buildLlm();
    this.sendJob = this.makeSendJob();
  }

  private makeSendJob(): SendJob {
    return new SendJob({
      friendRepo: this.friendRepo,
      taskRepo: this.taskRepo,
      resultRepo: this.resultRepo,
      notifier: this.notifier,
      config: this.config,
      circuitBreaker: this.circuitBreaker,
      llm: this.llm,
      adapter: undefined,
    });
  }

  private buildLlm(): LlmProvider | null {
    if (!this.config.llm.enabled) return null;
    let apiKey = process.env.LLM_API_KEY ?? '';
    if (
      !apiKey &&
      this.config.llm.apiKeyEnc &&
      this.credentialStore.isUnlocked()
    ) {
      try {
        apiKey = this.credentialStore.decryptText(this.config.llm.apiKeyEnc);
      } catch {
        apiKey = '';
      }
    }
    if (!apiKey) return null;
    return new LlmProvider(this.config.llm, apiKey);
  }

  setPaused(v: boolean): void {
    this.paused = v;
  }

  /** 应用运行期配置补丁并持久化（写入 dataDir/config.json）。 */
  reloadConfig(patch: ConfigPatch): AppConfig {
    // LLM apiKey 明文 → 加密存储（需保险库已解锁）
    let llmMerge = patch.llm ?? {};
    if (llmMerge.apiKey !== undefined) {
      if (!this.credentialStore.isUnlocked()) {
        throw new AppError(
          ErrorCode.VAULT_LOCKED,
          '修改 LLM 密钥需先解锁凭证保险库',
          401,
        );
      }
      const enc = this.credentialStore.encryptText(llmMerge.apiKey);
      llmMerge = { ...llmMerge, apiKeyEnc: enc };
      delete (llmMerge as Record<string, unknown>).apiKey;
    }

    const merged = parseConfig({
      ...this.config,
      ...(patch.safetyMode !== undefined ? { safetyMode: patch.safetyMode } : {}),
      ...(patch.safety ? { safety: { ...this.config.safety, ...patch.safety } } : {}),
      ...(patch.llm ? { llm: { ...this.config.llm, ...llmMerge } } : {}),
      ...(patch.notify ? { notify: { ...this.config.notify, ...patch.notify } } : {}),
      ...(patch.cron ? { cron: patch.cron } : {}),
      // 每日触发模式（fixed / random）；此前漏合并导致前端切换无效
      ...(patch.sendMode ? { sendMode: patch.sendMode } : {}),
      ...(patch.weatherEnabled !== undefined
        ? { weatherEnabled: patch.weatherEnabled }
        : {}),
      ...(patch.platform ? { platform: patch.platform } : {}),
      ...(patch.content ? { content: { ...this.config.content, ...patch.content } } : {}),
    });
    merged.safety = sanitizeSafety(merged.safety);

    this.config = merged;
    this.notifier = new Notifier(merged.notify, this.notificationRepo);
    this.llm = this.buildLlm();
    this.sendJob = this.makeSendJob();
    this.persistConfig(merged);
    log.info('config reloaded');
    return merged;
  }

  /** 持久化配置（敏感字段仅以加密形态落盘）。 */
  private persistConfig(cfg: AppConfig): void {
    if (!existsSync(this.dataDir)) mkdirSync(this.dataDir, { recursive: true });
    const file = path.join(this.dataDir, 'config.json');
    writeFileSync(file, JSON.stringify(cfg, null, 2), 'utf-8');
  }

  loadPersistedConfig(): void {
    const file = path.join(this.dataDir, 'config.json');
    if (!existsSync(file)) return;
    try {
      const saved = JSON.parse(readFileSync(file, 'utf-8')) as Partial<AppConfig>;
      this.config = parseConfig({ ...this.config, ...saved });
      this.notifier = new Notifier(this.config.notify, this.notificationRepo);
      this.llm = this.buildLlm();
      this.sendJob = this.makeSendJob();
    } catch {
      /* 损坏配置忽略 */
    }
  }

  /**
   * 首次运行填充示例好友与演示发送历史，便于仪表盘即时可见（用户可随时删除）。
   *
   * 昵称与 MockAdapter 内置演示会话（platforms/MockAdapter.ts）保持一致的安全昵称
   * （星星/阿茶/北北/小满/图图），避免「看着像真实用户」的隐私观感。
   * 同时为每个好友预置近 N=min(streakDays, 60) 天的成功发送记录，让首启后的仪表盘
   * 呈现完整演示叙事：今日 5 位待续 + 热力图近几十天几乎全橙 + 成功率 ≈100%。
   * 这些都是纯演示数据，不参与任何真实发送决策；已有数据时不会重复 seed（幂等）。
   */
  seedDemoIfEmpty(): void {
    if (this.friendRepo.list().length > 0) return;
    const samples: Array<{
      nickname: string;
      platformId: string;
      streakDays: number;
      level: FriendLevel;
    }> = [
      { nickname: '星星', platformId: 'im_demo_xingxing', streakDays: 128, level: '挚友' },
      { nickname: '阿茶', platformId: 'im_demo_acha', streakDays: 64, level: '聊愈' },
      { nickname: '北北', platformId: 'im_demo_beibei', streakDays: 23, level: '普通' },
      { nickname: '小满', platformId: 'im_demo_xiaoman', streakDays: 11, level: '普通' },
      { nickname: '图图', platformId: 'im_demo_tutu', streakDays: 3, level: '危险' },
    ];
    const now = new Date();
    for (const s of samples) {
      const friend: Friend = {
        id: crypto.randomUUID(),
        nickname: s.nickname,
        platformId: s.platformId,
        streakDays: s.streakDays,
        level: s.level,
        enabled: true,
        timezone: 'Asia/Shanghai',
        lastSentAt: undefined,
        nextDueAt: new Date(now.getTime() + 8 * 3600 * 1000).toISOString(),
        createdAt: now.toISOString(),
      };
      this.friendRepo.create(friend);
      this.seedSendHistory(friend.id, s.streakDays);
    }
    log.info('seeded demo friends (5) with send history');
  }

  /**
   * 为单个演示好友补「发送历史」：从今天往前数 days 天（含）到昨天，每天一条 success=1 记录。
   * - sent_at 落在北京时间 19:00–22:00（错峰发送的拟人化体现），并以 UTC 时间点落盘，
   *   保证与仪表盘热力图按 UTC 日期取 substr(sent_at,1,10) 的口径一致、不错位。
   * - 约 5% 的日期随机留白（不插记录）制造真实起伏；昨天（offset=1）必保底，
   *   确保热力图末尾与成功率观感完整。
   */
  private seedSendHistory(friendId: string, streakDays: number): void {
    const days = Math.min(streakDays, 60);
    if (days <= 0) return;
    const nowMs = Date.now();
    for (let offset = days; offset >= 1; offset--) {
      if (offset !== 1 && Math.random() < 0.05) continue;
      const ymd = new Date(nowMs - offset * 86_400_000).toISOString().slice(0, 10);
      const [y, m, d] = ymd.split('-').map(Number);
      // 北京时间分钟 = UTC 分钟 + 8*60；19:00–22:00 随机，不会跨 UTC 日
      const beijingMinute = 19 * 60 + Math.floor(Math.random() * 3 * 60);
      const sentAt = new Date(
        Date.UTC(y, m - 1, d, 0, beijingMinute - 8 * 60),
      ).toISOString();
      this.resultRepo.create({
        id: crypto.randomUUID(),
        taskId: '', // 演示历史不关联真实发送任务；ResultRepo 落库时映射为 NULL
        friendId,
        success: true,
        durationMs: 800 + Math.floor(Math.random() * 2201), // 800–3000ms
        captchaDetected: false,
        retryCount: 0,
        sentAt,
      });
    }
  }
}
