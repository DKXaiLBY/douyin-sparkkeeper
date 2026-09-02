/**
 * /api/notifications — 站内通知列表与已读。
 */

import { Router } from 'express';
import type { AppContext } from '../context.ts';
import { asyncHandler } from '../lib/errors.ts';

export function notificationsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const limit = Math.min(200, Number(req.query.limit ?? 50));
      res.json({
        code: 0,
        message: 'ok',
        data: {
          items: ctx.notificationRepo.list(limit),
          unread: ctx.notificationRepo.unreadCount(),
        },
      });
    }),
  );

  router.post(
    '/:id/read',
    asyncHandler(async (req, res) => {
      ctx.notificationRepo.markRead(req.params.id);
      res.json({ code: 0, message: 'ok', data: null });
    }),
  );

  router.post(
    '/read-all',
    asyncHandler(async (_req, res) => {
      ctx.notificationRepo.markAllRead();
      res.json({ code: 0, message: 'ok', data: null });
    }),
  );

  /**
   * POST /api/notifications/test
   * 用当前通知配置（webhook/telegram）发一条测试消息，用于验证通道是否配好。
   * 配置为 none（仅控制台）时，消息只进站内通知列表。
   */
  router.post(
    '/test',
    asyncHandler(async (_req, res) => {
      const channel = ctx.config.notify.channel;
      try {
        await ctx.notifier.push(
          'daily_summary',
          '测试通知',
          `这是一条测试消息。如果你通过${channel === 'telegram' ? ' Telegram' : ' Webhook'}收到它，说明通知通道配置正确 ✅`,
        );
        res.json({
          code: 0,
          message: 'ok',
          data: {
            sent: true,
            channel,
            note:
              channel === 'none'
                ? '当前是「仅控制台」模式：消息已进入站内通知（右上角铃铛），不会主动推送到外部。'
                : '已通过所选通道发送，请检查手机/应用是否收到。',
          },
        });
      } catch (e) {
        res.status(500).json({
          code: 'NOTIFY_FAILED',
          message: `发送失败：${e instanceof Error ? e.message : String(e)}`,
          data: null,
        });
      }
    }),
  );

  return router;
}
