/**
 * /api/config — 读取/更新运行配置（不含密钥明文）。
 */

import { Router } from 'express';
import type { AppContext } from '../context.ts';
import { asyncHandler } from '../lib/errors.ts';
import { parseConfigPatch } from '../config/schema.ts';
import type { AppConfig } from '../lib/types.ts';

/** 去掉敏感字段后返回配置。 */
function safeConfig(c: AppConfig) {
  return {
    ...c,
    llm: {
      ...c.llm,
      hasApiKey: !!c.llm.apiKeyEnc,
      apiKeyEnc: undefined,
    },
  };
}

export function configRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      res.json({ code: 0, message: 'ok', data: safeConfig(ctx.config) });
    }),
  );

  router.put(
    '/',
    asyncHandler(async (req, res) => {
      const patch = parseConfigPatch(req.body ?? {});
      const next = ctx.reloadConfig(patch);
      res.json({ code: 0, message: 'ok', data: safeConfig(next) });
    }),
  );

  return router;
}
