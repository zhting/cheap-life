/**
 * db.mjs —— SQLite 数据库（Node 内置 node:sqlite，无需额外依赖）。
 * 表：users（账号）、sessions（登录会话，只存令牌的哈希）、
 *     saves（每个账号一份进行中的存档）、runs（走完的人生记录）。
 * 存档与客户端一致：种子 + 选项 + 命令日志；摘要（章节、年龄、四项状态）由服务器重放算出。
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SCHEMA_VERSION = 1;

export function openDb(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;");
  migrate(db);
  return db;
}

function migrate(db) {
  const v = db.prepare("PRAGMA user_version").get().user_version;
  if (v >= SCHEMA_VERSION) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      username_key TEXT NOT NULL UNIQUE,
      pass_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
    CREATE TABLE IF NOT EXISTS saves (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      rev INTEGER NOT NULL,
      rules_v INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      opts TEXT NOT NULL,
      log TEXT NOT NULL,
      summary TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      log_hash TEXT NOT NULL,
      rules_v INTEGER NOT NULL,
      seed INTEGER NOT NULL,
      opts TEXT NOT NULL,
      log TEXT NOT NULL,
      kind TEXT NOT NULL,
      age INTEGER NOT NULL,
      score INTEGER NOT NULL,
      cause TEXT,
      finished_at INTEGER NOT NULL,
      UNIQUE (user_id, log_hash)
    );
    CREATE INDEX IF NOT EXISTS runs_user ON runs(user_id, finished_at DESC);
    PRAGMA user_version = ${SCHEMA_VERSION};
  `);
}
