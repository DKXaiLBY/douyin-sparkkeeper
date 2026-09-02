/**
 * 运行期适配器构造：根据配置构建并登录真实/Mock 适配器。
 * 供「立即执行」与 cron 每日任务共用，确保两条路径走同一份逻辑。
 */

import { createAdapter } from './PlatformAdapter.ts';
import type { PlatformAdapter } from './PlatformAdapter.ts';
import type { AppContext } from '../context.ts';
import { AppError, ErrorCode } from '../lib/errors.ts';

export async function createRuntimeAdapter(ctx: AppContext): Promise<PlatformAdapter> {
  const platform = ctx.config.platform;
  if (platform === 'mock') {
    return createAdapter('mock');
  }
  // douyin：需要已解锁的凭证保险库
  if (!ctx.credentialStore.isUnlocked()) {
    throw new AppError(ErrorCode.VAULT_LOCKED, '凭证保险库未解锁，无法登录抖音', 401);
  }
  const storageState = ctx.credentialStore.decryptCredential();
  const adapter = await createAdapter('douyin', { headless: true });
  await adapter.login(JSON.parse(storageState));
  return adapter;
}
