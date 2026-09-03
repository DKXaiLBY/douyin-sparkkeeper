/**
 * reloadConfig 配置合并回归测试（PUT /api/config）
 * ============================================================
 *
 * 【为什么需要这个测试】
 * 历史上真实发生过一次**静默 bug**：
 *   server/src/context.ts 的 AppContext.reloadConfig() 是用「手工逐个列举字段」
 *   的方式把 ConfigPatch 合并进配置的（形如 `...(patch.sendMode ? { sendMode } : {})`）。
 *   后来新增配置字段 `sendMode`（每日触发模式：fixed / random）时，**漏写了这一行合并语句**，
 *   于是出现了极具迷惑性的现象：
 *     - PUT /api/config 传 {"sendMode":"fixed"} → HTTP 200、业务码 code=0（没有任何报错）
 *     - 但返回的 config 里 sendMode 仍是旧值 'random'（因为 patch 被静默丢弃了）
 *     - 前端表现：「选项点了没反应」，排查了很久才发现是后端漏合并。
 *
 *   这类 bug 的危险之处在于**它不会抛异常、不会让任何既有测试变红**，
 *   只要「新增字段」和「补合并行」这两件事不同时发生，它就一定会再次出现。
 *
 * 【本测试如何挡住它】
 *   1. 为 ConfigPatch 的**每一个**顶层字段都定义了「合并探针」FIELD_PROBES：
 *      探针会构造一个「与当前值必定不同」的补丁，调用 reloadConfig，
 *      断言合并后的值确实变了（漏合并 → 值不变 → 测试立刻变红）。
 *   2. 有一个**新增字段守卫**用例：断言 FIELD_PROBES 的键集合与
 *      configPatchSchema（运行时真实 schema）的顶层字段集合完全一致。
 *      今后只要在 ConfigPatch 里加了新字段而没补探针，该用例就会失败并打印提示，
 *      逼着改动者顺手确认 reloadConfig 是否已合并该字段。
 *   3. 覆盖嵌套对象的**深度合并**语义（只 patch 一个子字段，其余子字段不能丢），
 *      以及 sanitizeSafety 规整后的取值（断言必须按规整后的值写，否则会误报）。
 *
 * 【约束】本文件只写测试，不修改任何业务源码。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { _resetDatabaseForTest, initDatabase } from '../../server/src/db/index.ts';
import { AppContext } from '../../server/src/context.ts';
import { configPatchSchema, parseConfig } from '../../server/src/config/schema.ts';
import type { AppConfig, ConfigPatch } from '../../server/src/lib/types.ts';

// ---------------------------------------------------------------------------
// 测试脚手架：每个用例一个独立临时 dataDir + 重置 DB 单例
// （AppContext 构造函数内部会调用 initDatabase，而它是单例，必须先 _resetDatabaseForTest）
// ---------------------------------------------------------------------------

let dataDir = '';

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'sk-cfg-'));
  // initDatabase 是单例，且 AppContext 的字段初始化器（new FriendRepo 等）在构造函数体
  // 之前执行，因此必须像 server/src/index.ts 那样先 initDatabase 再 new AppContext。
  _resetDatabaseForTest();
  initDatabase(dataDir);
});

afterEach(() => {
  _resetDatabaseForTest();
  rmSync(dataDir, { recursive: true, force: true });
});

/** 构造一个可用的 AppContext（临时 dataDir，平台用 mock 避免任何真实网络/浏览器副作用）。 */
function makeContext(overrides: Record<string, unknown> = {}): AppContext {
  // 与 server/src/index.ts 的启动顺序保持一致：先 initDatabase，再 new AppContext。
  initDatabase(dataDir);
  return new AppContext(parseConfig({ dataDir, platform: 'mock', ...overrides }));
}

// ---------------------------------------------------------------------------
// 合并探针：ConfigPatch 每个顶层字段一个
// ---------------------------------------------------------------------------

