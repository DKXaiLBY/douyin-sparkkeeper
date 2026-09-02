/**
 * 四类仓储：friends / send_tasks / send_results / notifications。
 * 所有方法做 snake_case ↔ camelCase 映射，对外暴露领域类型。
 */

import { randomUUID } from 'node:crypto';
import { getDatabase } from './index.ts';
import type {
  Friend,
  FriendLevel,
  Notification,
  NotificationType,
  SendResult,
  SendStatus,
  SendTask,
} from '../lib/types.ts';

// ---------- 行映射 ----------
interface FriendRow {
  id: string;
  nickname: string;
  platform_id: string;
  remark: string | null;
  streak_days: number;
  level: string;
  enabled: number;
  timezone: string;
  last_sent_at: string | null;
  next_due_at: string | null;
  created_at: string;
}

function toFriend(r: FriendRow): Friend {
  return {
    id: r.id,
    nickname: r.nickname,
    platformId: r.platform_id,
    remark: r.remark ?? undefined,
    streakDays: r.streak_days,
    level: r.level as FriendLevel,
    enabled: r.enabled === 1,
    timezone: r.timezone,
    lastSentAt: r.last_sent_at ?? undefined,
    nextDueAt: r.next_due_at ?? '',
    createdAt: r.created_at,
  };
}

interface TaskRow {
  id: string;
  friend_id: string;
  scheduled_for: string;
  status: string;
  content: string;
  dry_run: number;
  created_at: string;
  sent_at: string | null;
}

function toTask(r: TaskRow): SendTask {
  return {
    id: r.id,
    friendId: r.friend_id,
    scheduledFor: r.scheduled_for,
    status: r.status as SendStatus,
    content: r.content,
    dryRun: r.dry_run === 1,
    createdAt: r.created_at,
    sentAt: r.sent_at ?? undefined,
  };
}

interface ResultRow {
  id: string;
  task_id: string | null;
  friend_id: string;
  success: number;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number;
  captcha_detected: number;
  retry_count: number;
  sent_at: string;
}

function toResult(r: ResultRow): SendResult {
  return {
    id: r.id,
    taskId: r.task_id ?? '',
    friendId: r.friend_id,
    success: r.success === 1,
    errorCode: r.error_code ?? undefined,
    errorMessage: r.error_message ?? undefined,
    durationMs: r.duration_ms,
    captchaDetected: r.captcha_detected === 1,
    retryCount: r.retry_count,
    sentAt: r.sent_at,
  };
}

interface NotifRow {
  id: string;
  type: string;
  channel: string;
  title: string;
  body: string;
  read: number;
  created_at: string;
}

function toNotification(r: NotifRow): Notification {
  return {
    id: r.id,
    type: r.type as NotificationType,
    channel: r.channel,
    title: r.title,
    body: r.body,
    read: r.read === 1,
    createdAt: r.created_at,
  };
}

// ---------- FriendRepo ----------
export class FriendRepo {
  private db = getDatabase();

  create(friend: Friend): void {
    this.db
      .prepare(
        `INSERT INTO friends(id,nickname,platform_id,remark,streak_days,level,enabled,timezone,last_sent_at,next_due_at,created_at)
         VALUES(@id,@nickname,@platformId,@remark,@streakDays,@level,@enabled,@timezone,@lastSentAt,@nextDueAt,@createdAt)`,
      )
      .run({
        id: friend.id,
        nickname: friend.nickname,
        platformId: friend.platformId,
        remark: friend.remark ?? null,
        streakDays: friend.streakDays,
        level: friend.level,
        enabled: friend.enabled ? 1 : 0,
        timezone: friend.timezone,
        lastSentAt: friend.lastSentAt ?? null,
        nextDueAt: friend.nextDueAt || null,
        createdAt: friend.createdAt,
      });
  }

  getById(id: string): Friend | undefined {
    const row = this.db
      .prepare('SELECT * FROM friends WHERE id = ?')
      .get(id) as FriendRow | undefined;
    return row ? toFriend(row) : undefined;
  }

  list(): Friend[] {
    const rows = this.db
      .prepare('SELECT * FROM friends ORDER BY streak_days DESC, nickname ASC')
      .all() as FriendRow[];
    return rows.map(toFriend);
  }

