import { describe, it, expect } from 'vitest';
import { MockAdapter } from '../../server/src/platforms/MockAdapter.ts';
import { DouyinWebAdapter } from '../../server/src/platforms/DouyinWebAdapter.ts';
import { createAdapter } from '../../server/src/platforms/PlatformAdapter.ts';

describe('MockAdapter 接口契约', () => {
  it('工厂创建 mock 适配器', async () => {
    const a = await createAdapter('mock');
    expect(a.name).toBe('mock');
  });

  it('login 后 checkLoginState 返回 ok', async () => {
    const a = new MockAdapter();
    await a.login(null);
    expect(await a.checkLoginState()).toBe('ok');
  });

  it('默认发送成功', async () => {
    const a = new MockAdapter();
    await a.login(null);
    const r = await a.sendMessage('id1', 'hi');
    expect(r.ok).toBe(true);
  });

  it('forceCaptcha 时返回验证码标记', async () => {
    const a = new MockAdapter({ forceCaptcha: true });
    await a.login(null);
    const r = await a.sendMessage('id1', 'hi');
    expect(r.ok).toBe(false);
    expect(r.captcha).toBe(true);
  });

  it('failRate=1 时全部失败', async () => {
    const a = new MockAdapter({ failRate: 1 });
    await a.login(null);
    const r = await a.sendMessage('id1', 'hi');
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe('NETWORK');
  });
});

describe('DouyinWebAdapter 形态', () => {
  it('实例化后 name=douyin 且具备接口方法', () => {
    const a = new DouyinWebAdapter();
    expect(a.name).toBe('douyin');
    expect(typeof a.login).toBe('function');
    expect(typeof a.sendMessage).toBe('function');
    expect(typeof a.checkLoginState).toBe('function');
    expect(typeof a.detectCaptcha).toBe('function');
    expect(typeof a.close).toBe('function');
  });
});