interface FieldProbe {
  /** 字段中文名，失败信息里用于快速定位。 */
  label: string;
  /** 构造一个「与当前值必定不同」的补丁。 */
  patch: (before: AppConfig) => ConfigPatch;
  /** 从配置中读取该字段的值（可比较形态）。 */
  read: (cfg: AppConfig) => unknown;
  /** 合并后该字段的期望值。 */
  expected: (before: AppConfig) => unknown;
}

/**
 * 与 ConfigPatch 的顶层字段一一对应。
 * 用 `Record<keyof ConfigPatch, FieldProbe>` 约束：TS 侧若漏写会直接编译报错；
 * JS 运行时侧由下面的「新增字段守卫」用例兜底。
 */
const FIELD_PROBES: Record<keyof ConfigPatch, FieldProbe> = {
  safetyMode: {
    label: '安全模式总开关',
    patch: (b) => ({ safetyMode: !b.safetyMode }),
    read: (c) => c.safetyMode,
    expected: (b) => !b.safetyMode,
  },
  safety: {
    label: '安全策略（嵌套对象）',
    patch: () => ({ safety: { dailyCap: 7 } }),
    read: (c) => c.safety.dailyCap,
    expected: () => 7,
  },
  llm: {
    label: 'LLM 配置（嵌套对象）',
    // 只改 model，不动 enabled（避免触发 buildLlm 对凭证保险库的依赖）
    patch: () => ({ llm: { model: 'deepseek-reasoner' } }),
    read: (c) => c.llm.model,
    expected: () => 'deepseek-reasoner',
  },
  notify: {
    label: '通知通道（嵌套对象）',
    patch: () => ({
      notify: { channel: 'webhook', webhookUrl: 'https://example.com/hook' },
    }),
    read: (c) => c.notify.channel,
    expected: () => 'webhook',
  },
  cron: {
    label: '固定时刻 cron 表达式',
    patch: () => ({ cron: '0 9 * * *' }),
    read: (c) => c.cron,
    expected: () => '0 9 * * *',
  },
  sendMode: {
    // ⚠️ 本字段就是历史上漏掉合并语句的那个字段，务必保留此探针。
    label: '每日触发模式（fixed=固定时刻 / random=错峰窗口内随机）',
    patch: (b) => ({ sendMode: b.sendMode === 'fixed' ? 'random' : 'fixed' }),
    read: (c) => c.sendMode,
    expected: (b) => (b.sendMode === 'fixed' ? 'random' : 'fixed'),
  },
  weatherEnabled: {
    label: '天气变量开关',
    patch: (b) => ({ weatherEnabled: !b.weatherEnabled }),
    read: (c) => c.weatherEnabled,
    expected: (b) => !b.weatherEnabled,
  },
  platform: {
    label: '平台选择（mock / douyin）',
    patch: (b) => ({ platform: b.platform === 'mock' ? 'douyin' : 'mock' }),
    read: (c) => c.platform,
    expected: (b) => (b.platform === 'mock' ? 'douyin' : 'mock'),
  },
  content: {
    label: '内容配置·自定义文案模板（嵌套对象）',
    patch: () => ({ content: { templates: ['模板甲', '模板乙'] } }),
    read: (c) => c.content.templates.join('||'),
    expected: () => '模板甲||模板乙',
  },
};

/** 运行时真实 schema 的顶层字段集合（新增字段的唯一事实来源）。 */
const PATCH_SCHEMA_KEYS: string[] = Object.keys(configPatchSchema.shape).sort();

// ---------------------------------------------------------------------------

