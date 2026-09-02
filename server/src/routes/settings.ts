/**
 * /api/settings — 系统级设置（开机自启）。
 * 仅 Windows 实现：通过注册表 Run 键 + 静默启动脚本。
 * 非 Windows 平台返回明确提示（暂不支持）。
 */

import { Router } from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { asyncHandler } from '../lib/errors.ts';
import { withModule } from '../lib/logger.ts';

const log = withModule('settings');
const execFileAsync = promisify(execFile);

const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const APP_NAME = 'SparkKeeper';

/** 项目根目录（server/src/routes/settings.ts → 项目根）。 */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** 写入注册表 Run 键的命令：隐藏窗口运行后台启动脚本。 */
function startCommand(): string {
  const script = path.join(PROJECT_ROOT, 'start-background.ps1');
  return `powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${script}"`;
}

/** 查询注册表 Run 键是否已注册 SparkKeeper。 */
async function isAutostartEnabled(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      'powershell.exe',
      ['-NoProfile', '-Command', `(Get-ItemProperty -Path '${RUN_KEY}' -Name '${APP_NAME}' -ErrorAction SilentlyContinue) -ne $null`],
      { timeout: 8000 },
    );
    return stdout.trim() === 'True';
  } catch (e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, 'query autostart failed');
    return false;
  }
}

export function settingsRouter(): Router {
  const router = Router();

  /** GET /api/settings/autostart → { enabled } */
  router.get(
    '/autostart',
    asyncHandler(async (_req, res) => {
      res.json({ code: 0, message: 'ok', data: { enabled: await isAutostartEnabled() } });
    }),
  );

  /** POST /api/settings/autostart body { enabled: boolean } */
  router.post(
    '/autostart',
    asyncHandler(async (req, res) => {
      if (process.platform !== 'win32') {
        res.status(400).json({ code: 'PLATFORM_UNSUPPORTED', message: '开机自启目前仅支持 Windows', data: null });
        return;
      }
      const enabled = Boolean((req.body ?? {}).enabled);
      if (enabled) {
        await execFileAsync(
          'powershell.exe',
          ['-NoProfile', '-Command', `Set-ItemProperty -Path '${RUN_KEY}' -Name '${APP_NAME}' -Value '${startCommand()}'`],
          { timeout: 10000 },
        );
        log.info('autostart enabled');
      } else {
        await execFileAsync(
          'powershell.exe',
          ['-NoProfile', '-Command', `Remove-ItemProperty -Path '${RUN_KEY}' -Name '${APP_NAME}' -ErrorAction SilentlyContinue`],
          { timeout: 10000 },
        );
        log.info('autostart disabled');
      }
      res.json({ code: 0, message: 'ok', data: { enabled } });
    }),
  );

  return router;
}
