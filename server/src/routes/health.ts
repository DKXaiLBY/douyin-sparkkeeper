/**
 * GET /api/health — 健康检查 + 自检摘要。
 */

import { Router } from 'express';
import type { AppContext } from '../context.ts';
import { asyncHandler } from '../lib/errors.ts';

export function healthRouter(ctx: AppContext): Router {
  const router = Router();
  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const creds = ctx.credentialStore.listCredentials();
      res.json({
        code: 0,
        message: 'ok',
        data: {
          status: 'up',
          time: new Date().toISOString(),
          platform: ctx.config.platform,
          vaultUnlocked: ctx.credentialStore.isUnlocked(),
          credentialImported: creds.length > 0,
          schedulerRunning: ctx.scheduler?.isRunning ?? false,
          paused: ctx.paused,
          safetyMode: ctx.config.safetyMode,
          friends: ctx.friendRepo.countEnabled(),
          unreadNotifications: ctx.notificationRepo.unreadCount(),
        },
      });
    }),
  );
  return router;
}
