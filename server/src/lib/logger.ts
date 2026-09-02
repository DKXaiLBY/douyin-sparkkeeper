/**
 * 结构化日志（pino）。
 * 开发态可读文本；生产态 JSON（便于 Docker 收集）。
 * 关键事件统一携带 module 字段。
 */

import pino from 'pino';

const isProd = process.env.NODE_ENV === 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  transport: isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
  // 生产态去掉 transport，直接 JSON 到 stdout
  ...(isProd
    ? {}
    : {
        // 开发态美化
      }),
  base: { service: 'sparkkeeper' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

/** 便捷：带 module 的 child logger。 */
export function withModule(module: string) {
  return logger.child({ module });
}
