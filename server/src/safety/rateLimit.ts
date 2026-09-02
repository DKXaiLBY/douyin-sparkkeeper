/**
 * 安全模式：随机延迟、错峰窗口、每日上限。
 * 目标：让发送行为更像真人，降低被风控识别的概率。
 * 仅当 safety.enabled 时由 sendJob 启用；Dry Run 不应用。
 */

import type { SafetyConfig } from '../lib/types.ts';

/** 在 [minSec, maxSec] 之间取随机延迟（毫秒）。 */
export function randomDelayMs(minSec: number, maxSec: number): number {
  const min = Math.max(0, Math.min(minSec, maxSec));
  const max = Math.max(minSec, maxSec);
  const sec = min + Math.random() * (max - min);
  return Math.round(sec * 1000);
}

/** 当前时刻是否落在错峰窗口 [start, end] 内（含端点）。 */
export function withinStaggerWindow(
  date: Date,
  window: [number, number],
): boolean {
  const hour = date.getHours();
  const [start, end] = window;
  if (start <= end) return hour >= start && hour <= end;
  // 跨午夜窗口，如 [22, 6]
  return hour >= start || hour <= end;
}

/** 是否仍在每日人数上限以内。 */
export function underDailyCap(sent: number, cap: number): boolean {
  return sent < cap;
}

/** Promise 版的延时。 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 指数退避（用于失败重试）：attempt 从 0 开始。 */
export function backoffMs(attempt: number, base = 2000): number {
  return base * 2 ** attempt;
}

/** 校验安全模式参数是否处于合理范围（防呆）。 */
export function isSafetySane(s: SafetyConfig): boolean {
  return (
    s.dailyCap >= 1 &&
    s.delayMinSec >= 0 &&
    s.delayMaxSec >= s.delayMinSec &&
    s.staggerHours[0] >= 0 &&
    s.staggerHours[1] >= 0 &&
    s.staggerHours[1] < 24 &&
    s.staggerHours[0] < 24
  );
}
