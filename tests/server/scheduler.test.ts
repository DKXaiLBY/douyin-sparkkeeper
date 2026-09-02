import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initDatabase, _resetDatabaseForTest } from '../../server/src/db/index.ts';
import {
  FriendRepo,
  TaskRepo,
  ResultRepo,
  NotificationRepo,
} from '../../server/src/db/repos.ts';
import { Notifier } from '../../server/src/notifications/notifier.ts';
import { CircuitBreaker } from '../../server/src/safety/circuitBreaker.ts';
import { SendJob } from '../../server/src/scheduler/sendJob.ts';
import { MockAdapter } from '../../server/src/platforms/MockAdapter.ts';
import { parseConfig } from '../../server/src/config/schema.ts';
import type { AppConfig, Friend } from '../../server/src/lib/types.ts';

let dataDir = '';

function makeConfig(): AppConfig {
  return parseConfig({
    platform: 'mock',
    safety: {
      enabled: false,
      dailyCap: 20,
      delayMinSec: 0,
      delayMaxSec: 0,
      staggerHours: [0, 23],
    },
  });
}

function seedFriends(friendRepo: FriendRepo, n: number): Friend[] {
  const now = new Date().toISOString();
  const out: Friend[] = [];
  for (let i = 0; i < n; i++) {
    const f: Friend = {
      id: randomUUID(),
      nickname: `好友${i}`,
      platformId: `im_${i}`,
      streakDays: i + 5,
      level: '普通',
      enabled: true,
      timezone: 'Asia/Shanghai',
      lastSentAt: undefined,
      nextDueAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
      createdAt: now,
    };
    friendRepo.create(f);
    out.push(f);
  }
  return out;
}

describe('sendJob 编排（Dry Run 与 MockAdapter 整链）', () => {
  let friendRepo: FriendRepo;
  let taskRepo: TaskRepo;
  let resultRepo: ResultRepo;
  let notificationRepo: NotificationRepo;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sk-test-'));
    _resetDatabaseForTest();
    initDatabase(dataDir);
    friendRepo = new FriendRepo();
    taskRepo = new TaskRepo();
    resultRepo = new ResultRepo();
    notificationRepo = new NotificationRepo();
  });

  afterEach(() => {
    _resetDatabaseForTest();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function buildJob(config: AppConfig) {
    const notifier = new Notifier(config.notify, notificationRepo);
    const circuitBreaker = new CircuitBreaker(3, 1000);
    return new SendJob({
      friendRepo,
      taskRepo,
      resultRepo,
      notifier,
      config,
      circuitBreaker,
      llm: null,
    });
  }

  it('Dry Run：共用文案生成，但不发送、不落库、不改连续天数', async () => {
    const friends = seedFriends(friendRepo, 3);
    const job = buildJob(makeConfig());
    const report = await job.runSendJob({ dryRun: true });

    expect(report.dryRun).toBe(true);
    expect(report.total).toBe(3);
    expect(report.sent).toBe(3);
    expect(report.items).toHaveLength(3);
    expect(report.items.every((i) => i.ok && i.content.length > 0)).toBe(true);
    // 不落库
    expect(resultRepo.recent(30)).toHaveLength(0);
    // 连续天数不变
    for (const f of friends) {
      expect(friendRepo.getById(f.id)!.streakDays).toBe(f.streakDays);
    }
  });

  it('真实发送（Mock 成功）：发送→记录结果→累加连续天数', async () => {
    const friends = seedFriends(friendRepo, 3);
    const job = buildJob(makeConfig());
    const adapter = new MockAdapter();
    await adapter.login(null);
    const report = await job.runSendJob({ dryRun: false, adapter });

    expect(report.loginState).toBe('ok');
    expect(report.sent).toBe(3);
    expect(report.failed).toBe(0);
    const today = new Date().toISOString().slice(0, 10);
    expect(resultRepo.sentTodayCount(today)).toBe(3);
    expect(taskRepo.listByDate(today).length).toBe(3);
    for (const f of friends) {
      expect(friendRepo.getById(f.id)!.streakDays).toBe(f.streakDays + 1);
    }
  });

  it('验证码路径：暂停并推送，不继续发送', async () => {
    seedFriends(friendRepo, 3);
    const job = buildJob(makeConfig());
    const adapter = new MockAdapter({ forceCaptcha: true });
    await adapter.login(null);
    const report = await job.runSendJob({ dryRun: false, adapter });

    expect(report.captchaDetected).toBe(true);
    expect(report.paused).toBe(true);
    expect(report.sent).toBe(0);
    const notifs = notificationRepo.list(10);
    expect(notifs.some((n) => n.type === 'captcha')).toBe(true);
  });
});

describe('CircuitBreaker 熔断', () => {
  it('连续失败达阈值后打开，成功则复位', () => {
    const cb = new CircuitBreaker(3, 1000);
    expect(cb.shouldBlock()).toBe(false);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.shouldBlock()).toBe(false);
    cb.recordFailure();
    expect(cb.shouldBlock()).toBe(true);
    cb.recordSuccess();
    expect(cb.shouldBlock()).toBe(false);
  });
});

// ---- 窗口内随机时刻（安全模式增强） ----
import { pickRandomMinute } from '../../server/src/scheduler/RandomScheduler.ts';

describe('pickRandomMinute（窗口内随机时刻）', () => {
  it('生成的时刻落在 [startHour, endHour) 窗口内', () => {
    for (let i = 0; i < 500; i++) {
      const m = pickRandomMinute(19, 22);
      expect(m).toBeGreaterThanOrEqual(19 * 60);
      expect(m).toBeLessThan(22 * 60);
    }
  });

  it('边界小时正常（如 0-1 点窗口）', () => {
    const m = pickRandomMinute(0, 1);
    expect(m).toBeGreaterThanOrEqual(0);
    expect(m).toBeLessThan(60);
  });

  it('窗口非法（end <= start）时防呆返回起点', () => {
    expect(pickRandomMinute(22, 19)).toBe(22 * 60);
    expect(pickRandomMinute(5, 5)).toBe(5 * 60);
  });

  it('注入 rand 可复现（测试确定性）', () => {
    expect(pickRandomMinute(19, 22, () => 0)).toBe(19 * 60);
    expect(pickRandomMinute(19, 22, () => 0.9999)).toBe(22 * 60 - 1);
  });
});
