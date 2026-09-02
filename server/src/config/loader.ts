/**
 * 配置加载器：合并 默认值 < config.json(数据目录) < 环境变量，再用 zod 校验。
 * 环境变量优先级最高，便于 Docker / secret 注入。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import { parseConfig } from './schema.ts';
import type { AppConfig } from '../lib/types.ts';

dotenv.config();

/** 环境变量 → 部分 AppConfig 映射。 */
function fromEnv(): Record<string, unknown> {
  const e = process.env;
  const out: Record<string, unknown> = {};
  if (e.PORT) out.port = Number(e.PORT);
  if (e.DATA_DIR) out.dataDir = e.DATA_DIR;
  if (e.PLATFORM) out.platform = e.PLATFORM;
  if (e.SAFETY_MODE) out.safetyMode = e.SAFETY_MODE === 'true';
  if (e.DAILY_CAP) out.safety = { ...(out.safety as object), dailyCap: Number(e.DAILY_CAP) };
  if (e.DELAY_MIN_SEC)
    out.safety = { ...(out.safety as object), delayMinSec: Number(e.DELAY_MIN_SEC) };
  if (e.DELAY_MAX_SEC)
    out.safety = { ...(out.safety as object), delayMaxSec: Number(e.DELAY_MAX_SEC) };
  if (e.STAGGER_START_HOUR || e.STAGGER_END_HOUR) {
    const s = Number(e.STAGGER_START_HOUR ?? 19);
    const en = Number(e.STAGGER_END_HOUR ?? 22);
    out.safety = { ...(out.safety as object), staggerHours: [s, en] };
  }
  if (e.CRON) out.cron = e.CRON;
  if (e.WEATHER_ENABLED) out.weatherEnabled = e.WEATHER_ENABLED === 'true';
  if (e.PASSPHRASE_MIN_LEN) out.passphraseMinLen = Number(e.PASSPHRASE_MIN_LEN);
  if (e.LLM_ENABLED) out.llm = { ...(out.llm as object), enabled: e.LLM_ENABLED === 'true' };
  if (e.LLM_PROVIDER) out.llm = { ...(out.llm as object), provider: e.LLM_PROVIDER };
  if (e.LLM_BASE_URL) out.llm = { ...(out.llm as object), baseUrl: e.LLM_BASE_URL };
  if (e.LLM_MODEL) out.llm = { ...(out.llm as object), model: e.LLM_MODEL };
  if (e.NOTIFY_CHANNEL) out.notify = { ...(out.notify as object), channel: e.NOTIFY_CHANNEL };
  if (e.NOTIFY_WEBHOOK_URL)
    out.notify = { ...(out.notify as object), webhookUrl: e.NOTIFY_WEBHOOK_URL };
  if (e.NOTIFY_TELEGRAM_TOKEN)
    out.notify = { ...(out.notify as object), telegramToken: e.NOTIFY_TELEGRAM_TOKEN };
  if (e.NOTIFY_TELEGRAM_CHAT_ID)
    out.notify = { ...(out.notify as object), telegramChatId: e.NOTIFY_TELEGRAM_CHAT_ID };
  return out;
}

/**
 * 加载配置。
 * @param dataDirOverride 可被调用方（如测试）覆盖的数据目录。
 */
export function loadConfig(dataDirOverride?: string): AppConfig {
  const base = parseConfig({});
  const dataDir = dataDirOverride ?? (process.env.DATA_DIR as string) ?? base.dataDir;

  let fileConfig: Record<string, unknown> = {};
  const configPath = path.resolve(dataDir, 'config.json');
  if (existsSync(configPath)) {
    try {
      fileConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch {
      // 损坏的 config.json 不致命，回退默认值
    }
  }

  const envConfig = fromEnv();
  const merged = {
    ...base,
    ...fileConfig,
    ...envConfig,
    dataDir,
  };
  return parseConfig(merged);
}
