/**
 * node-cron 封装：按 cron 表达式每日触发发送任务。
 * 仅负责「按时呼叫」，具体逻辑由传入的 jobFn 决定（便于解耦与测试）。
 */

import cron, { ScheduledTask } from 'node-cron';
import { withModule } from '../lib/logger.ts';

const log = withModule('cron');

/** 调度器公共接口：Scheduler（cron）与 RandomScheduler 都实现它，context 只依赖此接口。 */
export interface SchedulerLike {
  start(): void;
  stop(): void;
  readonly isRunning: boolean;
}

export class Scheduler implements SchedulerLike {
  private task: ScheduledTask | null = null;
  private readonly expression: string;
  private readonly jobFn: () => Promise<void>;

  constructor(expression: string, jobFn: () => Promise<void>) {
    this.expression = expression;
    this.jobFn = jobFn;
    if (!cron.validate(expression)) {
      throw new Error(`非法的 cron 表达式: ${expression}`);
    }
  }

  start(): void {
    if (this.task) return;
    this.task = cron.schedule(this.expression, async () => {
      log.info('cron trigger fired');
      try {
        await this.jobFn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.error({ err: msg }, 'cron job failed');
      }
    });
    log.info({ expression: this.expression }, 'scheduler started');
  }

  stop(): void {
    this.task?.stop();
    this.task = null;
    log.info('scheduler stopped');
  }

  get isRunning(): boolean {
    return this.task !== null;
  }
}
