/**
 * front.js —— 小镇外的几页：登录/注册、标题页（继续、新局、走完的人生）。
 * 背景是一座自己在动的像素小镇（黄昏），前面一块招牌式的窗口。
 * 只管画和收集输入；开局、读档由 main.js 接手。
 */
import { drawPixelText } from "./pixel-text.js";
import { login, register } from "../save/cloud.js";

const ATTRIBUTION = '改编自 <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noopener">eternity4719/HowToLiveBetter</a>《高性价比人生指南》，<a href="https://creativecommons.org/licenses/by/4.0/deed.zh-hans" target="_blank" rel="noopener">CC BY 4.0</a>，已做游戏化改编与摘录';

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** 标题区：像素字招牌 + 一句说明 */
function heroHtml() {
  return `
    <header class="front-hero">
      <h1 class="sr-only">高性价比人生</h1>
      <canvas class="front-logo" aria-hidden="true"></canvas>
      <p class="front-tagline">像素小镇 RPG · 把书里的建议走成一辈子</p>
    </header>`;
}

function paintLogo(root) {
  const c = root.querySelector(".front-logo");
  if (!c) return;
  const narrow = window.innerWidth < 520;
  drawPixelText(c, "高性价比人生", {
    size: 15,
    scale: narrow ? 3 : 4,
    fill: "#ffcd75",
    highlight: "#fff4c9",
    outline: "#1a1c2c",
    shadow: "#b13e53",
  });
}

/* ---------------- 登录 / 注册 ---------------- */

/**
 * opts: online（服务器可用）、onAuthed(user)、onGuest()、mode（"login" | "register"）、message
 */
export function renderAuth(el, opts) {
  let mode = opts.mode || "login";
  el.innerHTML = `
    <div class="front">
      ${heroHtml()}
      <section class="win front-win" aria-labelledby="auth-title">
        <h2 id="auth-title" class="sr-only">登录</h2>
        ${opts.online ? `
        <div class="tabs" role="tablist">
          <button class="tab" role="tab" data-mode="login">登录</button>
          <button class="tab" role="tab" data-mode="register">注册</button>
        </div>
        <form class="auth-form" novalidate>
          <label class="field">
            <span class="field-label">用户名</span>
            <input name="username" autocomplete="username" maxlength="20" spellcheck="false" autocapitalize="off" required>
          </label>
          <label class="field">
            <span class="field-label">密码</span>
            <input name="password" type="password" autocomplete="current-password" maxlength="128" required>
          </label>
          <p class="field-hint" data-hint></p>
          <p class="form-error" role="alert" aria-live="assertive"></p>
          <button class="btn primary wide" type="submit" data-submit>登录</button>
        </form>
        <p class="auth-why">登录后进度存在服务器上，换手机、换电脑都能接着玩。</p>
        ` : `
        <p class="offline-note">${esc(opts.message || "没连上游戏服务器。现在只能以游客身份玩，进度存在这台设备的浏览器里。")}</p>
        `}
        <div class="guest-row">
          <button class="btn ${opts.online ? "ghost" : "primary wide"}" data-guest>${opts.online ? "先不登录，以游客身份玩" : "以游客身份玩"}</button>
        </div>
      </section>
      <p class="attribution">${ATTRIBUTION}</p>
    </div>`;
  paintLogo(el);
  el.querySelector("[data-guest]").addEventListener("click", () => opts.onGuest());
  if (!opts.online) return;

  const form = el.querySelector(".auth-form");
  const errEl = form.querySelector(".form-error");
  const hint = form.querySelector("[data-hint]");
  const submit = form.querySelector("[data-submit]");
  const pw = form.elements.password;

  function setMode(m) {
    mode = m;
    for (const t of el.querySelectorAll(".tab")) {
      const on = t.dataset.mode === m;
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    }
    submit.textContent = m === "login" ? "登录" : "注册并进入小镇";
    pw.autocomplete = m === "login" ? "current-password" : "new-password";
    hint.textContent = m === "register" ? "用户名 2–20 个字（中文、字母、数字都行）；密码至少 6 位。" : "";
    hint.classList.toggle("hidden", m !== "register");
    errEl.textContent = "";
  }
  for (const t of el.querySelectorAll(".tab")) t.addEventListener("click", () => setMode(t.dataset.mode));
  setMode(mode);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errEl.textContent = "";
    const username = form.elements.username.value.trim();
    const password = pw.value;
    if (!username) return showErr("请填写用户名", form.elements.username);
    if (!password) return showErr("请填写密码", pw);
    if (mode === "register" && password.length < 6) return showErr("密码至少 6 位", pw);
    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = mode === "login" ? "登录中…" : "注册中…";
    const r = mode === "login" ? await login(username, password) : await register(username, password);
    submit.disabled = false;
    submit.textContent = label;
    if (r.ok) {
      opts.onAuthed(r.data.user);
      return;
    }
    const field = r.data.field === "password" ? pw : r.data.field === "username" ? form.elements.username : null;
    showErr(r.status === 0 ? "连不上服务器，检查网络后再试" : r.data.error || "没成功，请再试一次", field);
  });

  function showErr(msg, field) {
    errEl.textContent = msg;
    if (field) field.focus();
  }

  window.setTimeout(() => {
    const u = form.elements.username;
    if (u && !("ontouchstart" in window)) u.focus();
  }, 50);
}

/* ---------------- 标题页 ---------------- */

const KIND_TEXT = { alive: "寿终正寝", death: "意外离世", freedom: "失去自由", debt: "债务崩盘" };