describe('AppContext.reloadConfig 顶层字段合并（防「漏一行」回归）', () => {
  it('【新增字段守卫】探针集合与 ConfigPatch 顶层字段完全一致', () => {
    const probeKeys = Object.keys(FIELD_PROBES).sort();
    expect(
      probeKeys,
      `ConfigPatch 的顶层字段与合并探针不一致，请在 config-merge.test.ts 的 FIELD_PROBES 中补齐，` +
        `并确认 server/src/context.ts 的 reloadConfig 已合并该字段。` +
        `schema=[${PATCH_SCHEMA_KEYS.join(', ')}] probes=[${probeKeys.join(', ')}]`,
    ).toEqual(PATCH_SCHEMA_KEYS);
  });

  // 每个顶层字段一个用例：补丁进去，值必须真的变了
  for (const key of Object.keys(FIELD_PROBES)) {
    const probe = FIELD_PROBES[key as keyof ConfigPatch];

    it(`reloadConfig 能合并 ${key}（${probe.label}）`, () => {
      const ctx = makeContext();
      const before = ctx.config;
      const beforeValue = probe.read(before);
      const expected = probe.expected(before);

      // 探针自身有效性：补丁必须产生一个与当前值不同的期望值，否则这条用例形同虚设
      expect(expected, `探针 ${key} 构造的期望值与原值相同，无法检出漏合并`).not.toEqual(
        beforeValue,
      );

      const after = ctx.reloadConfig(probe.patch(before));

      // ① 返回值里该字段已变更（前端 PUT 后拿到的就是它）
      expect(
        probe.read(after),
        `字段 ${key} 未被 reloadConfig 合并——很可能 context.ts 漏写了该字段的合并语句`,
      ).toEqual(expected);

      // ② 内存态 ctx.config 同步更新（后续请求读到的是新值）
      expect(probe.read(ctx.config)).toEqual(expected);

      // ③ 副作用检查：patch 一个字段不应影响其它顶层字段
      for (const otherKey of Object.keys(FIELD_PROBES)) {
        if (otherKey === key) continue;
        const other = FIELD_PROBES[otherKey as keyof ConfigPatch];
        expect(
          other.read(after),
          `patch ${key} 意外改动了 ${otherKey}`,
        ).toEqual(other.read(before));
      }
    });
  }

  it('一次传入全部顶层字段：每个字段都生效', () => {
    const ctx = makeContext();

    const after = ctx.reloadConfig({
      safetyMode: false,
      safety: { dailyCap: 5 },
      llm: { model: 'glm-4' },
      notify: { channel: 'telegram', telegramToken: 'tok', telegramChatId: 'chat' },
      cron: '0 8 * * *',
      sendMode: 'fixed',
      weatherEnabled: false,
      platform: 'douyin',
      content: { templates: ['全量模板'] },
    });

    expect(after.safetyMode).toBe(false);
    expect(after.safety.dailyCap).toBe(5);
    expect(after.llm.model).toBe('glm-4');
    expect(after.notify.channel).toBe('telegram');
    expect(after.notify.telegramToken).toBe('tok');
    expect(after.cron).toBe('0 8 * * *');
    expect(after.sendMode).toBe('fixed');
    expect(after.weatherEnabled).toBe(false);
    expect(after.platform).toBe('douyin');
    expect(after.content.templates).toEqual(['全量模板']);
  });

  it('空补丁不改变任何配置（幂等）', () => {
    const ctx = makeContext();
    const snapshot = JSON.parse(JSON.stringify(ctx.config)) as AppConfig;
    const after = ctx.reloadConfig({});
    expect(after).toEqual(snapshot);
    expect(ctx.config).toEqual(snapshot);
  });
});

// ---------------------------------------------------------------------------

