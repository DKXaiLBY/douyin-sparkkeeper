/** 颜色与主题令牌（与 glass.css / 概念稿一致）。 */

export const COLORS = {
  ember: '#ff8a3d',
  rose: '#ff5d73',
  gold: '#ffd479',
  violet: '#7b6bff',
  ink: '#0b0712',
  txt: '#f4f1ff',
  txtDim: 'rgba(244,241,255,.62)',
} as const;

/** 好友等级 → 展示色（用于徽章）。 */
export const LEVEL_COLOR: Record<string, string> = {
  挚友: '#ffd479',
  聊愈: '#7b6bff',
  普通: '#f4f1ff',
  危险: '#ff5d73',
};

/** 连续天数 → 火焰 emoji（趣味化展示）。 */
export function flameFor(streakDays: number): string {
  if (streakDays >= 100) return '🔥';
  if (streakDays >= 30) return '🌟';
  if (streakDays >= 7) return '🔥';
  if (streakDays >= 1) return '💤';
  return '💤';
}