function ago(ts) {
  if (!ts) return "";
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

function cnNum(n) {
  const digits = "零一二三四五六七八九十";
  if (n <= 10) return digits[n];
  if (n < 20) return "十" + digits[n - 10];
  return digits[Math.floor(n / 10)] + "十" + (n % 10 ? digits[n % 10] : "");
}

/** 进行中那一局的摘要卡 */
function continueCard(sum, savedAt, where) {
  const b = sum.bars || {};
  return `
    <div class="save-card">
      <div class="save-card-head">
        <b>第${cnNum(sum.chapter)}章 · ${sum.age} 岁</b>
        <span class="muted">${esc(sum.job || "")}${sum.habits ? ` · ${sum.habits} 个习惯` : ""}</span>
      </div>
      <div class="save-bars">
        <span class="sb sb-health" title="健康">♥ ${b.health}</span>
        <span class="sb sb-money" title="积蓄（千元）">¥ ${b.money}</span>
        <span class="sb sb-energy" title="精力">⚡ ${b.energy}</span>
        <span class="sb sb-freedom" title="自由">⚖ ${b.freedom}</span>
      </div>
      <div class="muted save-when">${where}${savedAt ? " · " + ago(savedAt) + "保存" : ""}</div>
    </div>`;
}

/**
 * opts:
 *   user（null = 游客）、loading、save（{summary, updatedAt} 或 null）、runs（{runs,best,total}）
 *   localSave（游客存档摘要，登录后可导入）、storageOk
 *   onContinue、onNew(seed|null)、onPaste、onImportLocal、onLogin、onLogout
 */
export function renderHome(el, opts) {
  const { user } = opts;
  const hasSave = !!(opts.save && opts.save.summary);
  const runs = opts.runs && opts.runs.runs ? opts.runs.runs : [];
  el.innerHTML = `
    <div class="front">
      ${heroHtml()}
      <section class="win front-win" aria-label="开始">
        <div class="who">
          ${user
            ? `<span class="who-name">${esc(user.username)}</span><span class="muted">的人生档案</span>`
            : '<span class="who-name">游客</span><span class="muted">进度只存在这台设备上</span>'}
          <span class="who-spacer"></span>
          ${user ? '<button class="btn small ghost" data-logout>退出登录</button>' : '<button class="btn small" data-login>登录 / 注册</button>'}
        </div>
        ${opts.loading ? '<div class="save-card loading muted">正在读取存档…</div>' : ""}
        ${opts.error ? `<p class="form-error">${esc(opts.error)}</p>` : ""}
        ${hasSave ? continueCard(opts.save.summary, opts.save.updatedAt, user ? "已存到账号" : "存在本机") : ""}
        <div class="home-actions">
          ${hasSave ? '<button class="btn primary" data-continue>继续上局</button>' : ""}
          <button class="btn ${hasSave ? "" : "primary"}" data-new>新的一局</button>
          <button class="btn" data-paste>粘贴存档码</button>
        </div>
        ${hasSave ? '<p class="muted home-note">开新局会替换掉上局的进度。</p>' : ""}
        <div class="seedbox hidden" data-seedbox>
          <label class="field inline">
            <span class="field-label">种子</span>
            <input data-seed inputmode="numeric" placeholder="留空随机" maxlength="10">
          </label>
          <button class="btn primary" data-seed-go>抽人生剧本</button>
        </div>
        ${user && !hasSave && opts.localSave ? `
          <div class="import-row">
            <span>这台设备上还有一局游客进度（第${cnNum(opts.localSave.chapter)}章 · ${opts.localSave.age} 岁）。</span>
            <button class="btn small" data-import>存进账号</button>
          </div>` : ""}
        ${user && runs.length ? `
          <div class="lives">
            <div class="lives-head"><b>走完的人生</b><span class="muted">共 ${opts.runs.total} 局 · 最高 ${opts.runs.best} 分</span></div>
            <ol class="lives-list">
              ${runs.slice(0, 5).map((r) => `
                <li><span class="life-age">${r.age} 岁</span><span class="life-kind">${esc(KIND_TEXT[r.kind] || r.kind)}${r.cause ? "（" + esc(r.cause) + "）" : ""}</span><span class="life-score">${r.score} 分</span><span class="muted life-when">${ago(r.finishedAt)}</span></li>`).join("")}
            </ol>
          </div>` : ""}
        ${opts.storageOk === false && !user ? '<p class="warn-text">这个浏览器不能自动存档，记得在菜单里复制存档码。</p>' : ""}
      </section>
      <p class="front-notice">内容提示：含意外急救、慢病、金钱诈骗、法律等话题，建议 18 岁以上；游戏数值是设定，不构成医疗或法律建议。</p>
      <p class="attribution">${ATTRIBUTION}</p>
    </div>`;
  paintLogo(el);
  const on = (sel, fn) => {
    const n = el.querySelector(sel);
    if (n) n.addEventListener("click", fn);
  };
  on("[data-logout]", () => opts.onLogout());
  on("[data-login]", () => opts.onLogin());
  on("[data-continue]", () => opts.onContinue());
  on("[data-paste]", () => opts.onPaste());
  on("[data-import]", () => opts.onImportLocal());
  on("[data-new]", () => {
    opts.onNewIntent(() => {
      const box = el.querySelector("[data-seedbox]");
      box.classList.remove("hidden");
      const go = el.querySelector("[data-seed-go]");
      go.focus();
    });
  });
  const goSeed = () => {
    const v = Number(el.querySelector("[data-seed]").value);
    opts.onNew(Number.isInteger(v) && v > 0 ? v >>> 0 : null);
  };
  on("[data-seed-go]", goSeed);
  const seedInput = el.querySelector("[data-seed]");
  if (seedInput) seedInput.addEventListener("keydown", (e) => { if (e.key === "Enter") goSeed(); });
}
