/**
 * 每日发送编排（核心）。
 *
 * ⚠️ 关键设计：Dry Run 与真实发送「共用文案生成与调度编排」，仅最后一步不同——
 * Dry Run 不调用 adapter.send()，不写 SendResult、不改 streakDays；
 * 真实发送走 adapter.send() 并落库。两者因此天然共用同一份业务逻辑。
 */

import { randomUUID } from 'node:crypto';
import type { AppConfig, SendReport, SendReportItem } from '../lib/types.ts';
import { AppError, ErrorCode } from '../lib/errors.ts';
import { withModule } from '../lib/logger.ts';
import { FriendRepo, TaskRepo, ResultRepo } from '../db/repos.ts';
import { generateDraft } from '../content/TemplateEngine.ts';
import { getWeather } from '../content/templates.ts';
import type { LlmProvider } from '../content/LlmProvider.ts';
import type { PlatformAdapter } from '../platforms/PlatformAdapter.ts';
import { CircuitBreaker } from '../safety/circuitBreaker.ts';
import {
  backoffMs,
  randomDelayMs,
  sleep,
  underDailyCap,
  withinStaggerWindow,
} from '../safety/rateLimit.ts';
import type { Notifier } from '../notifications/notifier.ts';

const log = withModule('sendJob');

const MAX_RETRIES = 3;

export interface SendJobDeps {
  friendRepo: FriendRepo;
  taskRepo: TaskRepo;
  resultRepo: ResultRepo;
  notifier: Notifier;
  config: AppConfig;
  circuitBreaker: CircuitBreaker;
  llm?: LlmProvider | null;
  /** 真实发送时所用适配器（已登录）。 */
  adapter?: PlatformAdapter;
}

export interface RunSendJobOptions {
  dryRun: boolean;
  /** 真实模式下的适配器（Dry Run 可不传）。 */
  adapter?: PlatformAdapter;
  /**
   * 只处理指定好友（用于界面上「去发」这类单人操作）。
   * 不传则保持「全部待发好友」的默认行为，向后兼容。
   */
  onlyFriendId?: string;
  /**
   * 强制发送：跳过错峰窗口检查（仅此一项）。
   * 用于用户手动点击「去发 / 立即执行」时，当前时间不在错峰窗口内仍要发送的场景。
   * ⚠️ 每日上限、随机延迟、熔断、验证码检测等核心安全策略**不受 force 影响**，
   *    避免用户手动操作把自己"作死"。
   */
  force?: boolean;
}

export class SendJob {
  constructor(private readonly deps: SendJobDeps) {}

