/**
 * seedDemoIfEmpty 演示数据回归测试。
 * ============================================================
 * 覆盖：
 *   1. 空库首启 seed 出 5 个演示好友：必须是「安全昵称」（与 MockAdapter 演示会话一致），
 *      且 platformId / streakDays / level 与预期一一对应（防止再出现“像真人的旧昵称”回潮）。
 *   2. 为每个好友预置发送历史（send_results success=1），昨天的记录必保底（5 条），
 *      今日不插记录（保证仪表盘呈现「今日待续」）；历史条数与 streakDays 换算一致。
 *   3. 幂等：重复调用不会重复 seed。
 *   4. 演示叙事指标：30 天成功率=1、今日发送数=0。
 *
 * 说明：把 Math.random 固定为 0.5（>5% 阈值），使「约 5% 随机留白」变为确定性的
 * 「不留白」，从而能精确断言插入条数；每个用例结束都会恢复。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _resetDatabaseForTest, initDatabase } from '../../server/src/db/index.ts';
import { AppContext } from '../../server/src/context.ts';
import { parseConfig } from '../../server/src/config/schema.ts';

const EXPECTED = [
  { nickname: '星星', platformId: 'im_demo_xingxing', streakDays: 128, level: '挚友' },
  { nickname: '阿茶', platformId: 'im_demo_acha', streakDays: 64, level: '聊愈' },
  { nickname: '北北', platformId: 'im_demo_beibei', streakDays: 23, level: '普通' },
  { nickname: '小满', platformId: 'im_demo_xiaoman', streakDays: 11, level: '普通' },
  { nickname: '图图', platformId: 'im_demo_tutu', streakDays: 3, level: '危险' },
] as const;

/** 历史发送记录覆盖的天数上限（与 context.ts 保持一致）。 */
const MAX_HISTORY_DAYS = 60;

let dataDir = '';
let ctx: AppContext;

function utcDateStr(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'sk-seed-'));
  _resetDatabaseForTest();
  initDatabase(dataDir);
  ctx = new AppContext(parseConfig({ dataDir, platform: 'mock' }));
});

afterEach(() => {
  vi.restoreAllMocks();
  _resetDatabaseForTest();
  rmSync(dataDir, { recursive: true, force: true });
});

describe('seedDemoIfEmpty 演示数据', () => {
  it('空库 seed 出 5 个安全昵称好友，字段与预期一一对应', () => {
    ctx.seedDemoIfEmpty();

    const friends = ctx.friendRepo.list();
    expect(friends).toHaveLength(5);
    expect(friends.map((f) => f.nickname)).toEqual(EXPECTED.map((e) => e.nickname));
    expect(friends.map((f) => f.platformId)).toEqual(EXPECTED.map((e) => e.platformId));
    expect(friends.map((f) => f.streakDays)).toEqual(EXPECTED.map((e) => e.streakDays));
    expect(friends.map((f) => f.level)).toEqual(EXPECTED.map((e) => e.level));
    // 旧昵称必须彻底消失
    expect(
      friends.some((f) => ['小雨同学', '阿杰', '林深', '柚子', '子墨'].includes(f.nickname)),
    ).toBe(false);
    // 全部启用、未设置 lastSentAt → 仪表盘「今日待续」
    expect(friends.every((f) => f.enabled && f.lastSentAt === undefined)).toBe(true);
  });

  it('历史记录：条数与 streakDays 换算一致、全部 success、昨天必保底、今日不插入', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    ctx.seedDemoIfEmpty();

    const rows = ctx.resultRepo.recent(MAX_HISTORY_DAYS + 10);
    const expectedTotal = EXPECTED.reduce(
      (sum, e) => sum + Math.min(e.streakDays, MAX_HISTORY_DAYS),
      0,
    );
    expect(rows).toHaveLength(expectedTotal);

    // 每条都是成功记录，且时间戳落在合理历史区间（今天-N 天 ～ 昨天）
    expect(rows.every((r) => r.success && !r.captchaDetected && r.retryCount === 0)).toBe(true);
    const newest = utcDateStr(1); // 昨天
    const oldest = utcDateStr(MAX_HISTORY_DAYS); // 今天 - N 天
    for (const r of rows) {
      const day = r.sentAt.slice(0, 10);
      expect(day >= oldest && day <= newest).toBe(true);
      // sent_at 落在北京时间 19:00-22:00（UTC 11:00-14:00），体现错峰
      const utcHour = Number(r.sentAt.slice(11, 13));
      expect(utcHour).toBeGreaterThanOrEqual(11);
      expect(utcHour).toBeLessThan(14);
    }

    // 昨天（offset=1）必保底：5 位好友各 1 条
    const yesterdayRows = rows.filter((r) => r.sentAt.slice(0, 10) === utcDateStr(1));
    expect(yesterdayRows).toHaveLength(5);
    // 今天不插入任何记录 → 「今日待续 / sentToday=0」叙事成立
    expect(rows.some((r) => r.sentAt.slice(0, 10) === utcDateStr(0))).toBe(false);
    expect(ctx.resultRepo.sentTodayCount(utcDateStr(0))).toBe(0);
  });

  it('每个好友都有属于自己 friendId 的历史记录（总量与各自 N 对应）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    ctx.seedDemoIfEmpty();

    const friends = ctx.friendRepo.list();
    const rows = ctx.resultRepo.recent(MAX_HISTORY_DAYS + 10);
    for (const f of friends) {
      const mine = rows.filter((r) => r.friendId === f.id);
      expect(mine).toHaveLength(Math.min(f.streakDays, MAX_HISTORY_DAYS));
      expect(mine.every((r) => r.friendId === f.id)).toBe(true);
    }
  });

  it('幂等：重复调用不会重复 seed', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    ctx.seedDemoIfEmpty();
    const totalAfterFirst = ctx.resultRepo.recent(MAX_HISTORY_DAYS + 10).length;

    ctx.seedDemoIfEmpty();

    expect(ctx.friendRepo.list()).toHaveLength(5);
    expect(ctx.resultRepo.recent(MAX_HISTORY_DAYS + 10)).toHaveLength(totalAfterFirst);
  });

  it('演示叙事指标：30 天成功率 1、最长连续天数 128、今日发送 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    ctx.seedDemoIfEmpty();

    expect(ctx.resultRepo.successRate(30)).toBe(1);
    expect(ctx.friendRepo.longestStreak()).toBe(128);
    expect(ctx.resultRepo.sentTodayCount(utcDateStr(0))).toBe(0);
  });
});
