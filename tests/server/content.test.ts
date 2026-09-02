import { describe, it, expect } from 'vitest';
import { generateDraft } from '../../server/src/content/TemplateEngine.ts';
import {
  renderTemplate,
  getWeekdayName,
  TEMPLATES_PLAIN,
  TEMPLATES_WEATHER,
} from '../../server/src/content/templates.ts';

describe('content engine', () => {
  it('注入昵称 / 星期 / 天气 / 语气（确定性测试）', () => {
    const draft = generateDraft(
      { nickname: '小雨同学' },
      { weekday: '周六', weather: '晴空万里', mood: '元气满满' },
    );
    expect(draft.content).toContain('小雨同学');
    expect(draft.content).toContain('周六');
    expect(draft.content).toContain('晴空万里');
    expect(draft.content).toContain('元气满满');
    expect(draft.vars.nickname).toBe('小雨同学');
  });

  it('无天气时回落到纯模板（不出现空占位符）', () => {
    const draft = generateDraft({ nickname: '阿杰' }, { weekday: '周一', mood: '摸鱼中' });
    expect(draft.content).toContain('阿杰');
    expect(draft.content).not.toContain('{');
    expect(draft.content).not.toContain('undefined');
  });

  it('renderTemplate 保留未知占位符', () => {
    expect(renderTemplate('hi {name}', { name: 'x' })).toBe('hi x');
    expect(renderTemplate('a {missing} b', {})).toBe('a {missing} b');
  });

  it('getWeekdayName 映射到中文', () => {
    const d = new Date('2026-08-22T12:00:00'); // 周六
    expect(getWeekdayName(d)).toBe('周六');
  });

  it('模板库非空', () => {
    expect(TEMPLATES_PLAIN.length).toBeGreaterThan(0);
    expect(TEMPLATES_WEATHER.length).toBeGreaterThan(0);
  });
});