  async runSendJob(opts: RunSendJobOptions): Promise<SendReport> {
    const { friendRepo, resultRepo, notifier, config, circuitBreaker, llm } = this.deps;
    const dryRun = opts.dryRun;
    const adapter = opts.adapter ?? this.deps.adapter;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    const report: SendReport = {
      dryRun,
      triggeredAt: now.toISOString(),
      total: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      captchaDetected: false,
      loginState: 'unknown',
      paused: false,
      items: [],
    };

    let due = friendRepo.listEnabledNotSentToday(today);

    // ---------- 单人模式：只处理指定好友 ----------
    // 若该好友今天已发过（不在 due 中）或根本不存在，都不静默返回空报告，
    // 而是在 items 里给出可读原因，避免前端只看到「成功 0 失败 0」不知所以。
    if (opts.onlyFriendId) {
      const target = due.find((f) => f.id === opts.onlyFriendId);
      if (!target) {
        const exists = friendRepo.list().find((f) => f.id === opts.onlyFriendId);
        report.total = 0;
        report.items.push({
          friendId: opts.onlyFriendId,
          nickname: exists?.nickname ?? '未知好友',
          content: '',
          ok: false,
          skipped: true,
          skipReason: exists
            ? '这位好友今天已经发过了，不用重复发送'
            : '好友不存在或已被删除',
        });
        log.info(
          { friendId: opts.onlyFriendId, exists: !!exists },
          'single-friend run skipped',
        );
        return report;
      }
      due = [target];
    }

    report.total = due.length;
    if (due.length === 0) {
      log.info('no due friends today');
      return report;
    }

    // ---------- 登录态 / 验证码 前置检查（Dry Run 有适配器时同样执行，做真实验证）----------
    if (adapter) {
      const loginState = await adapter.checkLoginState();
      report.loginState = loginState;
      if (loginState === 'expired') {
        notifier.push('login_expired', '登录态已过期', '凭证可能失效，请手动重新登录并导入。');
        report.paused = true;
        report.pauseReason = '登录态已过期（Cookie 中无 sessionid），请重新导出 storage_state 导入';
        return report;
      }
      if (await adapter.detectCaptcha()) {
        notifier.push('captcha', '检测到验证码', '请人工处理验证码后再继续。');
        report.captchaDetected = true;
        report.paused = true;
        report.pauseReason = '检测到验证码，需人工处理（本项目不绕过验证码）';
        return report;
      }
    } else if (!dryRun) {
      throw new AppError(ErrorCode.ADAPTER_ERROR, '真实发送缺少适配器', 500);
    }

    const sentToday = dryRun ? 0 : resultRepo.sentTodayCount(today);
    const safety = config.safety;

    for (const friend of due) {
      const item: SendReportItem = {
        friendId: friend.id,
        nickname: friend.nickname,
        content: '',
        ok: false,
      };

      // 熔断保护
      if (!dryRun && circuitBreaker.shouldBlock()) {
        report.paused = true;
        report.pauseReason = '熔断器已打开（连续失败），请在「引擎控制」恢复后重试';
        item.skipped = true;
        item.skipReason = '熔断器打开（连续失败），已暂停';
        report.skipped += 1;
        report.items.push(item);
        continue;
      }

      // 安全模式：错峰窗口 + 每日上限 + 随机延迟
      if (!dryRun && safety.enabled) {
        // force（用户手动点了「去发」）时跳过窗口检查；其余安全策略照常生效
        if (!opts.force && !withinStaggerWindow(now, safety.staggerHours)) {
          item.skipped = true;
          item.skipReason = `不在错峰窗口内（${safety.staggerHours[0]}–${safety.staggerHours[1]} 点）`;
          report.skipped += 1;
          report.items.push(item);
          continue;
        }
        if (!underDailyCap(sentToday + report.sent, safety.dailyCap)) {
          item.skipped = true;
          item.skipReason = '已达每日发送上限';
          report.skipped += 1;
          report.items.push(item);
          continue;
        }
        await sleep(randomDelayMs(safety.delayMinSec, safety.delayMaxSec));
      }

      // ---------- 生成文案（Dry Run 与真实共用；自定义模板优先）----------
      const weather = config.weatherEnabled ? await getWeather() : '';
      const customTemplates = config.content?.templates;
      let content: string;
      const draftVars = { nickname: friend.nickname, weather, customTemplates };
      if (llm && llm.enabled) {
        try {
          content = await llm.generate(
            `请用一句像朋友闲聊的中文短句，称呼「${friend.nickname}」，今天${weather ? weather + '，' : ''}用来维持抖音私信火花，不要表情符号堆叠，20字以内。`,
            '你是帮助用户维持好友火花的助手，语气自然、不营销、不骚扰。',
          );
        } catch {
          content = generateDraft(friend, draftVars).content;
        }
      } else {
        content = generateDraft(friend, draftVars).content;
      }
      item.content = content;

      // ---------- Dry Run：真实验证链路（不发送、不落库）----------
      // 有 probe 能力（真实适配器）时：打开页面验证 会话/输入框/发送按钮 能否定位，绝不点击发送；
      // 无 probe 能力（MockAdapter）时：退化为纯文案预览。
      if (dryRun) {
        if (adapter && typeof adapter.probe === 'function') {
          const probe = await adapter.probe(friend.platformId);
          if (probe.ok) {
            item.ok = true;
            report.sent += 1;
          } else {
            item.ok = false;
            item.skipReason = probe.reason ?? '链路探测未通过';
            report.failed += 1;
          }
          log.info(
            { nickname: friend.nickname, probe, content },
            'DRY-RUN probe finished',
          );
        } else {
          item.ok = true;
          report.sent += 1; // 纯预览计数
          log.info({ nickname: friend.nickname, content }, 'DRY-RUN draft (preview only)');
        }
        report.items.push(item);
        continue;
      }

      // ---------- 真实发送（含退避重试）----------
      const taskId = randomUUID();
      this.deps.taskRepo.create({
        id: taskId,
        friendId: friend.id,
        scheduledFor: today,
        status: 'pending',
        content,
        dryRun: false,
        createdAt: new Date().toISOString(),
      });

      let outcomeOk = false;
      let errorCode: string | undefined;
      let captcha = false;
      const start = Date.now();
      let retry = 0;
      while (retry <= MAX_RETRIES) {
        const outcome = await adapter!.sendMessage(friend.platformId, content);
        if (outcome.captcha) {
          captcha = true;
          errorCode = 'CAPTCHA_REQUIRED';
          break;
        }
        if (outcome.ok) {
          outcomeOk = true;
          break;
        }
        errorCode = outcome.errorCode ?? 'NETWORK';
        retry += 1;
        if (retry <= MAX_RETRIES) await sleep(backoffMs(retry - 1));
      }
      const durationMs = Date.now() - start;

      this.deps.resultRepo.create({
        id: randomUUID(),
        taskId,
        friendId: friend.id,
        success: outcomeOk && !captcha,
        errorCode: captcha ? 'CAPTCHA_REQUIRED' : errorCode,
        durationMs,
        captchaDetected: captcha,
        // 统计口径：retry 为已发生的失败次数（首次成功=0；全部失败封顶 MAX_RETRIES）
        retryCount: Math.min(retry, MAX_RETRIES),
        sentAt: new Date().toISOString(),
      });
      this.deps.taskRepo.updateStatus(
        taskId,
        outcomeOk && !captcha ? 'sent' : 'failed',
        new Date().toISOString(),
      );

      if (captcha) {
        notifier.push('captcha', '发送时检测到验证码', `好友「${friend.nickname}」发送中断，请人工处理。`);
        report.captchaDetected = true;
        report.paused = true;
        item.ok = false;
        item.captcha = true;
        item.errorCode = 'CAPTCHA_REQUIRED';
        report.failed += 1;
        report.items.push(item);
        break; // 验证码必须暂停，等待人工
      }

      if (outcomeOk) {
        friendRepo.markSent(friend.id, new Date().toISOString());
        circuitBreaker.recordSuccess();
        report.sent += 1;
        item.ok = true;
      } else {
        circuitBreaker.recordFailure();
        report.failed += 1;
        item.ok = false;
        item.errorCode = errorCode;
        notifier.push(
          'send_failed',
          `发送失败：${friend.nickname}`,
          `错误码 ${errorCode ?? 'NETWORK'}，已记录。`,
        );
      }
      report.items.push(item);
    }

    // 日报（仅真实模式，且确有动作）
    if (!dryRun && report.sent + report.failed > 0) {
      notifier.push(
        'daily_summary',
        '今日续火日报',
        `成功 ${report.sent} · 失败 ${report.failed} · 跳过 ${report.skipped}` +
          (report.paused ? '（已暂停，请检查登录态/验证码）' : ''),
      );
    }

    log.info(
      { dryRun, sent: report.sent, failed: report.failed, skipped: report.skipped, paused: report.paused },
      'send job finished',
    );
    return report;
  }
}