  /** 已启用且今天尚未发送的好友（每日续火候选）。 */
  listEnabledNotSentToday(todayDate: string): Friend[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM friends
         WHERE enabled = 1
           AND (last_sent_at IS NULL OR substr(last_sent_at,1,10) < ?)
         ORDER BY streak_days DESC`,
      )
      .all(todayDate) as FriendRow[];
    return rows.map(toFriend);
  }

  update(id: string, patch: Partial<Friend>): void {
    const current = this.getById(id);
    if (!current) return;
    const merged = { ...current, ...patch, id };
    this.db
      .prepare(
        `UPDATE friends SET nickname=@nickname, platform_id=@platformId, remark=@remark,
           streak_days=@streakDays, level=@level, enabled=@enabled, timezone=@timezone,
           last_sent_at=@lastSentAt, next_due_at=@nextDueAt WHERE id=@id`,
      )
      .run({
        id: merged.id,
        nickname: merged.nickname,
        platformId: merged.platformId,
        remark: merged.remark ?? null,
        streakDays: merged.streakDays,
        level: merged.level,
        enabled: merged.enabled ? 1 : 0,
        timezone: merged.timezone,
        lastSentAt: merged.lastSentAt ?? null,
        nextDueAt: merged.nextDueAt || null,
      });
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM friends WHERE id = ?').run(id);
  }

  /** 发送成功后累加连续天数、更新最后发送时间与下次到期。 */
  markSent(id: string, sentAtIso: string): void {
    const current = this.getById(id);
    if (!current) return;
    const nextDue = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    this.db
      .prepare(
        `UPDATE friends SET streak_days = streak_days + 1, last_sent_at = ?, next_due_at = ? WHERE id = ?`,
      )
      .run(sentAtIso, nextDue, id);
  }

  countEnabled(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM friends WHERE enabled = 1')
      .get() as { c: number };
    return row.c;
  }

  longestStreak(): number {
    const row = this.db
      .prepare('SELECT MAX(streak_days) AS m FROM friends')
      .get() as { m: number | null };
    return row.m ?? 0;
  }
}

// ---------- TaskRepo ----------
export class TaskRepo {
  private db = getDatabase();

  create(task: SendTask): void {
    this.db
      .prepare(
        `INSERT INTO send_tasks(id,friend_id,scheduled_for,status,content,dry_run,created_at,sent_at)
         VALUES(@id,@friendId,@scheduledFor,@status,@content,@dryRun,@createdAt,@sentAt)`,
      )
      .run({
        id: task.id,
        friendId: task.friendId,
        scheduledFor: task.scheduledFor,
        status: task.status,
        content: task.content,
        dryRun: task.dryRun ? 1 : 0,
        createdAt: task.createdAt,
        sentAt: task.sentAt ?? null,
      });
  }

  listByDate(date: string): SendTask[] {
    const rows = this.db
      .prepare('SELECT * FROM send_tasks WHERE scheduled_for = ? ORDER BY created_at')
      .all(date) as TaskRow[];
    return rows.map(toTask);
  }

  getById(id: string): SendTask | undefined {
    const row = this.db
      .prepare('SELECT * FROM send_tasks WHERE id = ?')
      .get(id) as TaskRow | undefined;
    return row ? toTask(row) : undefined;
  }

  updateStatus(id: string, status: SendStatus, sentAt?: string): void {
    this.db
      .prepare('UPDATE send_tasks SET status = ?, sent_at = ? WHERE id = ?')
      .run(status, sentAt ?? null, id);
  }

  listByFriend(friendId: string, limit = 30): SendTask[] {
    const rows = this.db
      .prepare('SELECT * FROM send_tasks WHERE friend_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(friendId, limit) as TaskRow[];
    return rows.map(toTask);
  }
}

// ---------- ResultRepo ----------
export class ResultRepo {
  private db = getDatabase();

  create(result: SendResult): void {
    this.db
      .prepare(
        `INSERT INTO send_results(id,task_id,friend_id,success,error_code,error_message,duration_ms,captcha_detected,retry_count,sent_at)
         VALUES(@id,@taskId,@friendId,@success,@errorCode,@errorMessage,@durationMs,@captchaDetected,@retryCount,@sentAt)`,
      )
      .run({
        id: result.id,
        taskId: result.taskId || null,
        friendId: result.friendId,
        success: result.success ? 1 : 0,
        errorCode: result.errorCode ?? null,
        errorMessage: result.errorMessage ?? null,
        durationMs: result.durationMs,
        captchaDetected: result.captchaDetected ? 1 : 0,
        retryCount: result.retryCount,
        sentAt: result.sentAt,
      });
  }

  /** 近 N 天成功率（0~1）。 */
  successRate(days: number): number {
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const total = this.db
      .prepare('SELECT COUNT(*) AS c FROM send_results WHERE sent_at >= ?')
      .get(since) as { c: number };
    if (total.c === 0) return 1;
    const succ = this.db
      .prepare(
        'SELECT COUNT(*) AS c FROM send_results WHERE sent_at >= ? AND success = 1',
      )
      .get(since) as { c: number };
    return succ.c / total.c;
  }

  /** 指定日期成功发送数（用于每日上限与仪表盘）。 */
  sentTodayCount(todayDate: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS c FROM send_results WHERE success = 1 AND substr(sent_at,1,10) = ?`,
      )
      .get(todayDate) as { c: number };
    return row.c;
  }

  recent(days = 30): SendResult[] {
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const rows = this.db
      .prepare('SELECT * FROM send_results WHERE sent_at >= ? ORDER BY sent_at DESC')
      .all(since) as ResultRow[];
    return rows.map(toResult);
  }

  /** 指定日期每位好友是否有成功记录（用于热力图）。 */
  doneDates(days: number): Map<string, boolean> {
    const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT DISTINCT substr(sent_at,1,10) AS d FROM send_results WHERE success = 1 AND sent_at >= ?`,
      )
      .all(since) as { d: string }[];
    return new Map(rows.map((r) => [r.d, true]));
  }
}

// ---------- NotificationRepo ----------
export class NotificationRepo {
  private db = getDatabase();

  create(n: Notification): void {
    this.db
      .prepare(
        `INSERT INTO notifications(id,type,channel,title,body,read,created_at)
         VALUES(@id,@type,@channel,@title,@body,@read,@createdAt)`,
      )
      .run({
        id: n.id,
        type: n.type,
        channel: n.channel,
        title: n.title,
        body: n.body,
        read: n.read ? 1 : 0,
        createdAt: n.createdAt,
      });
  }

  list(limit = 50): Notification[] {
    const rows = this.db
      .prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT ?')
      .all(limit) as NotifRow[];
    return rows.map(toNotification);
  }

  unreadCount(): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS c FROM notifications WHERE read = 0')
      .get() as { c: number };
    return row.c;
  }

  markRead(id: string): void {
    this.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  }

  markAllRead(): void {
    this.db.prepare('UPDATE notifications SET read = 1').run();
  }
}

export { randomUUID };
