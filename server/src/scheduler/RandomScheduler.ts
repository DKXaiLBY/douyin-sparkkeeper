/**
 * 窗口内随机时刻调度器（安全模式增强）。
 *
 * 背景：每天固定 20:00 触发是高度规律的行为特征，风控模型对「固定时间间隔/线性分布」
 * 敏感（真实用户操作时间分布是非线性的）。本调度器每天在错峰窗口内随机挑选一个时刻
 * 触发发送，打破规律性，更像真人。
 *
 * 实现：每分钟 tick 一次；当日首次 tick 时为「今天」随机生成一个时刻 t（缓存），
 * 当前时间 ≥ t 且今日未触发 → 执行 jobFn（sendJob 内部已有「今日已发」防重，不会重复发）。
 *
 * 持久化：每天选中的时刻 t 与「今日已触发」标记会写入 dataDir/random-schedule.json。
 * 原因——t 原先只存在内存里，服务重启就会重选：
 *   1) 今天已发过再重启 → 新 t 可能落在已过去的时间 → 又执行一次「补发」，
 *      产生一次无意义的执行与「今日已触发」状态混乱；
 *   2) 重选的 t 若晚于当前时间，当天剩余时间便不再触发，行为前后不一致。
 * 存文件而非 SQLite：本调度器原本零数据库依赖，改用 meta 表会让它必须先初始化 DB
 * （耦合单例、顺序敏感、难单测）；而项目已有 config.json / credentials/ 这类
 * 「dataDir 下小文件保存运行态」的先例，且文件方案便于注入临时目录做测试。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { withModule } from '../lib/logger.ts';
import type { SchedulerLike } from './cron.ts';

const log = withModule('cron-random');

/** 持久化文件名（位于 dataDir 下）。 */
const STATE_FILE = 'random-schedule.json';

/** 落盘内容：仅记录「当天已选中的时刻」，不涉任何敏感信息。 */
interface RandomScheduleState {
  /** 该随机时刻所属的本地日期串（YYYY-MM-DD），与「今日已触发」同一日期口径。 */
  date: string;
  /** 生成时刻时的错峰窗口；窗口配置变了则旧时刻失效，需重新生成。 */
  startHour: number;
  endHour: number;
  /** 当日随机时刻（本地分钟数 0-1439）。 */
  minute: number;
  /** 当日已触发的日期串；空串表示当天尚未触发。 */
  firedDate: string;
}

export interface RandomSchedulerOptions {
  /** 窗口起始小时（含），如 19。 */
  startHour: number;
  /** 窗口结束小时（不含），如 22。 */
  endHour: number;
  /** 到点执行的任务。 */
  jobFn: () => Promise<void>;
  /**
   * 运行态持久化目录（可选）。传入后每日选中的时刻会写入该目录下的 random-schedule.json，
   * 服务重启后同一天可复用；不传则退化为纯内存模式（与历史行为一致）。
   */
  dataDir?: string;
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

/** 读到的任意内容都长这样，需要先做形状校验再当状态用。 */
type RawState = Partial<Record<keyof RandomScheduleState, unknown>>;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
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

  // ---------------- 持久化（同日复用 / 跨天重选 / 容错回退） ----------------

  /** 状态文件路径；未配置 dataDir 时返回 null（纯内存模式）。 */
  private statePath(): string | null {
    const dir = this.opts.dataDir;
    if (!dir) return null;
    return path.join(dir, STATE_FILE);
  }

  /**
   * 读取「当天」可复用的状态。
   * 文件不存在 / 内容损坏 / JSON 解析失败 / 日期不是今天 / 窗口已变更 / 数值越界
   * → 一律返回 null，由调用方回退到「重新随机生成」，绝不让调度器因读取失败而挂掉。
   */
  private loadState(dateStr: string): RandomScheduleState | null {
    const file = this.statePath();
    if (!file) return null;
    try {
      if (!existsSync(file)) return null;
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as RawState | null;
      if (typeof raw !== 'object' || raw === null) return null;
      // 跨天：昨天保存的时刻对今天无效
      if (raw.date !== dateStr) return null;
      // 错峰窗口被改过：旧时刻可能已落在新窗口之外，必须重选
      if (raw.startHour !== this.opts.startHour || raw.endHour !== this.opts.endHour) return null;
      if (typeof raw.minute !== 'number' || !Number.isInteger(raw.minute)) return null;
      if (raw.minute < 0 || raw.minute > 1439) return null;
      return {
        date: dateStr,
        startHour: this.opts.startHour,
        endHour: this.opts.endHour,
        minute: raw.minute,
        firedDate: typeof raw.firedDate === 'string' ? raw.firedDate : '',
      };
    } catch (e) {
      log.warn({ err: errMsg(e) }, 'random schedule state unreadable, will re-pick today');
      return null;
    }
  }

  /**
   * 写盘。失败（目录只读、磁盘满等）只告警并降级为纯内存模式，不影响调度本身。
   * 先写临时文件再 rename：rename 在同一分区内是原子的，避免进程在写入中途退出
   * 留下半截 JSON，导致下次启动读到损坏文件。
   */
  private saveState(): void {
    const file = this.statePath();
    if (!file) return;
    const state: RandomScheduleState = {
      date: this.minuteDate,
      startHour: this.opts.startHour,
      endHour: this.opts.endHour,
      minute: this.todayMinute,
      firedDate: this.firedDate,
    };
    try {
      const dir = path.dirname(file);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const tmp = `${file}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(state), 'utf-8');
      renameSync(tmp, file);
    } catch (e) {
      log.warn(
        { err: errMsg(e) },
        'random schedule state persist failed, running in memory-only mode',
      );
    }
  }

  // ---------------- 心跳 ----------------

  /**
   * 每分钟一次。整个方法是同步的（jobFn 只是 fire-and-forget，不 await），
   * 所以不存在两次 tick 交错读写状态的竞态。
   */
  private tick(): void {
    const now = new Date();
    const dateStr = localDateStr(now);
    if (this.firedDate === dateStr) return; // 今日已触发

    // 当日首次：优先复用「同一天、同一窗口」下已保存的时刻，只有不存在/损坏/过期/窗口变更
    // 时才重新随机——避免重启后重选时刻导致的补发或漏发。
    if (this.minuteDate !== dateStr) {
      const saved = this.loadState(dateStr);
      if (saved) {
        this.todayMinute = saved.minute;
        this.minuteDate = saved.date;
        // 一并恢复「今日已触发」：今天已经发过再重启，不应再执行一次
        this.firedDate = saved.firedDate === dateStr ? dateStr : '';
        log.info(
          { date: dateStr, minute: this.todayMinute, fired: this.firedDate !== '' },
          "reuse persisted today's random send time",
        );
      } else {
        this.todayMinute = pickRandomMinute(this.opts.startHour, this.opts.endHour);
        this.minuteDate = dateStr;
        this.firedDate = '';
        log.info({ date: dateStr, minute: this.todayMinute }, "today's random send time picked");
      }
      this.saveState();
    }

    // 复用持久化状态后可能已是「今日已触发」（今天发过并重启过），再判一次，避免重复执行
    if (this.firedDate === dateStr) return;

    const nowMinute = now.getHours() * 60 + now.getMinutes();
    if (nowMinute >= this.todayMinute) {
      this.firedDate = dateStr;
      this.saveState();
      log.info({ date: dateStr }, 'random scheduler trigger fired');
      void this.opts
        .jobFn()
        .catch((e: unknown) =>
          log.error({ err: errMsg(e) }, 'random scheduler job failed'),
        );
    }
  }
}
