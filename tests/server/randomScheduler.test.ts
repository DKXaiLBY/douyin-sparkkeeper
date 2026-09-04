/**
 * RandomScheduler 持久化回归测试：每日随机时刻需跨重启保持一致。
 *
 * 用法要点：
 * - 用 vitest 假定时器固定「当前本地时间」，调度器 start() 后 30 秒才做首次检查，
 *   用 advanceTimersByTime 快进到那一刻，即可确定性地触发一次 tick。
 * - 窗口 [19,22) 生成的时刻必定 ≥ 1140 分钟（19:00），因此把当前时间定在 03:20（200 分钟）
 *   可以区分「复用旧时刻」（会触发）与「重新随机」（不会触发）：
 *   一旦重选，时刻 ≥1140 > 200，本次就不会执行 jobFn。
 *
 * 日期口径：所有日期都用「今天/昨天」的动态本地串，避免测试过期。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RandomScheduler } from '../../server/src/scheduler/RandomScheduler.ts';

/** 与源码保持一致的本地日期串口径（YYYY-MM-DD）。 */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 「今天 HH:MM」用于 setSystemTime，跟随真实日期前进。 */
function todayAt(h: number, m: number): Date {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** 「今天」YYYY-MM-DD。 */
function todayStr(): string {
  return localDateStr(new Date());
}

/** 「昨天」YYYY-MM-DD。 */
function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return localDateStr(d);
}

interface StateFile {
  date: string;
  startHour: number;
  endHour: number;
  minute: number;
  firedDate: string;
}

let dataDir = '';
let stateFile = '';

function readState(): StateFile {
  return JSON.parse(readFileSync(stateFile, 'utf-8')) as StateFile;
}

function writeState(s: Partial<StateFile>): void {
  writeFileSync(stateFile, JSON.stringify(s), 'utf-8');
}

/** 构造调度器并推进到「启动后首次检查」，等价于跑一次当日首次 tick。 */
function runOnce(
  opts: { startHour: number; endHour: number; dataDir?: string },
  jobFn: () => Promise<void>,
): RandomScheduler {
  const s = new RandomScheduler({ ...opts, jobFn });
  s.start();
  vi.advanceTimersByTime(30_000);
  s.stop();
  return s;
}

