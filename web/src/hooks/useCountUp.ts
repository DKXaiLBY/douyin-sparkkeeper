import { useEffect, useRef, useState } from 'react';

/** 数字滚动默认时长（ms）。 */
const DEFAULT_DURATION = 700;

/** ease-out cubic：起步快、收尾稳，滚动感最自然。 */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3;
}

/**
 * 是否开启了「减少动态效果」。
 * 读不到 matchMedia（SSR / jsdom 老版本）时按「减少动画」处理，
 * 宁可不动画，也不要在不支持的环境里卡在中间帧。
 */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * 数字滚动：挂载时从 0 滚到 target，target 变化时从当前值滚到新值。
 * 尊重 prefers-reduced-motion（开启时直接跳到目标值）。
 *
 * @param target 目标数值（非有限数按 0 处理）。
 * @param duration 滚动时长（ms）。
 * @returns 当前应显示的数值（整数）。
 */
export function useCountUp(target: number, duration: number = DEFAULT_DURATION): number {
  const safeTarget = Number.isFinite(target) ? target : 0;
  const [value, setValue] = useState(0);
  /** 上一次稳定值，作为下一段动画的起点。 */
  const fromRef = useRef(0);

  useEffect(() => {
    // 减少动态效果：不做动画，直接落到目标值。
    if (prefersReducedMotion() || duration <= 0) {
      fromRef.current = safeTarget;
      setValue(safeTarget);
      return;
    }

    const from = fromRef.current;
    if (from === safeTarget) {
      setValue(safeTarget);
      return;
    }

    let raf = 0;
    let cancelled = false;
    const start = performance.now();

    const tick = (now: number): void => {
      if (cancelled) return;
      const t = Math.min(1, (now - start) / duration);
      const current = from + (safeTarget - from) * easeOut(t);
      if (t >= 1) {
        fromRef.current = safeTarget;
        setValue(safeTarget);
        return;
      }
      setValue(Math.round(current));
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [safeTarget, duration]);

  return value;
}
