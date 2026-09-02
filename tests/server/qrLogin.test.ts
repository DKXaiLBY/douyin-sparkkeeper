/**
 * 扫码登录服务的纯逻辑单测。
 *
 * ⚠️ 这里**不启动浏览器**（沙箱无 Chromium 二进制，且不应在单测里访问抖音）。
 *    浏览器交互路径由 curl 冒烟（错误分支）+ 真实环境人工验证。
 *    本文件只覆盖：登录态 Cookie 判定、过期计算、错误映射、状态机初始/取消行为。
 */

import { describe, it, expect } from 'vitest';
import {
  QrLoginService,
  describePlaywrightLaunchError,
  hasDouyinSession,
  isSessionExpired,
} from '../../server/src/services/qrLoginService.ts';

describe('hasDouyinSession（登录态硬指标，与 DouyinWebAdapter.checkLoginState 一致）', () => {
  it('存在 sessionid 视为已登录', () => {
    expect(hasDouyinSession([{ name: 'sessionid' }])).toBe(true);
  });

  it('存在 sessionid_ss 视为已登录', () => {
    expect(hasDouyinSession([{ name: 'sessionid_ss' }])).toBe(true);
  });

  it('只有无关 Cookie 视为未登录', () => {
    expect(hasDouyinSession([{ name: 'ttwid' }, { name: 'odin_tt' }])).toBe(false);
  });

  it('空 Cookie 列表视为未登录', () => {
    expect(hasDouyinSession([])).toBe(false);
  });
});

describe('isSessionExpired（会话超时保护）', () => {
  it('未到时限不过期', () => {
    expect(isSessionExpired(10_000, 9_999)).toBe(false);
  });

  it('到达时限即过期', () => {
    expect(isSessionExpired(10_000, 10_000)).toBe(true);
    expect(isSessionExpired(10_000, 10_001)).toBe(true);
  });
});

describe('describePlaywrightLaunchError（未安装浏览器的中文提示）', () => {
  it('浏览器二进制缺失 → 给出 npx playwright install chromium 指引', () => {
    const err = describePlaywrightLaunchError(
      new Error(
        "browserType.launch: Executable doesn't exist at C:\\Users\\x\\ms-playwright\\chromium-1148\\chrome-win\\chrome.exe",
      ),
    );
    expect(err.message).toContain('npx playwright install chromium');
    expect(err.message).toContain('未检测到 Chromium');
    expect(err.code).toBe('ADAPTER_ERROR');
  });

  it('其它启动失败 → 保留原始错误信息，便于排障', () => {
    const err = describePlaywrightLaunchError(new Error('Host system is missing dependencies'));
    expect(err.message).toContain('启动浏览器失败');
    expect(err.message).toContain('Host system is missing dependencies');
  });
});

describe('QrLoginService 状态机（不涉及浏览器）', () => {
  it('初始状态为 idle', async () => {
    const svc = new QrLoginService();
    const snap = await svc.getStatus();
    expect(snap.status).toBe('idle');
    expect(snap.qr).toBeUndefined();
  });

  it('cancel 后状态为 cancelled 且无二维码', async () => {
    const svc = new QrLoginService();
    const snap = await svc.cancel();
    expect(snap.status).toBe('cancelled');
    expect(snap.qr).toBeUndefined();
  });

  it('未产生登录态时 consumeStorageState 返回 null', () => {
    const svc = new QrLoginService();
    expect(svc.consumeStorageState()).toBeNull();
  });

  it('会话时限可由构造参数注入', async () => {
    const svc = new QrLoginService({ timeoutMs: 5 * 60 * 1000 });
    // 注入 5 分钟时限后，未 start 前不应是 expired（start 前不计时）
    const snap = await svc.getStatus();
    expect(snap.status).toBe('idle');
  });
});