describe('sendMode 专项回归（历史 bug：漏合并 → 前端「点了没反应」）', () => {
  it('默认 random，切换为 fixed 后立即生效', () => {
    const ctx = makeContext();
    expect(ctx.config.sendMode).toBe('random');

    const after = ctx.reloadConfig({ sendMode: 'fixed' });

    // 这就是当初静默失败的点：接口返回 code=0 但值没变
    expect(after.sendMode).toBe('fixed');
    expect(ctx.config.sendMode).toBe('fixed');
  });

  it('fixed 也能切回 random（双向可用）', () => {
    const ctx = makeContext({ sendMode: 'fixed' });
    expect(ctx.config.sendMode).toBe('fixed');

    const after = ctx.reloadConfig({ sendMode: 'random' });

    expect(after.sendMode).toBe('random');
    expect(ctx.config.sendMode).toBe('random');
  });

  it('连续来回切换，每次都真实变化（不是只在首次生效）', () => {
    const ctx = makeContext();

    expect(ctx.reloadConfig({ sendMode: 'fixed' }).sendMode).toBe('fixed');
    expect(ctx.reloadConfig({ sendMode: 'random' }).sendMode).toBe('random');
    expect(ctx.reloadConfig({ sendMode: 'fixed' }).sendMode).toBe('fixed');
  });

  it('切换 sendMode 不影响 cron / platform / safety 等既有配置', () => {
    const ctx = makeContext({ cron: '0 21 * * *', platform: 'mock' });
    const before = JSON.parse(JSON.stringify(ctx.config)) as AppConfig;

    const after = ctx.reloadConfig({ sendMode: 'fixed' });

    expect(after.sendMode).toBe('fixed');
    expect(after.cron).toBe(before.cron);
    expect(after.platform).toBe(before.platform);
    expect(after.safety).toEqual(before.safety);
    expect(after.content).toEqual(before.content);
  });

  it('合并结果会落盘：新 AppContext 执行 loadPersistedConfig 后仍是新值', () => {
    const ctx = makeContext();
    ctx.reloadConfig({ sendMode: 'fixed', cron: '0 7 * * *' });

    // 模拟进程重启：新的 AppContext 读到的是默认配置
    const reborn = new AppContext(parseConfig({ dataDir, platform: 'mock' }));
    expect(reborn.config.sendMode).toBe('random');

    reborn.loadPersistedConfig();

    expect(reborn.config.sendMode).toBe('fixed');
    expect(reborn.config.cron).toBe('0 7 * * *');
  });
});

// ---------------------------------------------------------------------------

describe('嵌套对象深度合并（只 patch 一个子字段，其余子字段不能丢）', () => {
  it('只 patch safety.dailyCap 时，staggerHours / delayMinSec / delayMaxSec 保持原值', () => {
    const ctx = makeContext({
      safety: {
        enabled: true,
        dailyCap: 20,
        delayMinSec: 30,
        delayMaxSec: 180,
        staggerHours: [19, 22],
      },
    });

    const after = ctx.reloadConfig({ safety: { dailyCap: 7 } });

    expect(after.safety.dailyCap).toBe(7);
    // 若 safety 是整体覆盖，下面三项会退化成 schema 默认值而不是原值
    expect(after.safety.staggerHours).toEqual([19, 22]);
    expect(after.safety.delayMinSec).toBe(30);
    expect(after.safety.delayMaxSec).toBe(180);
    expect(after.safety.enabled).toBe(true);
  });

  it('只 patch safety.staggerHours 时，dailyCap / 延迟区间保持原值', () => {
    const ctx = makeContext({
      safety: {
        enabled: false,
        dailyCap: 12,
        delayMinSec: 10,
        delayMaxSec: 60,
        staggerHours: [19, 22],
      },
    });

    const after = ctx.reloadConfig({ safety: { staggerHours: [8, 23] } });

    expect(after.safety.staggerHours).toEqual([8, 23]);
    expect(after.safety.dailyCap).toBe(12);
    expect(after.safety.delayMinSec).toBe(10);
    expect(after.safety.delayMaxSec).toBe(60);
    expect(after.safety.enabled).toBe(false);
  });

  it('只 patch llm.model 时，provider / baseUrl / enabled 保持原值', () => {
    const ctx = makeContext({
      llm: {
        enabled: false,
        provider: 'glm',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        model: 'glm-4',
      },
    });

    const after = ctx.reloadConfig({ llm: { model: 'glm-4-plus' } });

    expect(after.llm.model).toBe('glm-4-plus');
    expect(after.llm.provider).toBe('glm');
    expect(after.llm.baseUrl).toBe('https://open.bigmodel.cn/api/paas/v4');
    expect(after.llm.enabled).toBe(false);
  });

  it('只 patch notify.channel 时，webhookUrl 等已有子字段保持原值', () => {
    const ctx = makeContext({
      notify: { channel: 'none', webhookUrl: 'https://example.com/keep-me' },
    });
    expect(ctx.config.notify.channel).toBe('none');

    const after = ctx.reloadConfig({ notify: { channel: 'webhook' } });

    expect(after.notify.channel).toBe('webhook');
    expect(after.notify.webhookUrl).toBe('https://example.com/keep-me');
  });

  it('content.templates 是数组整体替换语义：不残留旧模板', () => {
    const ctx = makeContext({ content: { templates: ['旧模板A', '旧模板B'] } });
    expect(ctx.config.content.templates).toEqual(['旧模板A', '旧模板B']);

    const after = ctx.reloadConfig({ content: { templates: ['新模板'] } });

    expect(after.content.templates).toEqual(['新模板']);
  });

  it('patch content 不影响其它顶层配置（content 是嵌套合并，不是替换整个 config 分支）', () => {
    const ctx = makeContext({ sendMode: 'fixed', cron: '0 22 * * *' });
    const before = JSON.parse(JSON.stringify(ctx.config)) as AppConfig;

    const after = ctx.reloadConfig({ content: { templates: ['仅改文案'] } });

    expect(after.content.templates).toEqual(['仅改文案']);
    expect(after.sendMode).toBe(before.sendMode);
    expect(after.cron).toBe(before.cron);
    expect(after.safety).toEqual(before.safety);
    expect(after.llm).toEqual(before.llm);
    expect(after.notify).toEqual(before.notify);
  });
});

