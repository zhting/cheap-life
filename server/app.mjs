/**
 * app.mjs —— HTTP 处理：静态页面 + /api。
 *
 *   POST   /api/auth/register  { username, password }      注册并登录
 *   POST   /api/auth/login     { username, password }      登录
 *   POST   /api/auth/logout                                退出
 *   GET    /api/me                                         当前账号（未登录时 user 为 null）
 *   GET    /api/save                                       进行中的存档 { rev, save, summary, updatedAt }
 *   PUT    /api/save           { save, rev, force? }       写存档（版本不一致 409）
 *   DELETE /api/save           { rev?, force? }            放弃这一局
 *   GET    /api/runs                                       走完的人生（最近 10 局 + 最高分）
 *
 * 防跨站：会话 Cookie 是 SameSite=Lax + HttpOnly；改动类请求必须是 application/json
 * （跨站表单发不出这种请求，跨站 fetch 会被预检拦下）。
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  hashPassword, verifyPassword, burnPasswordCheck, normalizeUsername, checkPassword,
  createSession, sessionUser, deleteSession, purgeExpiredSessions, SESSION_DAYS,
} from "./auth.mjs";
import { getSave, putSave, deleteSave, listRuns, SaveError } from "./saves.mjs";

const COOKIE = "hli_session";
const MAX_BODY = 512 * 1024;

export function createApp({ db, distDir, secureCookies = false, trustProxy = false, authLimit = 20, now = () => Date.now() }) {
  const limiter = makeLimiter(authLimit, 15 * 60 * 1000);
  let lastPurge = 0;

  async function handle(req, res) {
    const url = new URL(req.url, "http://local");
    try {
      if (url.pathname.startsWith("/api/")) {
        await handleApi(req, res, url);
      } else {
        await serveStatic(req, res, url);
      }
    } catch (err) {
      if (err instanceof SaveError) {
        sendJson(res, err.status, { error: err.message, ...err.extra });
      } else if (err && err.status) {
        sendJson(res, err.status, { error: err.message });
      } else {
        console.error(err);
        sendJson(res, 500, { error: "服务器出错了，请稍后再试" });
      }
    }
  }

  async function handleApi(req, res, url) {
    const t = now();
    if (t - lastPurge > 3600 * 1000) {
      purgeExpiredSessions(db, t);
      lastPurge = t;
    }
    const route = req.method + " " + url.pathname;
    const mutating = req.method !== "GET" && req.method !== "HEAD";
    if (mutating && !/^application\/json\b/i.test(req.headers["content-type"] || "")) {
      return sendJson(res, 415, { error: "请求格式不对" });
    }
    const token = readCookie(req, COOKIE);

    switch (route) {
      case "GET /api/health":
        return sendJson(res, 200, { ok: true });

      case "POST /api/auth/register": {
        const ip = clientIp(req);
        if (!limiter.hit("auth:" + ip, t)) return sendJson(res, 429, { error: "尝试太频繁，过 15 分钟再来" });
        const body = await readJson(req);
        const u = normalizeUsername(body.username);
        if (u.error) return sendJson(res, 400, { error: u.error, field: "username" });
        const pwErr = checkPassword(body.password);
        if (pwErr) return sendJson(res, 400, { error: pwErr, field: "password" });
        if (db.prepare("SELECT 1 FROM users WHERE username_key = ?").get(u.key)) {
          return sendJson(res, 409, { error: "这个用户名已经有人用了", field: "username" });
        }
        const hash = await hashPassword(body.password);
        let id;
        try {
          id = Number(db.prepare("INSERT INTO users (username, username_key, pass_hash, created_at) VALUES (?, ?, ?, ?)")
            .run(u.name, u.key, hash, t).lastInsertRowid);
        } catch {
          return sendJson(res, 409, { error: "这个用户名已经有人用了", field: "username" });
        }
        const tok = createSession(db, id, t);
        setSessionCookie(res, tok);
        return sendJson(res, 201, { user: { id, username: u.name } });
      }

      case "POST /api/auth/login": {
        const ip = clientIp(req);
        if (!limiter.hit("auth:" + ip, t)) return sendJson(res, 429, { error: "尝试太频繁，过 15 分钟再来" });
        const body = await readJson(req);
        const u = normalizeUsername(body.username);
        const pw = typeof body.password === "string" ? body.password : "";
        const row = u.error ? null : db.prepare("SELECT id, username, pass_hash FROM users WHERE username_key = ?").get(u.key);
        const ok = row ? await verifyPassword(pw, row.pass_hash) : (await burnPasswordCheck(pw), false);
        if (!ok) return sendJson(res, 401, { error: "用户名或密码不对" });
        const tok = createSession(db, row.id, t);
        setSessionCookie(res, tok);
        return sendJson(res, 200, { user: { id: row.id, username: row.username } });
      }

      case "POST /api/auth/logout":
        deleteSession(db, token);
        clearSessionCookie(res);
        return sendJson(res, 200, { ok: true });
    }

    const user = sessionUser(db, token, t);
    // 查登录状态不算错误：未登录回 200 + user:null，免得浏览器控制台每次打开都报 401
    if (route === "GET /api/me" && !user) {
      if (token) clearSessionCookie(res);
      return sendJson(res, 200, { user: null });
    }
    if (!user) {
      if (token) clearSessionCookie(res);
      return sendJson(res, 401, { error: "请先登录" });
    }
    if (user.renewed) setSessionCookie(res, token);

    switch (route) {
      case "GET /api/me":
        return sendJson(res, 200, { user: { id: user.id, username: user.username } });

      case "GET /api/save": {
        const s = getSave(db, user.id);
        return sendJson(res, 200, s || { rev: 0, save: null, summary: null, updatedAt: null });
      }

      case "PUT /api/save": {
        const body = await readJson(req);
        return sendJson(res, 200, putSave(db, user.id, body, t));
      }

      case "DELETE /api/save": {
        const body = await readJson(req);
        deleteSave(db, user.id, body);
        return sendJson(res, 200, { rev: 0 });
      }

      case "GET /api/runs":
        return sendJson(res, 200, listRuns(db, user.id, 10));

      default:
        return sendJson(res, 404, { error: "没有这个接口" });
    }
  }

  async function serveStatic(req, res, url) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405);
      return res.end();
    }
    if (url.pathname !== "/" && url.pathname !== "/index.html") {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("not found");
    }
    const html = await readFile(join(distDir, "index.html"));
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      ...securityHeaders(),
    });
    res.end(req.method === "HEAD" ? undefined : html);
  }

  function setSessionCookie(res, tok) {
    const parts = [`${COOKIE}=${tok}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_DAYS * 86400}`];
    if (secureCookies) parts.push("Secure");
    res.setHeader("Set-Cookie", parts.join("; "));
  }

  function clearSessionCookie(res) {
    const parts = [`${COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
    if (secureCookies) parts.push("Secure");
    res.setHeader("Set-Cookie", parts.join("; "));
  }

  function clientIp(req) {
    if (trustProxy) {
      const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
      if (fwd) return fwd;
    }
    return req.socket.remoteAddress || "?";
  }

  return handle;
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  };
}

function sendJson(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...securityHeaders() });
  res.end(JSON.stringify(obj));
}

function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error("请求太大"), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        const v = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolve(v && typeof v === "object" ? v : {});
      } catch {
        reject(Object.assign(new Error("请求不是有效的 JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

/** 固定窗口限流：每个 key 在窗口内最多 n 次 */
function makeLimiter(n, windowMs) {
  const hits = new Map();
  return {
    hit(key, t) {
      const e = hits.get(key);
      if (!e || e.reset <= t) {
        hits.set(key, { count: 1, reset: t + windowMs });
        if (hits.size > 10000) for (const [k, v] of hits) if (v.reset <= t) hits.delete(k);
        return true;
      }
      e.count += 1;
      return e.count <= n;
    },
  };
}
