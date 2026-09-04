// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Overview } from '@/components/dashboard/Overview.tsx';
import { TodoList } from '@/components/dashboard/TodoList.tsx';
import { HeatCalendar } from '@/components/dashboard/HeatCalendar.tsx';
import { OnboardingGuide } from '@/components/onboarding/OnboardingGuide.tsx';
import type { DueItem, HeatCell } from '@/api/types.ts';

// SettingsPage 挂上去就会拉接口（useConfig / useDashboard，外加 CredentialPanel、
// EngineControl 挂载即请求），jsdom 里没有真实后端，整体桩掉 api，只保留 config.get 的返回值。
vi.mock('@/api/client.ts', () => {
  const cfg = {
    port: 8787,
    dataDir: './data',
    platform: 'douyin',
    safetyMode: true,
    safety: { enabled: true, dailyCap: 20, delayMinSec: 30, delayMaxSec: 120, staggerHours: [19, 23] },
    llm: { enabled: false, provider: 'deepseek', baseUrl: '', model: '' },
    notify: { channel: 'none' },
    cron: '0 19 * * *',
    sendMode: 'random',
    weatherEnabled: false,
    passphraseMinLen: 8,
    content: { templates: ['今天也来续个火 🔥'] },
  };
  return {
    ApiError: class ApiError extends Error {},
    api: {
      health: async () => ({ ok: true, credentialImported: false, friends: 0 }),
      dashboard: async () => ({ friends: [], due: [], heatmap: [], todaySent: 0, longestStreak: 0 }),
      config: { get: async () => cfg, update: async () => cfg },
      friends: { list: async () => [], add: async () => ({}), remove: async () => ({}), pull: async () => [] },
      credentials: {
        status: async () => ({ imported: false, unlocked: false, platform: 'douyin' }),
        qrStart: async () => ({ qrUrl: '', sessionId: '' }),
        qrStatus: async () => ({ state: 'pending' }),
        qrCancel: async () => ({}),
        unlock: async () => ({ ok: true }),
        verify: async () => ({ ok: true }),
        relogin: async () => ({}),
      },
      run: {
        now: async () => ({}),
        dry: async () => ({}),
        pause: async () => ({}),
        resume: async () => ({}),
      },
      notifications: { test: async () => ({ ok: true }) },
      settings: {
        autostart: async () => ({ enabled: false }),
        setAutostart: async () => ({ enabled: false }),
      },
    },
  };
});

// SettingsPage 依赖上面的 mock，必须在 vi.mock 之后动态 import（vi.mock 会被提升到顶层，
// 但 import 语句同样被提升，所以用 await import 确保在 mock 注册后再取模块）。
const { SettingsPage } = await import('@/pages/SettingsPage.tsx');

const noop = () => undefined;

// vitest 配了 globals: false，@testing-library/react 的自动 cleanup 不会注册，
// 不手动清的话上一个 render 的 DOM 会残留，导致 getByText 命中多个元素。
afterEach(() => {
  cleanup();
});

describe('仪表盘组件', () => {
  it('Overview 渲染三项概览', () => {
    render(<Overview protectedCount={12} sentToday={8} longestStreak={23} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('23')).toBeTruthy();
    expect(screen.getByText('守护中')).toBeTruthy();
  });

  it('「今日已续 / 最长连续」为 0 时显示「—」，避免负面表达', () => {
    // 注意：守护中保留 0 —— 它是「守护范围」不是「失败次数」，
    // 显示 0 才能和「还没有守护的火花」的空状态对上。
    const { container } = render(<Overview protectedCount={0} sentToday={0} longestStreak={0} />);
    const nums = Array.from(container.querySelectorAll('.stat .n')).map((n) => n.textContent);
    expect(nums).toEqual(['0', '—', '—']);
  });
});

