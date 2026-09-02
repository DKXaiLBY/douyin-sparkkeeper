/**
 * 配置默认值与防呆边界。
 * 安全模式下限：延迟下限 ≥ 0、上限 ≥ 下限、每日上限 ≥ 1，防止误配导致风控或卡死。
 */

import type { AppConfig, SafetyConfig } from '../lib/types.ts';

export const DEFAULT_SAFETY: SafetyConfig = {
  enabled: true,
  dailyCap: 20,
  delayMinSec: 30,
  delayMaxSec: 180,
  staggerHours: [19, 22],
};

export const DEFAULT_LLM = {
  enabled: false,
  provider: 'deepseek' as const,
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
};

export const DEFAULT_NOTIFY = {
  channel: 'none' as const,
};

/** 应用级默认值（可被 env / config.json 覆盖）。 */
export function buildDefaultConfig(): Omit<AppConfig, 'dataDir'> {
  return {
    port: 3000,
    platform: 'mock',
    safetyMode: true,
    safety: { ...DEFAULT_SAFETY },
    llm: { ...DEFAULT_LLM },
    notify: { ...DEFAULT_NOTIFY },
    cron: '0 20 * * *',
    sendMode: 'random',
    weatherEnabled: true,
    passphraseMinLen: 8,
    content: { templates: [] },
  };
}

/** 安全模式边界修正，避免危险/无效配置。 */
export function sanitizeSafety(s: SafetyConfig): SafetyConfig {
  const dailyCap = Math.max(1, Math.floor(s.dailyCap));
  let delayMinSec = Math.max(0, Math.floor(s.delayMinSec));
  let delayMaxSec = Math.max(delayMinSec, Math.floor(s.delayMaxSec));
  let [start, end] = s.staggerHours;
  start = Math.min(23, Math.max(0, Math.floor(start)));
  end = Math.min(23, Math.max(start, Math.floor(end)));
  return {
    enabled: s.enabled,
    dailyCap,
    delayMinSec,
    delayMaxSec,
    staggerHours: [start, end],
  };
}