// ---------------------------------------------------------------------------

describe('sanitizeSafety 规整后的取值（断言必须按规整值写）', () => {
  it('staggerHours 越界被夹回 [0, 23]', () => {
    const ctx = makeContext();

    const after = ctx.reloadConfig({ safety: { staggerHours: [25, -3] } });

    // start: 25 → 23；end: max(23, -3) → 23
    expect(after.safety.staggerHours).toEqual([23, 23]);
  });

  it('delayMaxSec 小于 delayMinSec 时被抬到 delayMinSec', () => {
    const ctx = makeContext();

    const after = ctx.reloadConfig({
      safety: { delayMinSec: 300, delayMaxSec: 10 },
    });

    expect(after.safety.delayMinSec).toBe(300);
    expect(after.safety.delayMaxSec).toBe(300);
  });

  it('dailyCap 保持下限 1（不会被压到 0 或负数）', () => {
    const ctx = makeContext();

    const after = ctx.reloadConfig({ safety: { dailyCap: 1 } });

    expect(after.safety.dailyCap).toBe(1);
  });

  it('delayMinSec 非整数被向下取整（schema 允许小数，sanitizeSafety 规整）', () => {
    const ctx = makeContext();

    const after = ctx.reloadConfig({
      safety: { delayMinSec: 30.7, delayMaxSec: 180 },
    });

    expect(after.safety.delayMinSec).toBe(30);
    expect(after.safety.delayMaxSec).toBe(180);
  });

  it('越界值由 schema 明确拒绝，而不是静默丢弃（与本次回归 bug 的「静默」形成对照）', () => {
    const ctx = makeContext();

    // dailyCap 低于下限 1：schema 直接抛错，调用方（PUT /api/config）应返回 4xx，
    // 绝不能出现「返回成功但值没变」这种静默失败。
    expect(() => ctx.reloadConfig({ safety: { dailyCap: 0 } })).toThrow();
    // 配置未被污染，仍是原值
    expect(ctx.config.safety.dailyCap).toBe(20);
  });
});
