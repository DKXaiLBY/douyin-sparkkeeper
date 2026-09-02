/**
 * 熔断器：连续失败达到阈值即「打开」，暂停后续发送并触发通知，
 * 防止在登录态异常/风控时持续撞墙导致封号。需人工/自愈恢复后 reset。
 */

import { withModule } from '../lib/logger.ts';

const log = withModule('circuit-breaker');

export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;
  /** 连续失败阈值（默认 3）。 */
  private readonly threshold: number;
  /** 打开后自动可重试的冷却时间（毫秒，默认 30 分钟）。 */
  private readonly cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 30 * 60 * 1000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  get isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      // 冷却结束，进入半开：允许下一次试探（reset 由调用方在成功时执行）
      return false;
    }
    return true;
  }

  /** 是否处于熔断打开态（用于暂停判断）。 */
  shouldBlock(): boolean {
    return this.isOpen;
  }

  recordSuccess(): void {
    if (this.failures !== 0 || this.openedAt !== null) {
      log.info('circuit breaker reset (success)');
    }
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.failures >= this.threshold) {
      // 冷却期内不重复打开；冷却结束后（含半开试探失败）必须能重新打开，
      // 否则熔断器会退化为「一次性」，连续失败可无限绕过保护。
      const inCooldown =
        this.openedAt !== null && Date.now() - this.openedAt < this.cooldownMs;
      if (!inCooldown) {
        const reopened = this.openedAt !== null;
        this.openedAt = Date.now();
        log.warn(
          { failures: this.failures },
          reopened ? 'circuit breaker RE-OPENED (half-open probe failed)' : 'circuit breaker OPENED',
        );
      }
    }
  }

  /** 手动/自愈恢复。 */
  reset(): void {
    this.failures = 0;
    this.openedAt = null;
  }

  get consecutiveFailures(): number {
    return this.failures;
  }
}
