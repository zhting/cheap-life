/**
 * auth.mjs —— 账号与会话。
 * 密码：scrypt（N=16384, r=8, p=1）+ 16 字节随机盐，常量时间比较。
 * 会话：32 字节随机令牌放在 HttpOnly Cookie 里，数据库只存它的 SHA-256。
 */
import { scrypt, randomBytes, timingSafeEqual, createHash } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
export const SESSION_DAYS = 30;
const DAY = 86400 * 1000;

export const USERNAME_MIN = 2;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;

function scryptAsync(password, salt, { N, r, p, keylen }) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, { N, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), { N: +N, r: +r, p: +p, keylen: expected.length });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** 不存在的账号也跑一次哈希，登录失败的耗时不泄露账号是否存在 */
let dummyHash = null;
export async function burnPasswordCheck(password) {
  if (!dummyHash) dummyHash = await hashPassword("not-a-real-password");
  await verifyPassword(password, dummyHash);
}

/** 用户名：去首尾空格、NFKC 规整；字母（含中文）、数字、下划线、连字符 */
export function normalizeUsername(raw) {
  if (typeof raw !== "string") return { error: "请填写用户名" };
  const name = raw.normalize("NFKC").trim();
  const len = Array.from(name).length;
  if (len < USERNAME_MIN || len > USERNAME_MAX) return { error: `用户名要 ${USERNAME_MIN}–${USERNAME_MAX} 个字` };
  if (!/^[\p{L}\p{N}_-]+$/u.test(name)) return { error: "用户名只能用中文、字母、数字、下划线和连字符" };
  return { name, key: name.toLowerCase() };
}

export function checkPassword(raw) {
  if (typeof raw !== "string" || raw.length === 0) return "请填写密码";
  if (raw.length < PASSWORD_MIN) return `密码至少 ${PASSWORD_MIN} 位`;
  if (raw.length > PASSWORD_MAX) return `密码最多 ${PASSWORD_MAX} 位`;
  return null;
}

export function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession(db, userId, now) {
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(tokenHash(token), userId, now, now + SESSION_DAYS * DAY);
  return token;
}

/** 按令牌取登录用户；剩不到一半有效期时顺延（返回 renewed=true 让调用方重发 Cookie） */
export function sessionUser(db, token, now) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token_hash, s.expires_at, u.id, u.username, u.created_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ?`).get(tokenHash(token));
  if (!row) return null;
  if (row.expires_at <= now) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(row.token_hash);
    return null;
  }
  let renewed = false;
  if (row.expires_at - now < (SESSION_DAYS * DAY) / 2) {
    db.prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?").run(now + SESSION_DAYS * DAY, row.token_hash);
    renewed = true;
  }
  return { id: row.id, username: row.username, createdAt: row.created_at, renewed };
}

export function deleteSession(db, token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function purgeExpiredSessions(db, now) {
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now);
}
