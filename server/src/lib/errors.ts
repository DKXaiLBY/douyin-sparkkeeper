/**
 * 统一错误体系与 Express 中间件。
 * 业务错误携带 code / httpStatus；响应格式统一为 { code, message, data }。
 * 500（未知错误）不回传原始 err.message（可能含内部细节），只记日志、对外返回通用文案。
 */

import type { NextFunction, Request, Response } from 'express';
import { withModule } from './logger.ts';

const log = withModule('error');

/** 业务错误码（与前端展示、日志一致）。 */
export const ErrorCode = {
  INVALID_PASSPHRASE: 'INVALID_PASSPHRASE',
  VAULT_LOCKED: 'VAULT_LOCKED',
  CREDENTIAL_NOT_FOUND: 'CREDENTIAL_NOT_FOUND',
  CAPTCHA_REQUIRED: 'CAPTCHA_REQUIRED',
  LOGIN_EXPIRED: 'LOGIN_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  ADAPTER_ERROR: 'ADAPTER_ERROR',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  PAUSED: 'PAUSED',
  CONFIG_ERROR: 'CONFIG_ERROR',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  public readonly code: ErrorCodeValue;
  public readonly httpStatus: number;
  public readonly details?: unknown;

  constructor(
    code: ErrorCodeValue,
    message: string,
    httpStatus = 400,
    details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

/** 包裹 async 路由，自动 forward 异常到错误中间件。 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}

/** 统一错误中间件。 */
export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    res.status(err.httpStatus).json({
      code: err.code,
      message: err.message,
      data: err.details ?? null,
    });
    return;
  }
  // 未知错误：原始信息始终进日志（含堆栈）。
  // 自托管/开发场景（NODE_ENV !== production 或显式 EXPOSE_ERROR_DETAILS=true）把详情回传前端，
  // 便于本机排障——本服务的唯一使用者就是部署者本人；真正对外暴露时才保持脱敏。
  const detail = err instanceof Error ? err.stack ?? err.message : String(err);
  log.error({ err: detail, path: req.path, method: req.method }, 'unhandled error');
  const expose =
    process.env.NODE_ENV !== 'production' || process.env.EXPOSE_ERROR_DETAILS === 'true';
  res.status(500).json({
    code: ErrorCode.INTERNAL_ERROR,
    message: expose
      ? `服务器内部错误：${err instanceof Error ? err.message : String(err)}`
      : '服务器内部错误，请稍后重试或查看服务端日志',
    data: expose ? { detail: String(detail).split('\n').slice(0, 6).join('\n') } : null,
  });
}
