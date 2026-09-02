/** 日期 / 连续天数格式化工具。 */

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function weekdayName(d: Date): string {
  return WEEKDAYS[d.getDay()];
}

/** 形如 "8月22日 周六"。 */
export function todayLabel(d = new Date()): string {
  return `${d.getMonth() + 1}月${d.getDate()}日 ${weekdayName(d)}`;
}

/** 小时数 → "6 小时" / "1.5 小时"。 */
export function formatHours(hours: number): string {
  if (hours <= 0) return '即将熄灭';
  if (hours < 1) return `${Math.round(hours * 60)} 分钟`;
  return `${hours.toFixed(hours >= 10 ? 0 : 1)} 小时`;
}

export function formatStreak(n: number): string {
  return `${n} 天`;
}

/** ISO 字符串 → "MM-DD HH:mm"。 */
export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