describe('RandomScheduler 每日随机时刻持久化', () => {
  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'sk-rand-'));
    stateFile = join(dataDir, 'random-schedule.json');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it('同日重启：复用已保存的时刻，不再重新随机', () => {
    // 当前 03:20（第 200 分钟）。窗口 [19,22) 重新随机会落在 [1140,1320)，
    // 那时 200 < 1140 → 不会触发；只有复用了保存的 100 才会触发。
    const today = todayStr();
    vi.setSystemTime(todayAt(3, 20));
    writeState({ date: today, startHour: 19, endHour: 22, minute: 100, firedDate: '' });

    const job = vi.fn(async () => undefined);
    runOnce({ startHour: 19, endHour: 22, dataDir }, job);

    expect(job).toHaveBeenCalledTimes(1);
    // 复用而非覆盖
    expect(readState().minute).toBe(100);
    expect(readState().date).toBe(today);
  });

  it('跨天：丢弃昨天的时刻，重新随机并覆盖保存', () => {
    const today = todayStr();
    vi.setSystemTime(todayAt(3, 20));
    writeState({ date: yesterdayStr(), startHour: 19, endHour: 22, minute: 100, firedDate: '' });

    const job = vi.fn(async () => undefined);
    runOnce({ startHour: 19, endHour: 22, dataDir }, job);

    // 新时刻落在今天窗口内 → 03:20 未到点，不触发
    expect(job).not.toHaveBeenCalled();
    const saved = readState();
    expect(saved.date).toBe(today);
    expect(saved.minute).toBeGreaterThanOrEqual(19 * 60);
    expect(saved.minute).toBeLessThan(22 * 60);
  });

  it('文件损坏 / 字段非法 / 数值越界：容错回退为重新随机', () => {
    const today = todayStr();
    vi.setSystemTime(todayAt(3, 20));
    const badPayloads = [
      '{ 这不是 JSON',
      'null',
      '[]',
      JSON.stringify({ date: today, startHour: 19, endHour: 22, minute: 'abc' }),
      JSON.stringify({ date: today, startHour: 19, endHour: 22, minute: 9999 }),
      JSON.stringify({ date: today, startHour: 19, endHour: 22, minute: -1 }),
      JSON.stringify({ date: today, startHour: 19, endHour: 22, minute: 12.5 }),
    ];

    for (const payload of badPayloads) {
      writeFileSync(stateFile, payload, 'utf-8');
      const job = vi.fn(async () => undefined);
      // 不得抛异常，且回退后按新窗口重新随机
      expect(() => runOnce({ startHour: 19, endHour: 22, dataDir }, job)).not.toThrow();
      expect(job).not.toHaveBeenCalled();
      const saved = readState();
      expect(saved.date).toBe(today);
      expect(saved.minute).toBeGreaterThanOrEqual(19 * 60);
      expect(saved.minute).toBeLessThan(22 * 60);
    }
  });

  it('今天已触发后重启：不再重复执行一次', () => {
    // 窗口 [19,20) → 时刻必定 ≤ 19:59；当前 20:30 一定已过该时刻 → 首次即触发
    const today = todayStr();
    vi.setSystemTime(todayAt(20, 30));
    const job = vi.fn(async () => undefined);
    runOnce({ startHour: 19, endHour: 20, dataDir }, job);
    expect(job).toHaveBeenCalledTimes(1);

    const firstSaved = readState();
    expect(firstSaved.date).toBe(today);
    expect(firstSaved.firedDate).toBe(today);

    // 模拟「服务重启」：新实例 + 时间推进一分钟，同一天内不应再触发
    vi.setSystemTime(todayAt(20, 31));
    const job2 = vi.fn(async () => undefined);
    runOnce({ startHour: 19, endHour: 20, dataDir }, job2);

    expect(job2).not.toHaveBeenCalled();
    // 时刻也被原样保留
    expect(readState().minute).toBe(firstSaved.minute);
  });

  it('错峰窗口被修改：旧时刻失效，按新窗口重新随机', () => {
    const today = todayStr();
    vi.setSystemTime(todayAt(3, 20));
    writeState({ date: today, startHour: 19, endHour: 22, minute: 100, firedDate: '' });

    const job = vi.fn(async () => undefined);
    runOnce({ startHour: 8, endHour: 9, dataDir }, job);

    expect(job).not.toHaveBeenCalled();
    const saved = readState();
    expect(saved.startHour).toBe(8);
    expect(saved.endHour).toBe(9);
    expect(saved.minute).toBeGreaterThanOrEqual(8 * 60);
    expect(saved.minute).toBeLessThan(9 * 60);
  });

  it('写入失败（dataDir 不可用）：降级为纯内存模式，调度照常工作', () => {
    // dataDir 指向一个文件而非目录 → mkdir/写入都会失败
    const notADir = join(dataDir, 'not-a-dir.txt');
    writeFileSync(notADir, 'x', 'utf-8');
    vi.setSystemTime(todayAt(20, 30));

    const job = vi.fn(async () => undefined);
    // 窗口 [0,20) → 时刻 ≤ 19:59，20:30 一定已过 → 应正常触发
    expect(() => runOnce({ startHour: 0, endHour: 20, dataDir: notADir }, job)).not.toThrow();
    expect(job).toHaveBeenCalledTimes(1);
    expect(existsSync(join(notADir, 'random-schedule.json'))).toBe(false);
  });

  it('未配置 dataDir：保持纯内存行为，不落盘也不报错', () => {
    vi.setSystemTime(todayAt(20, 30));
    const job = vi.fn(async () => undefined);
    runOnce({ startHour: 19, endHour: 20 }, job);
    expect(job).toHaveBeenCalledTimes(1);
    expect(existsSync(stateFile)).toBe(false);
  });

  it('持久化文件名与日期口径：本地日期串与 localDateStr 一致', () => {
    // 临近跨天（23:50）验证用的是本地日期而非 UTC；日期动态取「今天」避免过期。
    const now = todayAt(23, 50);
    vi.setSystemTime(now);
    writeState({ date: localDateStr(now), startHour: 19, endHour: 22, minute: 100, firedDate: '' });
    const job = vi.fn(async () => undefined);
    runOnce({ startHour: 19, endHour: 22, dataDir }, job);
    expect(job).toHaveBeenCalledTimes(1);
    expect(readState().date).toBe(localDateStr(now));
  });
});