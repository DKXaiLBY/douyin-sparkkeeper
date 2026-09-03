/**
 * /api/credentials — 凭证导入 / 口令校验 / 重登录 / **扫码登录**。
 * 明文 Cookie 仅在导入瞬间存在于内存，加密后立即丢弃；落盘只有密文。
 */

import { Router } from 'express';
import type { AppContext } from '../context.ts';
import { AppError, ErrorCode, asyncHandler } from '../lib/errors.ts';
import { qrLoginService } from '../services/qrLoginService.ts';

export function credentialsRouter(ctx: AppContext): Router {
  const router = Router();

  router.get(
    '/status',
    asyncHandler(async (_req, res) => {
      const creds = ctx.credentialStore.listCredentials();
      res.json({
        code: 0,
        message: 'ok',
        data: {
          imported: creds.length > 0,
          unlocked: ctx.credentialStore.isUnlocked(),
          /** 是否已设置过保险库口令（false = 首次使用，输入任何口令都会成为新口令）。 */
          hasVerifier: ctx.credentialStore.hasVerifier(),
          count: creds.length,
        },
      });
    }),
  );

  router.post(
    '/import',
    asyncHandler(async (req, res) => {
      const b = req.body ?? {};
      if (!b.passphrase || typeof b.passphrase !== 'string') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '缺少口令 passphrase', 400);
      }
      if (!b.storageState || typeof b.storageState !== 'string') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '缺少 storageState（Cookie 文本）', 400);
      }
      // 格式校验：必须是合法的 Playwright storage_state JSON（含 cookies 数组），
      // 避免坏数据落盘后直到真实发送时才在 JSON.parse 处炸出 500。
      try {
        const parsed = JSON.parse(b.storageState) as { cookies?: unknown };
        if (!parsed || !Array.isArray(parsed.cookies)) {
          throw new Error('missing cookies array');
        }
      } catch {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          'storageState 必须是包含 cookies 数组的 Playwright storage_state JSON',
          400,
        );
      }
      // 先解锁（首次会以此口令建立 verifier）
      ctx.credentialStore.unlock(b.passphrase);
      const cred = ctx.credentialStore.importCredential(b.storageState, {
        expiresAt: b.expiresAt,
      });
      res.json({
        code: 0,
        message: 'ok',
        data: { id: cred.id, platform: cred.platform, createdAt: cred.createdAt },
      });
    }),
  );

  router.post(
    '/verify',
    asyncHandler(async (req, res) => {
      const b = req.body ?? {};
      if (!b.passphrase) {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '缺少 passphrase', 400);
      }
      const ok = ctx.credentialStore.verifyPassphrase(String(b.passphrase));
      res.json({ code: 0, message: 'ok', data: { ok } });
    }),
  );

  // 解锁保险库：配合前端「记住口令」使用——后端重启后前端用保存的口令自动解锁。
  // 注意：解锁状态仅存内存（进程生命周期），口令本身不在此接口保存。
  router.post(
    '/unlock',
    asyncHandler(async (req, res) => {
      const b = req.body ?? {};
      if (!b.passphrase || typeof b.passphrase !== 'string') {
        throw new AppError(ErrorCode.VALIDATION_ERROR, '缺少 passphrase', 400);
      }
      try {
        ctx.credentialStore.unlock(b.passphrase);
      } catch {
        throw new AppError(ErrorCode.INVALID_PASSPHRASE, '口令错误，无法解锁凭证保险库', 401);
      }
      res.json({ code: 0, message: 'ok', data: { unlocked: true } });
    }),
  );

  router.post(
    '/relogin',
    asyncHandler(async (_req, res) => {
      const result = ctx.credentialStore.requestRelogin();
      res.json({ code: 0, message: 'ok', data: result });
    }),
  );

  // ================== 扫码登录（一键配置，用户全程不碰文件） ==================

  /**
   * POST /api/credentials/qr/start
   * body: { passphrase?: string, headless?: boolean }
   *
   * 【设计取舍 · 口令在 start 阶段就要，不在扫码成功后才要】
   * 我们选择「保险库未解锁时，start 必须带 passphrase；若未提供则直接返回
   * 400 + needsPassphrase:true，由前端先收集口令再调用」。理由：
   *   1. 扫码到成功往往只有几秒。若等成功后才索要口令，用户几乎来不及输入，
   *      结果是「用户扫了、会话成功了，但凭证没落盘」→ 必须重扫一次，体验更差。
   *   2. 口令错误可以在扫码**之前**就暴露（unlock 失败 → INVALID_PASSPHRASE 401），
   *      用户改口令重试即可，不浪费一次扫码。
   *   3. 无竞态：不需要在 success 之后的窗口里再等一次前端提交口令，
   *      也避免把 storage_state 明文长时间暂存在服务端内存里等口令。
   *   4. 若保险库已解锁（例如通过 APP_PASSPHRASE 启动），passphrase 可省略，不打扰用户。
   */
  router.post(
    '/qr/start',
    asyncHandler(async (req, res) => {
      const b = (req.body ?? {}) as { passphrase?: unknown; headless?: unknown };
      const passphrase =
        typeof b.passphrase === 'string' && b.passphrase.length > 0 ? b.passphrase : undefined;

      if (!ctx.credentialStore.isUnlocked() && !passphrase) {
        throw new AppError(
          ErrorCode.VALIDATION_ERROR,
          '请先填写加密口令（用于加密保存扫码得到的登录态），再开始扫码',
          400,
          { needsPassphrase: true },
        );
      }
      if (passphrase) {
        // 口令错误 → INVALID_PASSPHRASE 401（在扫码前就暴露，避免白白扫一次）
        ctx.credentialStore.unlock(passphrase);
      }

      const headless = typeof b.headless === 'boolean' ? b.headless : undefined;
      const snap = qrLoginService.start({ headless });
      res.json({
        code: 0,
        message: 'ok',
        data: {
          status: snap.status,
          qr: snap.qr,
          message: snap.message,
          progress: snap.progress,
          needsPassphrase: false,
        },
      });
    }),
  );

  /**
   * GET /api/credentials/qr/status
   * 每次调用都会重新截取二维码（二维码会刷新）并检测登录态。
   * 登录成功时：立即取走 storage_state 明文 → 加密落盘 → 明文从内存清空。
   */
  router.get(
    '/qr/status',
    asyncHandler(async (_req, res) => {
      const snap = await qrLoginService.getStatus();
      const data: {
        status: string;
        qr?: string;
        message?: string;
        needsPassphrase: boolean;
        credentialId?: string;
        progress?: number;
      } = {
        status: snap.status,
        qr: snap.qr,
        message: snap.message,
        progress: snap.progress,
        needsPassphrase: !ctx.credentialStore.isUnlocked(),
      };

      if (snap.status === 'success') {
        const stateText = qrLoginService.consumeStorageState();
        if (stateText) {
          try {
            const cred = ctx.credentialStore.importCredential(stateText, {});
            data.credentialId = cred.id;
            data.message = '登录成功，凭证已加密保存';
          } catch (e) {
            data.status = 'error';
            data.message =
              e instanceof Error ? `登录已成功，但保存凭证失败：${e.message}` : '登录已成功，但保存凭证失败';
          }
        } else {
          data.message = '登录成功，凭证已加密保存';
        }
      }

      res.json({ code: 0, message: 'ok', data });
    }),
  );

  /** POST /api/credentials/qr/cancel — 关闭浏览器并清理会话。 */
  router.post(
    '/qr/cancel',
    asyncHandler(async (_req, res) => {
      await qrLoginService.cancel();
      res.json({ code: 0, message: 'ok', data: { ok: true } });
    }),
  );

  return router;
}
