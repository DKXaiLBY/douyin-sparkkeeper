/**
 * 窗口内随机时刻调度器（安全模式增强）。
 *
 * 背景：每天固定 20:00 触发是高度规律的行为特征，风控模型对「固定时间间隔/线性分布」
 * 敏感（真实用户操作时间分布是非线性的）。本调度器每天在错峰窗口内随机挑选一个时刻
 * 触发发送，打破规律性，更像真人。
 *
 * 实现：每分钟 tick 一次；当日首次 tick 时为「今天」随机生成一个时刻 t（缓存），
 * 当前时间 ≥ t 且今日未触发 → 执行 jobFn（sendJob 内部已有「今日已发」防重，不会重复发）。
 */

import { withModule } from '../lib/logger.ts';
import type { SchedulerLike } from './cron.ts';

const log = withModule('cron-random');

export interface RandomSchedulerOptions {
  /** 窗口起始小时（含），如 19。 */
  startHour: number;
  /** 窗口结束小时（不含），如 22。 */
  endHour: number;
  /** 到点执行的任务。 */
  jobFn: () => Promise<void>;
}

/**
 * 纯函数：在 [startHour, endHour) 窗口内均匀随机生成「当日时刻」（返回当日分钟数 0-1439）。
 * rand 可注入以便测试。窗口非法（end <= start）时防呆返回起点分钟。
 */
export function pickRandomMinute(
  startHour: number,
  endHour: number,
  rand: () => number = Math.random,
): number {
  const startMin = Math.round(startHour * 60);
  const endMin = Math.round(endHour * 60);
  if (!Number.isFinite(startMin) || !Number.isFinite(endMin) || endMin <= startMin) {
    return Math.max(0, Math.min(1439, startMin));
  }
  const clampedStart = Math.max(0, Math.min(1439, startMin));
  const clampedEnd = Math.max(0, Math.min(1440, endMin));
  return clampedStart + Math.floor(rand() * (clampedEnd - clampedStart));
}

/** 本地日期串（YYYY-MM-DD），用于判断「今日是否已触发」。 */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export class RandomScheduler implements SchedulerLike {
  private timer: ReturnType<typeof setInterval> | null = null;
  private firstCheckTimer: ReturnType<typeof setTimeout> | null = null;
  /** 今日随机时刻（本地分钟数）；-1 表示尚未生成。 */
  private todayMinute = -1;
  private minuteDate = '';
  /** 今日已触发的日期串；空串表示今日未触发。 */
  private firedDate = '';
  private readonly opts: RandomSchedulerOptions;

  constructor(opts: RandomSchedulerOptions) {
    this.opts = opts;
  }

  start(): void {
    if (this.timer) return;
    // 启动后延迟 30 秒再首次检查：若「今日随机时刻已过」，立即检查会在启动瞬间触发一次，
    // 此时凭证保险库往往还没解锁 → 报「定时发送失败」+ 推送失败通知，让用户误以为服务出故障。
    // 延迟到服务就绪后再补发（过了随机时刻的会补发一次，未过则正常等待）。
    this.firstCheckTimer = setTimeout(() => this.tick(), 30_000);
    this.timer = setInterval(() => this.tick(), 60_000);
    log.info(
      { startHour: this.opts.startHour, endHour: this.opts.endHour },
      'random scheduler started',
    );
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.firstCheckTimer) clearTimeout(this.firstCheckTimer);
    this.firstCheckTimer = null;
    log.info('random scheduler stopped');
  }

  get isRunning(): boolean {
    return this.timer !== null;
  }

  private tick(): void {
    const now = new Date();
    const dateStr = localDateStr(now);
    if (this.firedDate === dateStr) return; // 今日已触发

    // 当日首次：生成今天的随机时刻
    if (this.minuteDate !== dateStr) {
      this.todayMinute = pickRandomMinute(this.opts.startHour, this.opts.endHour);
      this.minuteDate = dateStr;
      log.info({ date: dateStr, minute: this.todayMinute }, "today's random send time picked");
    }

    const nowMinute = now.getHours() * 60 + now.getMinutes();
    if (nowMinute >= this.todayMinute) {
      this.firedDate = dateStr;
      log.info({ date: dateStr }, 'random scheduler trigger fired');
      void this.opts
        .jobFn()
        .catch((e: unknown) =>
          log.error(
            { err: e instanceof Error ? e.message : String(e) },
            'random scheduler job failed',
          ),
        );
    }
  }
}