describe('今日待续（主角区）', () => {
  const due: DueItem[] = [
    { friendId: 'f1', nickname: '小明', hoursToExpire: 3.5, done: false },
    { friendId: 'f2', nickname: '小红', hoursToExpire: 8, done: false },
    { friendId: 'f3', nickname: '小刚', hoursToExpire: 0, done: true },
  ];

  it('顶部大数字 = 待续人数，并显示已续计数', () => {
    const { container } = render(<TodoList due={due} totalFriends={3} onSend={noop} />);
    expect(container.querySelector('.todo-hero-num')?.textContent).toBe('2');
    expect(screen.getByText('位好友待续')).toBeTruthy();
    expect(screen.getByText('已续 1 位')).toBeTruthy();
    // 未续的排前面，已续的降级排在后面，三行都要在
    expect(container.querySelectorAll('.todo-row').length).toBe(3);
    expect(container.querySelectorAll('.todo-row.is-done').length).toBe(1);
  });

  it('有待续时显示「全部发送」主按钮', () => {
    render(<TodoList due={due} totalFriends={3} onSend={noop} onSendAll={noop} />);
    expect(screen.getByText('全部发送')).toBeTruthy();
  });

  it('全部续完显示完成态，且不出现「全部发送」', () => {
    const allDone: DueItem[] = [{ friendId: 'f1', nickname: '小明', hoursToExpire: 0, done: true }];
    const { container } = render(<TodoList due={allDone} totalFriends={1} onSend={noop} onSendAll={noop} />);
    expect(container.querySelector('.todo-hero-num')?.textContent).toBe('0');
    expect(screen.getByText(/今天已全部续上/)).toBeTruthy();
    expect(screen.queryByText('全部发送')).toBeNull();
  });

  it('没有好友时显示空状态引导', () => {
    render(<TodoList due={[]} totalFriends={0} onSend={noop} onSendAll={noop} />);
    expect(screen.getByText('还没有守护的火花')).toBeTruthy();
    expect(screen.queryByText('全部发送')).toBeNull();
  });
});

