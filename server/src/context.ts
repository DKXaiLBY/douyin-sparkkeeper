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

  /** 首次运行填充示例好友，便于仪表盘即时可见（用户可随时删除）。 */
  seedDemoIfEmpty(): void {
    if (this.friendRepo.list().length > 0) return;
    const samples: Array<{
      nickname: string;
      platformId: string;
      streakDays: number;
      level: FriendLevel;
    }> = [
      { nickname: '小雨同学', platformId: 'im_demo_xiaoyu', streakDays: 128, level: '挚友' },
      { nickname: '阿杰', platformId: 'im_demo_ajie', streakDays: 64, level: '聊愈' },
      { nickname: '林深', platformId: 'im_demo_linshen', streakDays: 23, level: '普通' },
      { nickname: '柚子', platformId: 'im_demo_youzi', streakDays: 11, level: '普通' },
      { nickname: '子墨', platformId: 'im_demo_zimo', streakDays: 3, level: '危险' },
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
    }
    log.info('seeded demo friends');
  }
}
