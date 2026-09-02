/**
 * GET /api/dashboard — 聚合仪表盘数据（§3 DashboardSummary）。
 */

import { Router } from 'express';
import type { AppContext } from '../context.ts';
import { asyncHandler } from '../lib/errors.ts';
import { generateDraft } from '../content/TemplateEngine.ts';
import { getWeather } from '../content/templates.ts';
import type {
  DashboardSummary,
  DueItem,
  HeatCell,
  Friend,
} from '../lib/types.ts';

const HEATMAP_DAYS = 70;

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function dashboardRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const today = dateStr(new Date());
      const now = Date.now();

      const protectedCount = ctx.friendRepo.countEnabled();
      const sentToday = ctx.resultRepo.sentTodayCount(today);
      const longestStreak = ctx.friendRepo.longestStreak();
      const successRate30d = Number(ctx.resultRepo.successRate(30).toFixed(3));

      // 今日待续
      const friends = ctx.friendRepo.list();
      const dueToday: DueItem[] = friends
        .filter((f: Friend) => f.enabled)
        .map((f: Friend) => {
          const done = !!f.lastSentAt && f.lastSentAt.slice(0, 10) === today;
          const hoursToExpire = f.nextDueAt
            ? Math.max(0, (new Date(f.nextDueAt).getTime() - now) / 3_600_000)
            : 24;
          return {
            friendId: f.id,
            nickname: f.nickname,
            hoursToExpire: Math.round(hoursToExpire),
            done,
          };
        })
        .sort((a, b) => a.hoursToExpire - b.hoursToExpire);

      // 续火日历热力（近 70 天）
      const doneDates = ctx.resultRepo.doneDates(HEATMAP_DAYS);
      const earliest = friends.reduce(
        (min: string, f: Friend) =>
          f.createdAt.slice(0, 10) < min ? f.createdAt.slice(0, 10) : min,
        today,
      );
      const heatmap: HeatCell[] = [];
      for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
        const d = dateStr(new Date(now - i * 86_400_000));
        let status: HeatCell['status'] = 'none';
        if (doneDates.has(d)) status = 'done';
        else if (d < today && d >= earliest) status = 'missed';
        heatmap.push({ date: d, status });
      }

      // 今日文案预览（取首位待续好友，无则取首位启用好友）
      const previewFriend =
        friends.find((f: Friend) => f.enabled && f.lastSentAt?.slice(0, 10) !== today) ??
        friends.find((f: Friend) => f.enabled);
      let draftPreview = {
        friendId: '',
        nickname: '',
        content: '',
        vars: {} as Record<string, string>,
      };
      if (previewFriend) {
        const weather = ctx.config.weatherEnabled ? await getWeather() : '';
        const draft = generateDraft(previewFriend, { weather });
        draftPreview = {
          friendId: previewFriend.id,
          nickname: previewFriend.nickname,
          content: draft.content,
          vars: draft.vars,
        };
      }

      const summary: DashboardSummary = {
        protectedCount,
        sentToday,
        longestStreak,
        successRate30d,
        dueToday,
        friends,
        heatmap,
        draftPreview,
      };

      res.json({ code: 0, message: 'ok', data: summary });
    }),
  );

  return router;
}
