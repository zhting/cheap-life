/**
 * saves.mjs —— 云存档：校验、重放、乐观锁、走完一生后归档。
 * 服务器用同一个纯内核重放命令日志：重放不通过的存档一律拒收，
 * 摘要（章节、年龄、状态）也由重放得出，不信任客户端。
 */
import { createHash } from "node:crypto";
import { replay } from "../src/core/game.js";
import { RULES_VERSION } from "../src/core/params.js";
import { validateSaveShape, COMMAND_NAMES } from "../src/save/save.js";

export const MAX_LOG = 5000;

export class SaveError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || {};
  }
}

/** 校验并重放；返回 { save, state } */
export function verifySave(save) {
  if (!save || typeof save !== "object") throw new SaveError(400, "缺少存档");
  if (save.v !== RULES_VERSION) throw new SaveError(422, "存档来自不同版本的规则，无法继续");
  if (!validateSaveShape(save, COMMAND_NAMES)) throw new SaveError(400, "存档格式不对");
  if (save.log.length > MAX_LOG) throw new SaveError(413, "存档太长");
  const clean = { v: save.v, seed: save.seed >>> 0, opts: { reroll: Number(save.opts.reroll) || 0 }, log: save.log };
  const r = replay(clean.seed, clean.opts, clean.log);
  if (!r.ok) throw new SaveError(422, "存档无法重放，可能已损坏");
  return { save: clean, state: r.state };
}

export function summarize(state) {
  const b = state.bars;
  return {
    chapter: state.chapter,
    age: state.age,
    bars: { health: Math.round(b.health), money: Math.round(b.money), energy: Math.round(b.energy), freedom: Math.round(b.freedom) },
    job: state.script && state.script.cards && state.script.cards.job ? state.script.cards.job.name : "",
    habits: (state.habits || []).length,
  };
}

function rowToSave(row) {
  if (!row) return null;
  return {
    rev: row.rev,
    save: { v: row.rules_v, seed: row.seed, opts: JSON.parse(row.opts), log: JSON.parse(row.log) },
    summary: JSON.parse(row.summary),
    updatedAt: row.updated_at,
  };
}

export function getSave(db, userId) {
  return rowToSave(db.prepare("SELECT * FROM saves WHERE user_id = ?").get(userId));
}

function currentMeta(db, userId) {
  const row = db.prepare("SELECT rev, summary, updated_at FROM saves WHERE user_id = ?").get(userId);
  return row ? { rev: row.rev, summary: JSON.parse(row.summary), updatedAt: row.updated_at } : { rev: 0, summary: null, updatedAt: null };
}

/**
 * 写存档。baseRev 是客户端上次拿到的版本号，不一致说明别的设备先写过 → 409。
 * force=true 时跳过版本检查（玩家确认用这台设备的进度覆盖）。
 * 已经结束的一局：归档到 runs 并删除进行中的存档。
 */
export function putSave(db, userId, body, now) {
  const { save, state } = verifySave(body && body.save);
  if (state.ended) {
    // 网络重试：这一局已经归档过，直接返回原记录
    const done = db.prepare("SELECT * FROM runs WHERE user_id = ? AND log_hash = ?").get(userId, logHashOf(save));
    if (done) return { rev: 0, ended: true, run: runView(done) };
  }
  const meta = currentMeta(db, userId);
  const baseRev = Number(body.rev) || 0;
  if (!body.force && baseRev !== meta.rev) {
    throw new SaveError(409, "这个账号在别的地方有更新的进度", meta);
  }
  if (state.ended) {
    const run = archiveRun(db, userId, save, state, now);
    db.prepare("DELETE FROM saves WHERE user_id = ?").run(userId);
    return { rev: 0, ended: true, run };
  }
  const rev = meta.rev + 1;
  const summary = summarize(state);
  db.prepare(`
    INSERT INTO saves (user_id, rev, rules_v, seed, opts, log, summary, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET rev = excluded.rev, rules_v = excluded.rules_v, seed = excluded.seed,
      opts = excluded.opts, log = excluded.log, summary = excluded.summary, updated_at = excluded.updated_at`)
    .run(userId, rev, save.v, save.seed, JSON.stringify(save.opts), JSON.stringify(save.log), JSON.stringify(summary), now);
  return { rev, summary, updatedAt: now };
}

export function deleteSave(db, userId, body) {
  const meta = currentMeta(db, userId);
  if (body && body.rev !== undefined && !body.force && Number(body.rev) !== meta.rev) {
    throw new SaveError(409, "这个账号在别的地方有更新的进度", meta);
  }
  db.prepare("DELETE FROM saves WHERE user_id = ?").run(userId);
}

function logHashOf(save) {
  return createHash("sha256").update(JSON.stringify([save.v, save.seed, save.opts, save.log])).digest("hex");
}

function archiveRun(db, userId, save, state, now) {
  const logHash = logHashOf(save);
  const e = state.ended;
  db.prepare(`
    INSERT INTO runs (user_id, log_hash, rules_v, seed, opts, log, kind, age, score, cause, finished_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, log_hash) DO NOTHING`)
    .run(userId, logHash, save.v, save.seed, JSON.stringify(save.opts), JSON.stringify(save.log), e.kind, e.age, e.score, e.deathCause || null, now);
  const row = db.prepare("SELECT * FROM runs WHERE user_id = ? AND log_hash = ?").get(userId, logHash);
  return runView(row);
}

function runView(row) {
  return { id: row.id, seed: row.seed, kind: row.kind, age: row.age, score: row.score, cause: row.cause, finishedAt: row.finished_at };
}

export function listRuns(db, userId, limit) {
  const rows = db.prepare("SELECT * FROM runs WHERE user_id = ? ORDER BY finished_at DESC, id DESC LIMIT ?").all(userId, limit);
  const best = db.prepare("SELECT MAX(score) AS best, COUNT(*) AS n FROM runs WHERE user_id = ?").get(userId);
  return { runs: rows.map(runView), best: best.best || 0, total: best.n };
}
