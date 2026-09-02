/**
 * /api/run — Dry Run / 立即执行 / 暂停(接管) / 恢复。
 */

import { Router } from 'express';
import type { AppContext } from '../context.ts';
import { AppError, ErrorCode, asyncHandler } from '../lib/errors.ts';
import { createRuntimeAdapter } from '../platforms/runtime.ts';
import type { PlatformAdapter } from '../platforms/PlatformAdapter.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('run');

export function runRouter(ctx: AppContext): Router {
  const router = Router();

/**
 * 从请求体中提取可选的 friendId。
 * 仅接受非空字符串，其余情况（未传/空串/非字符串）一律返回 undefined，
 * 从而保持「不传则全部发送」的向后兼容行为。
 */
function pickFriendId(body: unknown): string | undefined {
  const b = (body ?? {}) as { friendId?: unknown };
  return typeof b.friendId === 'string' && b.friendId.trim() ? b.friendId.trim() : undefined;
}

/**
 * 提取 force 标志：用户手动点击发送、当前不在错峰窗口时，前端会提示原因并询问是否强制发送。
 * 仅 true 才生效，其余（未传/非布尔）按「不强制」处理。
 */
function pickForce(body: unknown): boolean {
  const b = (body ?? {}) as { force?: unknown };
  return b.force === true;
}

  // Dry Run：真实平台下创建适配器做「链路探测」（打开页面验证定位，绝不点发送）；
  //           Mock 平台保持纯文案预览。两种情况都不发送、不落库。
  //           支持 body { friendId } 只演练指定好友。
  router.post(
    '/dry',
    asyncHandler(async (req, res) => {
      const onlyFriendId = pickFriendId(req.body);
      let adapter: PlatformAdapter | undefined;
      if (ctx.config.platform === 'douyin') {
        // 失败（凭证未导入/未解锁/浏览器未安装）会抛出，前端展示具体原因便于排障
        adapter = await createRuntimeAdapter(ctx);
      }
      try {
        const report = await ctx.sendJob.runSendJob({ dryRun: true, adapter, onlyFriendId });
        res.json({ code: 0, message: 'ok', data: report });
      } finally {
        await adapter?.close().catch(() => undefined);
      }
    }),
  );

  // 立即执行：真实发送。支持 body { friendId } 只发给指定好友（不传则全部发送）。
  router.post(
    '/now',
    asyncHandler(async (req, res) => {
      if (ctx.paused) {
        throw new AppError(ErrorCode.PAUSED, '已暂停（接管中），请先恢复', 409);
      }
      if (ctx.config.safetyMode && ctx.circuitBreaker.shouldBlock()) {
        throw new AppError(ErrorCode.RATE_LIMITED, '熔断器处于打开态，已暂停发送', 409);
      }
      const onlyFriendId = pickFriendId(req.body);
      const force = pickForce(req.body);
      const adapter = await createRuntimeAdapter(ctx);
      try {
        const report = await ctx.sendJob.runSendJob({
          dryRun: false,
          adapter,
          onlyFriendId,
          force,
        });
        res.json({ code: 0, message: 'ok', data: report });
      } finally {
        await adapter.close().catch(() => undefined);
      }
    }),
  );

  // 一键暂停（接管）
  router.post(
    '/pause',
    asyncHandler(async (_req, res) => {
      ctx.setPaused(true);
      ctx.scheduler?.stop();
      log.warn('engine paused by user (takeover)');
      res.json({ code: 0, message: 'ok', data: { paused: true } });
    }),
  );

  // 恢复
  router.post(
    '/resume',
    asyncHandler(async (_req, res) => {
      ctx.setPaused(false);
      ctx.scheduler?.start();
      log.info('engine resumed');
      res.json({ code: 0, message: 'ok', data: { paused: false } });
    }),
  );

  return router;
}
