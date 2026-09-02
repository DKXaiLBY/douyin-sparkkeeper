/**
 * better-sqlite3 初始化与建表（轻量迁移：CREATE TABLE IF NOT EXISTS + 版本号）。
 * 单文件数据库，个人数据量小，无需复杂 migration 框架。
 */

import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { withModule } from '../lib/logger.ts';

const log = withModule('db');

let dbInstance: Database.Database | null = null;

const SCHEMA_VERSION = 1;

const DDL = `
CREATE TABLE IF NOT EXISTS friends (
  id            TEXT PRIMARY KEY,
  nickname      TEXT NOT NULL,
  platform_id   TEXT NOT NULL,
  remark        TEXT,
  streak_days   INTEGER NOT NULL DEFAULT 0,
  level         TEXT NOT NULL DEFAULT '普通',
  enabled       INTEGER NOT NULL DEFAULT 1,
  timezone      TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  last_sent_at  TEXT,
  next_due_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS send_tasks (
  id            TEXT PRIMARY KEY,
  friend_id     TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status        TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '',
  dry_run       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  sent_at       TEXT
);

CREATE TABLE IF NOT EXISTS send_results (
  id              TEXT PRIMARY KEY,
  task_id         TEXT,
  friend_id       TEXT NOT NULL,
  success         INTEGER NOT NULL,
  error_code      TEXT,
  error_message   TEXT,
  duration_ms     INTEGER NOT NULL DEFAULT 0,
  captcha_detected INTEGER NOT NULL DEFAULT 0,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  sent_at         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  channel     TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  read        INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_date ON send_tasks(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_results_sent ON send_results(sent_at);
CREATE INDEX IF NOT EXISTS idx_friends_enabled ON friends(enabled);
`;

/** 打开并初始化数据库（幂等）。 */
export function initDatabase(dataDir: string): Database.Database {
  if (dbInstance) return dbInstance;
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  const dbPath = path.join(dataDir, 'app.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(DDL);

  const versionRow = db
    .prepare('SELECT value FROM meta WHERE key = ?')
    .get('schema_version') as { value: string } | undefined;
  if (!versionRow) {
    db.prepare('INSERT INTO meta(key, value) VALUES(?, ?)').run(
      'schema_version',
      String(SCHEMA_VERSION),
    );
  }

  dbInstance = db;
  log.info({ dbPath }, 'database initialized');
  return db;
}

/** 获取已初始化的数据库实例。 */
export function getDatabase(): Database.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return dbInstance;
}

/** 仅用于测试：重置单例（会关闭连接）。 */
export function _resetDatabaseForTest(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
