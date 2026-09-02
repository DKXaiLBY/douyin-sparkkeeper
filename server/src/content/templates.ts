/**
 * 文案模板库与天气数据源（Open-Meteo，免 key）。
 *
 * 设计原则：拟人化（昵称/星期/天气/随机语气），不千篇一律。
 * 变量占位符：{nickname} {weekday} {weather} {mood}
 * 天气为可选维度：提供时选用含天气模板，否则用纯模板。
 */

/** 无天气模板（每个模板均含 {nickname}/{weekday}/{mood}，保证核心变量稳定注入）。 */
export const TEMPLATES_PLAIN: string[] = [
  '{nickname}，{weekday}快乐呀～{mood}的我也来续个火花🔥',
  '{nickname}，{weekday}我{mood}，突然想到你了，来打卡啦✨',
  '{nickname}，{weekday}也要开开心心的哦，{mood}的我们说好不断火花😊',
  '在吗在吗，{nickname}？{weekday}的火花我替你记着呢，{mood}～🔥',
  '{nickname}，{weekday}今天也辛苦啦，{mood}摸鱼一下下继续聊🌟',
];

/** 含天气模板（仅当天气可用时使用；同样稳定包含 {nickname}/{weekday}/{mood}）。 */
export const TEMPLATES_WEATHER: string[] = [
  '{nickname}，{weekday}今天{weather}，{mood}的我有没有出去走走呀？🌤️',
  '{nickname}，{weather}的{weekday}，{mood}正适合发个消息给你～☀️',
  '{nickname}，{weekday}外面{weather}，{mood}记得多喝水、别太累哦💧',
  '{nickname}，{weather}的{weekday}，{mood}突然有点想找你聊天了😊',
];

/** 随机语气词（注入 {mood}）。 */
export const MOODS: string[] = [
  '元气满满',
  '摸鱼中',
  '有点想你',
  '在发呆',
  '刚搬完砖',
  '喝着奶茶',
  '晒太阳',
  '听歌ing',
];

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 由 Date 得到中文星期。 */
export function getWeekdayName(date: Date): string {
  return WEEKDAYS[date.getDay()];
}

/** 从数组中确定性/随机取一个。 */
export function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 渲染模板：将 {key} 替换为 vars 中的值，未提供的占位符原样保留。 */
export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    vars[k] !== undefined ? vars[k] : `{${k}}`,
  );
}

/** WMO weather_code → 中文简述。 */
function weatherCodeToText(code: number | undefined): string {
  if (code === undefined) return '';
  if (code === 0) return '晴空万里';
  if (code <= 3) return '多云';
  if (code <= 48) return '雾蒙蒙';
  if (code <= 67) return '下着小雨';
  if (code <= 77) return '飘着雪';
  if (code <= 82) return '阵雨';
  if (code <= 99) return '雷声滚滚';
  return '天气不错';
}

/**
 * 获取天气（Open-Meteo，免 key）。
 * 未提供经纬度时返回 ''（不注入天气维度）。
 * 任何网络异常都安全降级为 ''，绝不抛错中断发送。
 */
export async function getWeather(opts?: {
  lat?: number;
  lon?: number;
}): Promise<string> {
  if (!opts?.lat || !opts?.lon) return '';
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${opts.lat}&longitude=${opts.lon}&current=weather_code`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return '';
    const json = (await res.json()) as {
      current?: { weather_code?: number };
    };
    return weatherCodeToText(json.current?.weather_code);
  } catch {
    return '';
  }
}
