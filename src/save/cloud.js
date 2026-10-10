/**
 * cloud.js —— 账号与云存档（浏览器端）。
 * 只发同源请求；会话在 HttpOnly Cookie 里，脚本碰不到令牌。
 * 云存档按命令自动保存：每条命令后排队，停手 700ms 再一次性 PUT 最新的整份存档；
 * 带上次的版本号 rev，别的设备先写过时服务器回 409，交给界面让玩家选。
 * 断网时保留待存的那份，隔一会儿重试；关页面时用 keepalive 再发一次。
 */

const DEBOUNCE_MS = 700;
const RETRY_MS = [2000, 5000, 15000, 30000];

/** 页面是不是由游戏服务器提供的（file:// 打开就只能游客模式） */
export function serverPossible() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

async function request(method, path, body, extra) {
  const init = {
    method,
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    ...(extra || {}),
  };
  if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await window.fetch(path, init);
  } catch {
    return { ok: false, status: 0, data: { error: "连不上服务器" } };
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = { error: "服务器返回了看不懂的内容" };
  }
  return { ok: res.ok, status: res.status, data: data || {} };
}

/** 查登录状态：{ online, user } —— online=false 表示没有可用的服务器 */
export async function whoAmI() {
  if (!serverPossible()) return { online: false, user: null };
  const r = await request("GET", "/api/me");
  if (r.ok) return { online: true, user: r.data.user || null };
  if (r.status === 401) return { online: true, user: null };
  return { online: false, user: null };
}

export function login(username, password) {
  return request("POST", "/api/auth/login", { username, password });
}

export function register(username, password) {
  return request("POST", "/api/auth/register", { username, password });
}

export function logout() {
  return request("POST", "/api/auth/logout", {});
}

export function fetchSave() {
  return request("GET", "/api/save");
}

export function fetchRuns() {
  return request("GET", "/api/runs");
}

export function deleteCloudSave(rev) {
  return request("DELETE", "/api/save", { rev, force: true });
}

/**
 * 自动云存档。
 * hooks.onStatus(status)：saved / saving / pending（等重试）/ conflict / error
 * hooks.onConflict(info)：服务器上有更新的进度（info 含对方的 summary）
 * hooks.onEnded(run)：走完的一局已归档
 * hooks.onRejected(message)：服务器拒收（存档无法重放等），不再重试
 */
export function makeCloudSaver(hooks) {
  let rev = 0;
  let pending = null; // 还没写到服务器的最新存档
  let inflight = false;
  let timer = 0;
  let retryIdx = 0;
  let status = "saved";
  let blocked = false; // 冲突或拒收后暂停，等玩家决定
  let lastSavedAt = 0;

  function setStatus(s) {
    status = s;
    if (hooks.onStatus) hooks.onStatus(s);
  }

  function schedule(ms) {
    window.clearTimeout(timer);
    timer = window.setTimeout(send, ms);
  }

  async function send(force) {
    timer = 0;
    if (!pending || inflight || (blocked && !force)) return;
    inflight = true;
    const save = pending;
    setStatus("saving");
    const r = await request("PUT", "/api/save", { save, rev, force: !!force });
    inflight = false;
    if (r.ok) {
      if (pending === save) pending = null;
      retryIdx = 0;
      blocked = false;
      rev = r.data.rev || 0;
      lastSavedAt = Date.now();
      if (r.data.ended && hooks.onEnded) hooks.onEnded(r.data.run);
      setStatus(pending ? "saving" : "saved");
      if (pending) schedule(DEBOUNCE_MS);
      return;
    }
    if (r.status === 409) {
      blocked = true;
      setStatus("conflict");
      if (hooks.onConflict) hooks.onConflict(r.data);
      return;
    }
    if (r.status === 401 || r.status === 400 || r.status === 413 || r.status === 422) {
      blocked = true;
      setStatus("error");
      if (hooks.onRejected) hooks.onRejected(r.data.error || "云存档失败", r.status);
      return;
    }
    // 断网或服务器出错：保留 pending，退避重试
    setStatus("pending");
    schedule(RETRY_MS[Math.min(retryIdx++, RETRY_MS.length - 1)]);
  }

  return {
    get rev() { return rev; },
    get status() { return status; },
    get lastSavedAt() { return lastSavedAt; },
    get dirty() { return !!pending || inflight; },
    setRev(r) {
      rev = r || 0;
      blocked = false;
    },
    /** 排队一份最新存档（覆盖之前没发出去的） */
    queue(save) {
      pending = save;
      if (!blocked) {
        setStatus(inflight ? "saving" : status === "pending" ? "pending" : "saving");
        schedule(DEBOUNCE_MS);
      }
    },
    /** 立刻发（结局、退出登录前） */
    async flush() {
      window.clearTimeout(timer);
      while (inflight) await new Promise((r) => window.setTimeout(r, 50));
      if (pending && !blocked) await send(false);
      return !pending;
    },
    /** 玩家确认用这台设备的进度覆盖云端 */
    forceOverwrite() {
      blocked = false;
      return send(true);
    },
    /** 关页面时尽力而为：keepalive 请求在页面卸载后仍会发出 */
    beacon() {
      if (!pending || blocked) return;
      try {
        window.fetch("/api/save", {
          method: "PUT",
          credentials: "same-origin",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ save: pending, rev }),
        });
      } catch { /* 页面正在关闭 */ }
    },
    /** 放弃待存内容（换账号、开新局前） */
    reset() {
      window.clearTimeout(timer);
      pending = null;
      blocked = false;
      retryIdx = 0;
      setStatus("saved");
    },
  };
}