describe('续火热力图（3×10 主视图 + 完整日历弹窗）', () => {
  /** 从 2026-08-01 起连续造 n 天数据，状态按 done/missed/none 轮转。 */
  const makeHeat = (n: number): HeatCell[] =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(2026, 7, 1 + i); // 本地时间，自动跨月
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { date, status: (['done', 'missed', 'none'] as const)[i % 3] };
    });

  /** 跨 8 月 + 9 月，共 46 天（8/1 起，8 月 31 天 + 9 月 15 天）。 */
  const heatmap = makeHeat(46);

  it('主视图只渲染近 30 天（3 行 × 10 列），超过部分不直接展示', () => {
    const { container } = render(<HeatCalendar heatmap={heatmap} />);
    const cells = container.querySelectorAll('.heat-main .heat-cell:not(.ghost)');
    expect(cells.length).toBe(30);
    // 主视图首格是「最近 30 天的第一天」= 2026-08-17（第 17 天，i=16 → missed）
    expect(cells[0].getAttribute('title')).toBe('2026-08-17 · 断更');
  });

  it('数据不足 30 天时按实际天数渲染，空位用 ghost 占位', () => {
    const { container } = render(<HeatCalendar heatmap={makeHeat(10)} />);
    expect(container.querySelectorAll('.heat-main .heat-cell:not(.ghost)').length).toBe(10);
    expect(container.querySelectorAll('.heat-main .heat-cell.ghost').length).toBe(20);
  });

  it('超过 30 天显示「查看完整日历」，点击弹出屏幕正中的月历弹窗', () => {
    const { container } = render(<HeatCalendar heatmap={heatmap} />);
    // 弹窗未打开时不渲染月历（portal 到 body）
    expect(document.body.querySelector('.cal-modal')).toBeNull();

    fireEvent.click(screen.getByText('查看完整日历'));

    // 弹窗出现（Portal 挂到 body），星期表头 7 个
    expect(document.body.querySelector('.cal-modal')).not.toBeNull();
    expect(document.body.querySelectorAll('.cal-wd').length).toBe(7);

    // 标题格式「YYYY 年 M 月」
    const titleEl = document.body.querySelector('.cal-title');
    expect(titleEl?.textContent ?? '').toMatch(/^\d{4} 年 \d{1,2} 月$/);
    const initialTitle = titleEl?.textContent;

    // 下一个月 → 标题变化；上一个月 → 回到当前月
    fireEvent.click(screen.getByTitle('下一个月'));
    expect(titleEl?.textContent).not.toBe(initialTitle);
    fireEvent.click(screen.getByTitle('上一个月'));
    expect(titleEl?.textContent).toBe(initialTitle);

    // 月历格子总数是 7 的倍数（28~42 格：4~6 行），不同月份天数不同也不破坏布局
    const dayCount = document.body.querySelectorAll('.cal-day').length;
    expect(dayCount % 7).toBe(0);
    expect(dayCount).toBeGreaterThanOrEqual(28);
    expect(dayCount).toBeLessThanOrEqual(42);

    // 点「关闭」按钮可关
    fireEvent.click(screen.getByText('关闭'));
    expect(document.body.querySelector('.cal-modal')).toBeNull();
    // container 里不留 portal 残留
    expect(container.querySelectorAll('.cal-modal').length).toBe(0);
  });

  it('按 Esc 可关闭月历弹窗（键盘退出是点遮罩/按钮之外的第三条路）', () => {
    render(<HeatCalendar heatmap={heatmap} />);
    fireEvent.click(screen.getByText('查看完整日历'));
    expect(document.body.querySelector('.cal-modal')).not.toBeNull();

    // 键盘事件发生在 document 上（不是某个按钮），用 keyDown 派发到 document
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.body.querySelector('.cal-modal')).toBeNull();
  });

  it('弹窗关闭后移除 Esc 监听，不残留全局监听器', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    try {
      render(<HeatCalendar heatmap={heatmap} />);
      fireEvent.click(screen.getByText('查看完整日历'));
      fireEvent.keyDown(document, { key: 'Escape' });

      // cleanup 里必须把 keydown 监听摘掉，否则每个弹窗都会往 document 上叠一层
      const removed = removeSpy.mock.calls.filter(([type]) => type === 'keydown');
      expect(removed.length).toBeGreaterThan(0);

      // 再按一次 Esc 不应有任何反应（弹窗已关，也没残留监听去改一个已卸载的状态）
      expect(() => fireEvent.keyDown(document, { key: 'Escape' })).not.toThrow();
      expect(document.body.querySelector('.cal-modal')).toBeNull();
    } finally {
      removeSpy.mockRestore();
    }
  });

  it('弹窗未打开时不响应 Esc', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    try {
      render(<HeatCalendar heatmap={heatmap} />);
      // 没点「查看完整日历」→ 不应该挂任何 keydown 监听
      expect(addSpy.mock.calls.filter(([type]) => type === 'keydown').length).toBe(0);
      expect(document.body.querySelector('.cal-modal')).toBeNull();
    } finally {
      addSpy.mockRestore();
    }
  });

  it('不超过 30 天时不显示「查看完整日历」按钮', () => {
    render(<HeatCalendar heatmap={makeHeat(20)} />);
    expect(screen.queryByText('查看完整日历')).toBeNull();
  });

  it('status → class 映射正确（done=.on / missed=.low / none=无附加 class）', () => {
    const { container } = render(<HeatCalendar heatmap={makeHeat(20)} />);
    const expectedDone = 7; // 20 天里 done 每 3 天一次 → 7 次（0,3,6,9,12,15,18）
    const expectedMissed = 7; // 1,4,7,10,13,16,19
    const expectedNone = 6; // 2,5,8,11,14,17

    expect(container.querySelectorAll('.heat-main .heat-cell.on').length).toBe(expectedDone);
    expect(container.querySelectorAll('.heat-main .heat-cell.low').length).toBe(expectedMissed);
    expect(container.querySelectorAll('.heat-main .heat-cell:not(.on):not(.low):not(.ghost)').length).toBe(expectedNone);
  });

  it('每格 title 为「日期 · 中文状态」，可悬停查看', () => {
    const { container } = render(<HeatCalendar heatmap={makeHeat(10)} />);
    const cells = container.querySelectorAll('.heat-main .heat-cell:not(.ghost)');
    expect(cells[0].getAttribute('title')).toBe('2026-08-01 · 已续');
    expect(cells[1].getAttribute('title')).toBe('2026-08-02 · 断更');
    expect(cells[2].getAttribute('title')).toBe('2026-08-03 · 未发');
  });
});

