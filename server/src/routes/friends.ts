/**
 * /api/friends — 好友增删改查。
 * 防呆：nickname / platformId 长度上限 64，超长返回 400；DELETE 不存在的 id 返回 404。
 */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { AppContext } from '../context.ts';
import { AppError, ErrorCode, asyncHandler } from '../lib/errors.ts';
import type { Friend, FriendLevel } from '../lib/types.ts';
import { createRuntimeAdapter } from '../platforms/runtime.ts';

const LEVELS: FriendLevel[] = ['挚友', '聊愈', '普通', '危险'];
const MAX_STR_LEN = 64;

/** 字段长度防呆（防止超长字符串进入 DB / 选择器 / 日志）。 */
function assertStrLen(field: string, value: unknown): void {
  if (typeof value === 'string' && value.length > MAX_STR_LEN) {
    throw new AppError(
      ErrorCode.VALIDATION_ERROR,
      `${field} 长度不能超过 ${MAX_STR_LEN}`,
      400,
    );
  }
}

export function friendsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json({ code: 0, message: 'ok', data: ctx.friendRepo.list() });
    }),
  );

  /**
   * GET /api/friends/discover — 好友自动提取：登录后从抖音会话列表拉取候选好友名。
   * douyin 平台：要求凭证已解锁（未解锁抛 401 VAULT_LOCKED，前端提示先扫码）；
   * mock 平台：返回假数据，供前端联调。
   */
  router.get(
    '/discover',
    asyncHandler(async (_req, res) => {
      const adapter = await createRuntimeAdapter(ctx);
      try {
        if (!adapter.listConversations) {
          throw new AppError(
            ErrorCode.ADAPTER_ERROR,
            '当前平台不支持自动提取好友，请手动添加',
            400,
          );
        }
        const conversations = await adapter.listConversations();
        res.json({
          code: 0,
          message: 'ok',
          data: { items: conversations.map((c) => c.title) },
        });
      } finally {
        await adapter.close().catch(() => undefined);
      }
    }),
  );

  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const b = req.body ?? {};
      if (!b.nickname || !b.platformId) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, 'nickname 与 platformId 必填', 400);
      }
      assertStrLen('nickname', b.nickname);
      assertStrLen('platformId', b.platformId);
      if (b.remark !== undefined) assertStrLen('remark', b.remark);
      const level: FriendLevel = LEVELS.includes(b.level) ? b.level : '普通';
      const now = new Date();
      const friend: Friend = {
        id: randomUUID(),
        nickname: String(b.nickname),
        platformId: String(b.platformId),
        remark: b.remark ? String(b.remark) : undefined,
        streakDays: Number(b.streakDays ?? 0),
        level,
        enabled: b.enabled === undefined ? true : !!b.enabled,
        timezone: b.timezone ?? 'Asia/Shanghai',
        lastSentAt: undefined,
        nextDueAt: new Date(now.getTime() + 24 * 3600 * 1000).toISOString(),
        createdAt: now.toISOString(),
      };
      ctx.friendRepo.create(friend);
      res.json({ code: 0, message: 'ok', data: friend });
    }),
  );

  router.put(
    '/:id',
    asyncHandler(async (req, res) => {
      const b = req.body ?? {};
      if (b.nickname !== undefined) assertStrLen('nickname', b.nickname);
      if (b.platformId !== undefined) assertStrLen('platformId', b.platformId);
      if (b.remark !== undefined) assertStrLen('remark', b.remark);
      if (!ctx.friendRepo.getById(req.params.id)) {
        throw new AppError(ErrorCode.NOT_FOUND, '好友不存在', 404);
      }
      const patch: Record<string, unknown> = {};
      if (b.nickname !== undefined) patch.nickname = String(b.nickname);
      if (b.platformId !== undefined) patch.platformId = String(b.platformId);
      if (b.remark !== undefined) patch.remark = b.remark ? String(b.remark) : undefined;
      if (b.streakDays !== undefined) patch.streakDays = Number(b.streakDays);
      if (b.level !== undefined && LEVELS.includes(b.level)) patch.level = b.level;
      if (b.enabled !== undefined) patch.enabled = !!b.enabled;
      if (b.timezone !== undefined) patch.timezone = String(b.timezone);
      if (b.nextDueAt !== undefined) patch.nextDueAt = String(b.nextDueAt);
      ctx.friendRepo.update(req.params.id, patch as never);
      res.json({ code: 0, message: 'ok', data: ctx.friendRepo.getById(req.params.id) });
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      if (!ctx.friendRepo.getById(req.params.id)) {
        throw new AppError(ErrorCode.NOT_FOUND, '好友不存在', 404);
      }
      ctx.friendRepo.delete(req.params.id);
      res.json({ code: 0, message: 'ok', data: null });
    }),
  );

  return router;
}
