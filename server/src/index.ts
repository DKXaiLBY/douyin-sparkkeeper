/**
 * 入口引导：
 *   加载配置 → 初始化数据库 → 解锁凭证(若有口令) → 填充示例数据 →
 *   构建调度器(每日触发) → 自愈检查 → 启动 Express(托管前端 + /api)
 *
 * 合规红线：绝不自动绕过验证码；检测到验证码/登录过期即暂停并推送，交人工处理。
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { loadConfig } from './config/loader.ts';
import { initDatabase } from './db/index.ts';
import { AppContext } from './context.ts';
import { Scheduler } from './scheduler/cron.ts';
import { RandomScheduler } from './scheduler/RandomScheduler.ts';
import { createRuntimeAdapter } from './platforms/runtime.ts';
import { errorMiddleware } from './lib/errors.ts';
import { withModule } from './lib/logger.ts';
import { healthRouter } from './routes/health.ts';
import { dashboardRouter } from './routes/dashboard.ts';
import { friendsRouter } from './routes/friends.ts';
import { credentialsRouter } from './routes/credentials.ts';
import { configRouter } from './routes/config.ts';
import { runRouter } from './routes/run.ts';
import { notificationsRouter } from './routes/notifications.ts';
import { settingsRouter } from './routes/settings.ts';

const log = withModule('bootstrap');
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const config = loadConfig();
  // 必须在构建 AppContext 之前初始化数据库（其仓储字段在构造时即访问数据库）。
  initDatabase(config.dataDir);
  const ctx = new AppContext(config);
  ctx.loadPersistedConfig();

  // 凭证保险库：优先用环境变量口令解锁（Docker / 自托管推荐 secret 注入）
  const passphrase = process.env.APP_PASSPHRASE;
  if (passphrase) {
    try {
      ctx.credentialStore.unlock(passphrase);
      log.info('vault unlocked from APP_PASSPHRASE');
    } catch (e) {
      log.warn({ err: String(e) }, 'APP_PASSPHRASE 解锁失败，凭证相关功能将受限');
    }
  }

  // 首次运行填充示例好友，便于仪表盘即时可见
  ctx.seedDemoIfEmpty();

  // 每日定时任务
  const jobFn = async (): Promise<void> => {
    if (ctx.paused) {
      log.info('cron skipped: engine paused');
      return;
    }
    try {
      const adapter = await createRuntimeAdapter(ctx);
      try {
        await ctx.sendJob.runSendJob({ dryRun: false, adapter });
      } finally {
        await adapter.close().catch(() => undefined);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error({ err: msg }, 'scheduled send failed');
      await ctx.notifier.push('send_failed', '定时发送失败', msg);
    }
  };
  // 触发模式：random = 错峰窗口内每日随机时刻（更拟人）；fixed = 固定 cron
  const [startHour, endHour] = config.safety.staggerHours;
  if (config.sendMode === 'random') {
    ctx.scheduler = new RandomScheduler({
      startHour,
      endHour,
      jobFn,
      // 每日随机时刻落盘：重启后同一天复用，避免重选导致补发/漏发
      dataDir: config.dataDir,
    });
  } else {
    ctx.scheduler = new Scheduler(config.cron, jobFn);
  }
  if (!ctx.paused) ctx.scheduler.start();

  // ---- 自愈检查 ----
  runSelfCheck(ctx);

  // ---- Express ----
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', healthRouter(ctx));
  app.use('/api/dashboard', dashboardRouter(ctx));
  app.use('/api/friends', friendsRouter(ctx));
  app.use('/api/credentials', credentialsRouter(ctx));
  app.use('/api/config', configRouter(ctx));
  app.use('/api/run', runRouter(ctx));
  app.use('/api/notifications', notificationsRouter(ctx));
  app.use('/api/settings', settingsRouter());

  // 前端静态资源（生产：vite build 输出到 server/public）
  const publicDir = path.join(__dirname, '..', 'public');
  if (existsSync(publicDir)) {
    app.use(express.static(publicDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      res.sendFile(path.join(publicDir, 'index.html'));
    });
  }

  // 404（JSON 统一格式）
  app.use((_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: '未找到资源', data: null });
  });

  app.use(errorMiddleware);

  const port = config.port;
  // 安全默认：本地优先，仅监听回环；Docker / 局域网部署需显式设 HOST=0.0.0.0
  const host = process.env.HOST ?? '127.0.0.1';
  app.listen(port, host, () => {
    log.info({ port, host, platform: config.platform }, 'SparkKeeper listening');
  });

  // 优雅退出
  const shutdown = () => {
    log.info('shutting down...');
    ctx.scheduler?.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function runSelfCheck(ctx: AppContext): void {
  // DB 完整性：已在 AppContext 构造时 initDatabase，这里确认仓储可读
  const friendCount = ctx.friendRepo.list().length;
  log.info({ friends: friendCount }, 'self-check: db ok');

  if (ctx.config.platform === 'douyin') {
    if (!ctx.credentialStore.isUnlocked()) {
      log.warn(
        'self-check: 抖音模式但未解锁凭证——请通过 /api/credentials/import 或 APP_PASSPHRASE 提供口令',
      );
    } else {
      log.info('self-check: vault unlocked, ready for douyin');
    }
  } else {
    log.info('self-check: mock 模式，无需凭证即可 Dry Run / 发送演练');
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error({ err: msg }, 'fatal startup error');
  process.exit(1);
});
