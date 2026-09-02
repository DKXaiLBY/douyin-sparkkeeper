/**
 * 本地模板内容引擎（默认内容来源，零外部依赖、零遥测）。
 *
 * 纯函数：generateDraft(friend, ctx) → { content, vars }
 * 为便于测试与调度复用，ctx 中的 weekday/weather/mood 均可由调用方显式注入；
 * 未注入时按当前时间/随机语气推导。天气维度由调用方在 config.weatherEnabled
 * 时通过 getWeather 解析后传入。
 */

import {
  MOODS,
  TEMPLATES_PLAIN,
  TEMPLATES_WEATHER,
  getWeekdayName,
  pickRandom,
  renderTemplate,
} from './templates.ts';
import type { Friend } from '../lib/types.ts';

export interface GenerateContext {
  weekday?: string;
  weather?: string;
  mood?: string;
  now?: Date;
  /** 自定义模板列表（优先于内置模板）；传入空数组/未传则用内置模板。 */
  customTemplates?: string[];
}

export interface DraftResult {
  content: string;
  vars: Record<string, string>;
}

/** 生成一条拟人化文案。 */
export function generateDraft(
  friend: Pick<Friend, 'nickname'>,
  ctx: GenerateContext = {},
): DraftResult {
  const weekday = ctx.weekday ?? getWeekdayName(ctx.now ?? new Date());
  const weather = ctx.weather ?? '';
  const mood = ctx.mood ?? pickRandom(MOODS);

  // 自定义模板优先（用户希望完全掌控文案）；为空则回退内置模板
  const useWeather = weather.length > 0;
  const pool = ctx.customTemplates?.length
    ? ctx.customTemplates
    : useWeather
      ? TEMPLATES_WEATHER
      : TEMPLATES_PLAIN;
  const template = pickRandom(pool);
  const vars = {
    nickname: friend.nickname,
    weekday,
    weather,
    mood,
  };
  const content = renderTemplate(template, vars);
  return { content, vars };
}
