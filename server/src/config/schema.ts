/**
 * AppConfig 的 zod schema 与校验/规整。
 * 负责：类型校验、边界防呆、缺失补全默认值。
 */

import { z } from 'zod';
import {
  buildDefaultConfig,
  sanitizeSafety,
  DEFAULT_LLM,
  DEFAULT_NOTIFY,
} from './defaults.ts';
import type { AppConfig, ConfigPatch } from '../lib/types.ts';

const safetySchema = z.object({
  enabled: z.boolean().default(true),
  dailyCap: z.number().int().min(1).max(200).default(20),
  delayMinSec: z.number().min(0).max(3600).default(30),
  delayMaxSec: z.number().min(0).max(7200).default(180),
  staggerHours: z.tuple([z.number(), z.number()]).default([19, 22]),
});

const llmSchema = z.object({
  enabled: z.boolean().default(false),
  provider: z.enum(['deepseek', 'glm', 'openai']).default('deepseek'),
  baseUrl: z.string().url().or(z.literal('')).default(DEFAULT_LLM.baseUrl),
  model: z.string().min(1).default(DEFAULT_LLM.model),
  apiKeyEnc: z.string().optional(),
});

const notifySchema = z.object({
  channel: z.enum(['webhook', 'telegram', 'none']).default('none'),
  webhookUrl: z.string().url().optional(),
  telegramToken: z.string().optional(),
  telegramChatId: z.string().optional(),
});

/** 自定义文案模板：每项去空白后 1~120 字，最多 50 条。 */
const contentSchema = z.object({
  templates: z
    .array(z.string().trim().min(1).max(120))
    .max(50)
    .default([]),
});

export const appConfigSchema = z.object({
  port: z.number().int().min(1).max(65535).default(3000),
  dataDir: z.string().min(1).default('./data'),
  platform: z.enum(['douyin', 'mock']).default('mock'),
  safetyMode: z.boolean().default(true),
  safety: safetySchema.default({}),
  llm: llmSchema.default({}),
  notify: notifySchema.default({}),
  cron: z.string().min(5).default('0 20 * * *'),
  /**
   * 每日触发模式：
   *   fixed  —— 按 cron 固定时刻触发（每天同一时间，行为规律，模式化明显）
   *   random —— 在安全模式错峰窗口内每天随机挑一个时刻触发（更拟人，默认）
   */
  sendMode: z.enum(['fixed', 'random']).default('random'),
  weatherEnabled: z.boolean().default(true),
  passphraseMinLen: z.number().int().min(4).max(64).default(8),
  content: contentSchema.default({ templates: [] }),
});

/**
 * 校验并规整为最终 AppConfig。
 * 先与默认值合并，再应用传入的部分覆盖，最后做安全边界修正。
 */
export function parseConfig(input: unknown): AppConfig {
  const merged = { ...buildDefaultConfig(), ...(input as object) };
  const parsed = appConfigSchema.parse(merged);
  parsed.safety = sanitizeSafety(parsed.safety);
  return parsed as AppConfig;
}

/** 运行期补丁校验（PUT /api/config）。 */
export const configPatchSchema = z.object({
  safetyMode: z.boolean().optional(),
  safety: z
    .object({
      enabled: z.boolean().optional(),
      dailyCap: z.number().int().min(1).max(200).optional(),
      delayMinSec: z.number().min(0).max(3600).optional(),
      delayMaxSec: z.number().min(0).max(7200).optional(),
      staggerHours: z.tuple([z.number(), z.number()]).optional(),
    })
    .strict()
    .optional(),
  llm: z
    .object({
      enabled: z.boolean().optional(),
      provider: z.enum(['deepseek', 'glm', 'openai']).optional(),
      baseUrl: z.string().optional(),
      model: z.string().optional(),
      apiKeyEnc: z.string().optional(),
    })
    .strict()
    .optional(),
  notify: z
    .object({
      channel: z.enum(['webhook', 'telegram', 'none']).optional(),
      webhookUrl: z.string().optional(),
      telegramToken: z.string().optional(),
      telegramChatId: z.string().optional(),
    })
    .strict()
    .optional(),
  cron: z.string().min(5).optional(),
  sendMode: z.enum(['fixed', 'random']).optional(),
  weatherEnabled: z.boolean().optional(),
  platform: z.enum(['douyin', 'mock']).optional(),
  content: z
    .object({
      templates: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    })
    .strict()
    .optional(),
});

export function parseConfigPatch(input: unknown): ConfigPatch {
  const r = configPatchSchema.parse(input);
  return r as ConfigPatch;
}