describe('首次引导（OnboardingGuide）', () => {
  const base = { onTab: noop, onDone: noop, onSnooze: noop };

  it('全新用户：3 步，第 1 步是扫码登录', () => {
    render(<OnboardingGuide {...base} hasCredential={false} hasFriends={false} />);
    expect(screen.getByText('1 / 3 · 火花守护 SparkKeeper')).toBeTruthy();
    expect(screen.getByText('扫码登录')).toBeTruthy();
  });

  it('已扫码但没好友：跳过扫码，只剩「添加好友 + 完成」两步', () => {
    render(<OnboardingGuide {...base} hasCredential hasFriends={false} />);
    expect(screen.getByText('1 / 2 · 火花守护 SparkKeeper')).toBeTruthy();
    expect(screen.getByText('添加要守护的好友')).toBeTruthy();
    expect(screen.queryByText('扫码登录')).toBeNull();
  });

  it('已加好友但没扫码：跳过好友步骤，只剩「扫码 + 完成」两步', () => {
    render(<OnboardingGuide {...base} hasCredential={false} hasFriends />);
    expect(screen.getByText('1 / 2 · 火花守护 SparkKeeper')).toBeTruthy();
    expect(screen.getByText('扫码登录')).toBeTruthy();
    expect(screen.queryByText('添加要守护的好友')).toBeNull();
  });

  it('点「去扫码登录」：跳转设置页 + 关闭遮罩（onSnooze），且不落盘（不调 onDone）', () => {
    const onTab = vi.fn();
    const onSnooze = vi.fn();
    const onDone = vi.fn();
    render(
      <OnboardingGuide
        hasCredential={false}
        hasFriends={false}
        onTab={onTab}
        onDone={onDone}
        onSnooze={onSnooze}
      />,
    );
    fireEvent.click(screen.getByText('去扫码登录'));
    expect(onTab).toHaveBeenCalledWith('settings');
    expect(onSnooze).toHaveBeenCalledTimes(1); // 遮罩必须关，否则用户点不到扫码按钮
    expect(onDone).not.toHaveBeenCalled(); // 未落盘：配置没完成，下次刷新还会按状态提醒
  });

  it('点「去添加好友」：跳仪表盘 + 关闭遮罩', () => {
    const onTab = vi.fn();
    const onSnooze = vi.fn();
    render(
      <OnboardingGuide
        hasCredential={false}
        hasFriends={false}
        onTab={onTab}
        onDone={noop}
        onSnooze={onSnooze}
      />,
    );
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('去添加好友'));
    expect(onTab).toHaveBeenCalledWith('dashboard');
    expect(onSnooze).toHaveBeenCalledTimes(1);
  });

  it('最后一步点「开始使用」：落盘（onDone），不跳页', () => {
    const onDone = vi.fn();
    const onTab = vi.fn();
    render(
      <OnboardingGuide
        hasCredential
        hasFriends={false}
        onTab={onTab}
        onDone={onDone}
        onSnooze={noop}
      />,
    );
    fireEvent.click(screen.getByText('下一步'));
    fireEvent.click(screen.getByText('开始使用'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onTab).not.toHaveBeenCalled();
  });

  it('跳过引导：直接落盘', () => {
    const onDone = vi.fn();
    render(<OnboardingGuide {...base} hasCredential={false} hasFriends={false} onDone={onDone} />);
    fireEvent.click(screen.getByText('跳过引导'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

describe('设置页：重新查看引导入口', () => {
  it('底部常驻「重新查看引导」，点击回调 App（由 App 清标记并重弹引导）', async () => {
    const onReplayOnboard = vi.fn();
    render(<SettingsPage health={null} onHealthChange={noop} onReplayOnboard={onReplayOnboard} />);

    // 底部入口要等 config 拉完才渲染（loading 期间是「加载中…」）
    const btn = await screen.findByText(/重新查看引导/);
    expect(onReplayOnboard).not.toHaveBeenCalled();

    fireEvent.click(btn);
    expect(onReplayOnboard).toHaveBeenCalledTimes(1);
  });

  it('入口在 Tab 条外面，切到任何分类都还在（不用猜它藏在哪）', async () => {
    render(<SettingsPage health={null} onHealthChange={noop} onReplayOnboard={noop} />);
    await screen.findByText(/重新查看引导/);

    for (const label of ['引擎', '账号', '安全', '通知', '文案']) {
      fireEvent.click(screen.getByRole('tab', { name: new RegExp(label) }));
      expect(screen.getByText(/重新查看引导/)).toBeTruthy();
    }
  });
});
