/**
 * main.js —— 启动、场景切换、把各层接起来。
 * 场景状态机：标题页 / 开局剧本 / 小镇（Canvas+状态栏）/ 面板（菜单栈）/
 * 章末结算 / 结局页。界面每做一个有后果的选择就 dispatch 一条命令，
 * 内核返回一组事件，状态栏、世界层与面板按事件播放。
 */
import { create, apply, legal, view, replay, fightPreview } from "../core/game.js";
import { findTemplate } from "../core/fight.js";
import { data, content } from "../core/data.js";
import { generateTown } from "../town/gen.js";
import { computeSpots, spotFor } from "../town/spots.js";
import { makeRenderer } from "../world/renderer.js";
import { makeInput } from "../world/input.js";
import { renderHud } from "./hud.js";
import { initDialog, showDialog, hideDialog, dialogVisible, advanceDialog, showNotice } from "./dialog.js";
import { initPanels, closePanel, closeTopPanel, panelOpen, panelDigit, showBuildingPanel, showBattlePanel, updateOffers, showTemptPanel, showTemptPeek, showTemptOutcome, showSettlePanel, showEndingPanel, showMenuPanel } from "./panels.js";
import { loadSettings, saveSettings, applySettings, showSettingsPanel } from "./settings.js";
import { setSound, sfx } from "./sfx.js";
import { initA11y, A11Y } from "./a11y.js";
import { storageAvailable, writeSave, readSave, clearSave, encodeSave, decodeSave, validateSaveShape, makeSave, COMMAND_NAMES } from "../save/save.js";
import { whoAmI, logout, fetchSave, fetchRuns, deleteCloudSave, makeCloudSaver } from "../save/cloud.js";
import { renderAuth, renderHome, esc } from "./front.js";

window.addEventListener("error", (e) => {
  const stack = e.error && e.error.stack ? " | " + e.error.stack.split("\n").slice(0, 4).join(" | ") : "";
  (window.__errs = window.__errs || []).push(String(e.message) + " @" + (e.lineno || 0) + ":" + (e.colno || 0) + stack);
});
window.addEventListener("unhandledrejection", (e) => {
  (window.__errs = window.__errs || []).push("rejection: " + String(e.reason));
});

let state = null;
let log = [];
let seed = 0;
let opts = { reroll: 0 };
let town = null;
let renderer = null;
let input = null;
let spots = [];
let settings = loadSettings();
let dark = false;
let scene = "title";
let tiredShown = false;
let lastSaveCode = "";

/* 账号：account = { id, username }；null 表示游客（只存本机） */
let account = null;
let serverOnline = false;
let cloudSave = null; // 标题页拿到的云存档 { rev, save, summary, updatedAt }
let backdrop = null; // 标题页背景的小镇
const cloud = makeCloudSaver({
  onStatus: (s) => updateSyncBadge(s),
  onConflict: (info) => showConflict(info),
  onRejected: (msg) => toast("云存档没存上：" + msg, 5000),
  onEnded: () => { cloudSave = null; },
});

const el = {};
const $ = (id) => document.getElementById(id);

/* ---------------- 启动 ---------------- */

export function boot() {
  el.title = $("scene-title");
  el.draft = $("scene-draft");
  el.townScene = $("scene-town");
  el.hud = $("hud");
  el.canvas = $("map");
  el.overlay = $("overlay");
  el.toast = $("toast");
  el.dpadWrap = $("dpad-wrap");
  el.mapwrap = $("mapwrap");
  el.prompt = $("prompt");
  el.interactBtn = $("interact-btn");

  initA11y(document.body);
  initDialog(el.townScene);
  initPanels(el.overlay);
  applySettings(settings);
  setSound(settings.sound);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (settings.theme === "auto") applyTheme();
  });
  applyTheme();

  // 系统字体，不等网字体；先问服务器登录状态再决定去登录页还是标题页
  scene = "boot";
  showBackdrop(true);
  enterFront();

  input = makeInput(el.canvas, {});
  // 空格/回车/E：有对话先翻对话，否则交互
  input.on("interact", () => {
    if (scene === "town" && dialogVisible() && !panelOpen()) advanceDialog();
    else tryInteract();
  });
  for (const id of ["menu-btn", "menu-fab"]) {
    const btn = $(id);
    if (btn) btn.addEventListener("click", () => openMenu());
  }
  const interactBtn = $("interact-btn");
  if (interactBtn) interactBtn.addEventListener("click", () => tryInteract());
  // Esc/M：有对话先关对话，有可关的面板先关面板，否则开菜单
  input.on("menu", () => {
    if (dialogVisible() && !panelOpen()) {
      hideDialog();
      return;
    }
    if (closeTopPanel()) return;
    openMenu();
  });
  input.on("key", (k) => {
    if (typeof k === "number") panelDigit(k);
  });
  input.on("tap", (arg) => onTap(arg));
  input.bindDpad(el.dpadWrap);

  // 设置持久化；关页面时把还没发出去的云存档用 keepalive 补发
  window.addEventListener("beforeunload", () => saveSettings(settings));
  window.addEventListener("pagehide", () => { if (account) cloud.beacon(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && account) cloud.flush();
  });
  window.addEventListener("resize", () => {
    if (renderer && scene === "town") renderer.resize();
    if (backdrop && scene !== "town") backdrop.resize();
  });
  window.setInterval(updatePrompt, 200);
}

function applyTheme() {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  dark = settings.theme === "dark" || (settings.theme === "auto" && systemDark);
  document.documentElement.classList.toggle("dark", dark);
}

function toast(text, ms) {
  el.toast.textContent = text;
  el.toast.classList.remove("hidden");
  A11Y.say(text);
  window.clearTimeout(toast._t);
  toast._t = window.setTimeout(() => el.toast.classList.add("hidden"), ms || 2600);
}

/* ---------------- 场景：登录与标题页 ---------------- */

/** 标题页背景：一座固定种子的小镇，黄昏，镜头缓慢漂移 */
function showBackdrop(on) {
  el.backdrop = el.backdrop || $("backdrop");
  if (!el.backdrop) return;
  el.backdrop.classList.toggle("hidden", !on);
  document.documentElement.classList.toggle("front-mode", on);
  if (!on) {
    if (backdrop) backdrop.stop();
    return;
  }
  if (!backdrop) {
    const BACKDROP_SEED = 20240611;
    const t = generateTown(BACKDROP_SEED);
    backdrop = makeRenderer(el.backdrop, t, BACKDROP_SEED, content);
    backdrop.prerender("young");
    backdrop.setSeason(2);
    backdrop.setSegment(4);
    backdrop.attract(motionOn() ? 9 : 0);
  }
  backdrop.resize();
  backdrop.start();
}

function motionOn() {
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return settings.motion && !reduced;
}

function guestChosen() {
  try { return window.localStorage.getItem("hli-guest") === "1"; } catch { return false; }
}

function setGuestChosen(on) {
  try {
    if (on) window.localStorage.setItem("hli-guest", "1");
    else window.localStorage.removeItem("hli-guest");
  } catch { /* 存储不可用 */ }
}

async function enterFront() {
  const r = await whoAmI();
  serverOnline = r.online;
  account = r.user;
  if (account || guestChosen()) showTitle();
  else showAuth();
}

function showFrontScene() {
  closePanel();
  hideDialog();
  if (renderer) renderer.stop();
  el.title.classList.remove("hidden");
  el.draft.classList.add("hidden");
  el.townScene.classList.add("hidden");
  showBackdrop(true);
}

function showAuth(mode) {
  scene = "auth";
  showFrontScene();
  renderAuth(el.title, {
    online: serverOnline,
    mode,
    onAuthed(user) {
      account = user;
      setGuestChosen(false);
      cloud.reset();
      toast(`欢迎，${user.username}`);
      showTitle();
    },
    onGuest() {
      account = null;
      setGuestChosen(true);
      showTitle();
    },
  });
}

function localSaveSummary() {
  const saved = readSave();
  if (!saved || !validateSaveShape(saved, COMMAND_NAMES)) return null;
  const r = replay(saved.seed, saved.opts, saved.log);
  if (!r.ok || r.state.ended) return null;
  const st = r.state;
  return {
    save: saved,
    summary: {
      chapter: st.chapter, age: st.age, job: st.script.cards.job.name, habits: st.habits.length,
      bars: { health: Math.round(st.bars.health), money: Math.round(st.bars.money), energy: Math.round(st.bars.energy), freedom: Math.round(st.bars.freedom) },
    },
  };
}

async function showTitle() {
  scene = "title";
  showFrontScene();
  const local = localSaveSummary();
  const base = {
    user: account,
    storageOk: storageAvailable(),
    onContinue,
    onNewIntent(proceed) {
      if (!noticeOk()) showNotice(() => { markNotice(); proceed(); });
      else proceed();
    },
    onNew(s) { startDraft(s == null ? randomSeed() : s); },
    onPaste: pasteSaveCode,
    onLogin: () => showAuth("login"),
    onLogout: doLogout,
    onImportLocal: importLocal,
  };
  if (!account) {
    cloudSave = null;
    renderHome(el.title, { ...base, save: local ? { summary: local.summary, updatedAt: null } : null });
    return;
  }
  renderHome(el.title, { ...base, loading: true });
  const [sv, rn] = await Promise.all([fetchSave(), fetchRuns()]);
  if (scene !== "title") return;
  if (sv.status === 401) {
    account = null;
    showAuth("login");
    return;
  }
  cloudSave = sv.ok && sv.data.save ? sv.data : null;
  cloud.setRev(sv.ok ? sv.data.rev : cloud.rev);
  renderHome(el.title, {
    ...base,
    save: cloudSave,
    runs: rn.ok ? rn.data : null,
    localSave: local ? local.summary : null,
    error: sv.ok ? "" : "读取云存档失败：" + (sv.data.error || "网络问题"),
  });

  function onContinue() {
    if (account && cloudSave) continueSaved(cloudSave.save);
    else if (!account && local) continueSaved(local.save);
  }
  async function importLocal() {
    if (!local) return;
    cloud.queue(local.save);
    await cloud.flush();
    if (cloud.status === "saved") {
      clearSave();
      toast("这台设备上的进度已存进账号");
    }
    showTitle();
  }
}

async function doLogout() {
  await cloud.flush();
  await logout();
  account = null;
  cloudSave = null;
  cloud.reset();
  setGuestChosen(false);
  showAuth("login");
}

function noticeOk() {
  try {
    if (!storageAvailable()) return false;
    return window.localStorage.getItem("hli-notice-ok") === "1";
  } catch {
    return false;
  }
}

function markNotice() {
  try {
    window.localStorage.setItem("hli-notice-ok", "1");
  } catch { /* 每次都弹 */ }
}

function randomSeed() {
  try {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] >>> 0;
  } catch {
    return Math.floor(Math.random() * 4294967295) >>> 0; // 仅开局选项可用
  }
}

/* ---------------- 场景：开局剧本 ---------------- */

function startDraft(s) {
  scene = "draft";
  seed = s >>> 0;
  opts = { reroll: 0 };
  el.title.classList.add("hidden");
  el.draft.classList.remove("hidden");
  renderDraft();
}

function renderDraft() {
  const { state: st } = create(seed, opts);
  const sc = st.script;
  el.draft.innerHTML = `
    <div class="draft-box win">
      <h2>你的人生剧本</h2>
      <p class="muted">开局抽四张牌，不满意可以整套重抽一次。种子 ${seed}</p>
      <div class="draft-cards">
        ${draftCard("出身", sc.cards.origin)}
        ${draftCard("体质", sc.cards.physique)}
        ${draftCard("性格", sc.cards.personality)}
        ${draftCard("职业", sc.cards.job)}
      </div>
      <div class="panel-actions">
        <button class="btn" id="d-reroll" ${st.rerolled ? "disabled" : ""}>整套重抽（一次机会）</button>
        <button class="btn primary" id="d-go">就这样，进小镇</button>
        <button class="btn" id="d-back">回标题</button>
      </div>
      <p class="muted">初始：健康 ${sc.startHealth} · 积蓄 ${sc.savings0}千 · 精力 ${sc.startEnergy}</p>
    </div>
  `;
  el.draft.querySelector("#d-reroll").addEventListener("click", () => {
    opts.reroll += 1;
    renderDraft();
  });
  el.draft.querySelector("#d-go").addEventListener("click", () => startTown(seed, { ...opts }));
  el.draft.querySelector("#d-back").addEventListener("click", showTitle);
}

function draftCard(cat, card) {
  const kind = { 出身: "origin", 体质: "body", 性格: "mind", 职业: "job" }[cat] || "origin";
  return `<div class="draft-card draft-${kind}"><div class="draft-cat">${cat}</div><b>${card.name}</b><div class="draft-desc">${card.desc}</div></div>`;
}

/* ---------------- 场景：小镇 ---------------- */

function startTown(s, o, savedLog) {
  seed = s >>> 0;
  opts = o || { reroll: 0 };
  tiredShown = false;
  cloud.reset(); // 丢掉上一局没发出去的存档；版本号沿用标题页拿到的
  if (savedLog) {
    const r = replay(seed, opts, savedLog);
    if (!r.ok) {
      toast("存档码无效，或来自不同版本");
      showTitle();
      return;
    }
    state = r.state;
    log = savedLog.slice();
  } else {
    const r = create(seed, opts);
    state = r.state;
    log = [];
    markNotice();
  }
  town = generateTown(seed);
  spots = computeSpots(town);
  scene = "town";
  showBackdrop(false);
  updateSyncBadge(cloud.status);
  el.title.classList.add("hidden");
  el.draft.classList.add("hidden");
  el.townScene.classList.remove("hidden");
  renderer = makeRenderer(el.canvas, town, seed, content);
  renderer.state.held = input.held; // 键盘/十字键的状态接入补间移动
  const parts = state.script
    ? { hair: { cautious: 0, impulsive: 1, warm: 2, introvert: 3, competitive: 4 }[state.script.personality] || 0, hairColor: { poor: 0, normal: 1, rich: 4, sick: 5 }[state.script.origin] || 0, clothes: { office: 1, blue: 2, coder: 8 % 8, freelance: 3, founder: 5, civil: 7 }[state.script.job] || 0, skin: 0 }
    : { hair: 1, hairColor: 3, clothes: 1, skin: 0 };
  renderer.setPlayerSheet(parts);
  renderer.prerender(stageOf());
  renderer.setPlayer(town.homeDoor[0], town.homeDoor[1]);
  renderer.onArrive(() => { if (!renderer.pathEmpty()) return; if (!checkOverlays()) tryInteract(true); });
  renderer.resize();
  renderer.start();
  refreshHud();
  refreshOverlays();
  if (!savedLog) {
    showDialog(`第1章 · 18 岁。你可以在这座小镇里花 ${state.ap} 个行动点：走进建筑听建议、采纳习惯；应付标着"!"的意外；陌生人搭话时多留个心眼。天黑回"家"睡觉，这一章就过去了。`, null);
  }
}

function stageOf() {
  const age = state.age;
  return age >= 73 ? "old" : age >= 58 ? "senior" : age >= 38 ? "mid" : "young";
}

function continueSaved(saved) {
  if (!noticeOk()) {
    showNotice(() => { markNotice(); continueSaved(saved); });
    return;
  }
  startTown(saved.seed, saved.opts, saved.log);
}

async function pasteSaveCode() {
  let code = null;
  try {
    code = await navigator.clipboard.readText();
  } catch {
    code = window.prompt("粘贴存档码：");
  }
  if (!code) return;
  const save = await decodeSave(code.trim());
  if (!save || !validateSaveShape(save, COMMAND_NAMES)) {
    toast("存档码无效，或来自不同版本");
    return;
  }
  continueSaved(save);
}

function currentView() {
  return view(state);
}

function refreshHud() {
  renderHud(el.hud, currentView());
  renderer.setSegment(state.segment);
  renderer.setSeason((state.chapter - 1) % 4);
}

function refreshOverlays() {
  const list = [];
  for (const e of state.encounters) {
    if (e.state !== 0 || e.seg > state.segment) continue;
    const pos = spotFor(spots, seed, "enc:" + e.tpl);
    if (!pos) continue;
    const tpl = findTemplate(state, e.tpl, data, content); // 含急救生成的救援遭遇
    if (!tpl) continue;
    list.push({ x: pos[0], y: pos[1], icon: tpl.sprite, bubble: "!", encId: e.tpl });
  }
  for (const s of state.strangers) {
    if (s.done || s.seg > state.segment) continue;
    const pos = spotFor(spots, seed, "str:" + s.tpl);
    if (!pos) continue;
    list.push({ x: pos[0], y: pos[1], icon: "person", bubble: "?", strId: s.tpl });
  }
  renderer.setOverlays(list);
}

/* ---------------- 命令分发 ---------------- */

function dispatch(cmd) {
  const before = state.segment;
  const r = apply(state, cmd);
  if (!r.ok) {
    toast(r.reason || "现在不能这么做");
    return r;
  }
  log.push(cmd);
  autosave();
  handleEvents(r.events, cmd);
  if (state.segment !== before) refreshOverlays();
  refreshHud();
  return r;
}

function autosave() {
  const save = makeSave(seed, opts, log);
  if (account) {
    cloud.queue(save);
    return;
  }
  if (!storageAvailable()) return;
  writeSave(save);
}

/* ---------------- 云存档状态 ---------------- */

const SYNC_TEXT = {
  saved: "已存到账号",
  saving: "正在保存…",
  pending: "没连上服务器，稍后自动重试",
  conflict: "别处有更新的进度",
  error: "云存档没存上",
};

function syncText() {
  if (!account) return storageAvailable() ? "游客模式 · 存在这台设备上" : "游客模式 · 这个浏览器不能自动存档";
  const t = SYNC_TEXT[cloud.status] || "";
  if (cloud.status === "saved" && cloud.lastSavedAt) {
    const s = Math.round((Date.now() - cloud.lastSavedAt) / 1000);
    return t + (s < 60 ? " · 刚刚" : ` · ${Math.floor(s / 60)} 分钟前`);
  }
  return t;
}

function updateSyncBadge(status) {
  const badge = $("sync-badge");
  if (badge) {
    const bad = status === "pending" || status === "conflict" || status === "error";
    badge.classList.toggle("hidden", !account);
    badge.classList.toggle("bad", bad);
    badge.classList.toggle("busy", status === "saving");
    badge.textContent = bad ? "未存上" : status === "saving" ? "保存中" : "已存档";
    badge.title = syncText();
  }
  const line = document.querySelector("[data-sync-line]");
  if (line) line.textContent = syncText();
}

/** 别的设备先写过：让玩家选用哪一份 */
function showConflict(info) {
  const sum = info && info.summary;
  const there = sum ? `第${sum.chapter}章 · ${sum.age} 岁` : "已经结束或被放弃";
  const here = `第${state ? state.chapter : "?"}章 · ${state ? state.age : "?"} 岁`;
  if (renderer) renderer.setPaused(true);
  const box = document.createElement("div");
  box.className = "panel notice win";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-label", "存档冲突");
  box.innerHTML = `
    <div class="panel-head"><h2>账号在别处有更新的进度</h2></div>
    <div class="panel-body">
      <p>这个账号在另一台设备或另一个标签页里也在玩，两边的进度对不上了。</p>
      <div class="conflict-grid">
        <div class="card"><div class="muted">账号里的</div><b>${esc(there)}</b></div>
        <div class="card"><div class="muted">这里的</div><b>${esc(here)}</b></div>
      </div>
      <p class="muted">选了就会覆盖另一份，没法撤回。</p>
    </div>
    <div class="panel-actions">
      <button class="btn primary" data-keep="cloud">读取账号里的进度</button>
      <button class="btn" data-keep="here">用这里的覆盖账号</button>
    </div>`;
  el.overlay.appendChild(box);
  box.querySelector("button").focus();
  box.querySelector('[data-keep="cloud"]').addEventListener("click", async () => {
    box.remove();
    cloud.reset();
    const r = await fetchSave();
    if (r.ok) {
      cloud.setRev(r.data.rev);
      cloudSave = r.data.save ? r.data : null;
      if (r.data.save) {
        startTown(r.data.save.seed, r.data.save.opts, r.data.save.log);
        toast("已读取账号里的进度");
        return;
      }
    }
    showTitle();
  });
  box.querySelector('[data-keep="here"]').addEventListener("click", async () => {
    box.remove();
    if (renderer) renderer.setPaused(false);
    await cloud.forceOverwrite();
    if (cloud.status === "saved") toast("已用这里的进度覆盖账号");
  });
}

function handleEvents(events, cmd) {
  const isEnd = !!cmd && cmd[0] === "end";
  floatText.n = 0;
  for (const e of events) {
    switch (e.t) {
      case "bar":
        sfx[e.bar === "money" && e.delta > 0 ? "coin" : "hit"]();
        // 章末结算面板会逐条列出，不再飘字
        if (!isEnd) floatText(`${barName(e.bar)} ${e.delta > 0 ? "+" : ""}${e.delta}`, e.delta > 0);
        if (!isEnd && e.bar === "health" && e.delta < 0) hitShake();
        break;
      case "ap":
        break;
      case "talk":
        sfx.confirm();
        updateOffers(currentView(), dispatch);
        break;
      case "habit":
        toast(e.op === "adopted" ? "采纳了习惯：" + (data.cardsById[e.id] || {}).title : e.reason || "习惯变动");
        break;
      case "life": {
        const ev = content.events.find((x) => x.id === e.id);
        // 章末的人生事件写进结算面板，不另弹对话
        if (ev && !isEnd) showDialog(`【人生事件】${ev.name}。${ev.text}`, null);
        break;
      }
      case "town": {
        const ev = content.townEvents.events.find((x) => x.id === e.id);
        if (ev && e !== events[0] && !isEnd) toast("小镇：" + ev.text); // 章末的写进结算面板
        break;
      }
      case "peek": {
        const tempt = data.temptById[e.id];
        const book = data.cardsById[e.book];
        showTemptPeek(tempt, book);
        if (e.auto) toast("你早就有对应的习惯，一眼看穿了");
        break;
      }
      case "accept":
        showTemptOutcome(e.text);
        refreshOverlays();
        closePanelSoon();
        break;
      case "refuse":
        showTemptOutcome(e.text);
        refreshOverlays();
        closePanelSoon();
        break;
      case "engage": {
        sfx.confirm();
        toast("机遇窗口");
        break;
      }
      case "encState":
        refreshOverlays();
        break;
      case "chapter":
        sfx.chapter();
        break;
      case "ending":
        showEnding(e);
        break;
      default:
        break;
    }
  }
  if (cmd && cmd[0] === "end" && !state.ended) {
    showSettle(events);
  }
  if (state.bars.energy <= 0 && !tiredShown) {
    tiredShown = true;
    showDialog("你倦怠了。下一章只有 3 个行动点。让精力缓一缓：接纳管精力的习惯，别把日程排满。", null);
  }
  if (state.ap === 0 && !state.ended && !panelOpen() && !dialogVisible() && scene === "town") {
    showDialog("天黑了。现在只剩迎战、拒绝和放弃习惯这些不花点数的事。回「家」睡觉，本章结算。", null);
  }
}

function closePanelSoon() {
  window.setTimeout(() => { if (panelOpen()) closePanel(); }, 1200);
}

function barName(bar) {
  return { health: "健康", money: "积蓄", energy: "精力", freedom: "自由" }[bar] || bar;
}

/* ---------------- 交互 ---------------- */

function onTap(arg) {
  if (dialogVisible() || panelOpen()) return;
  const tile = screenToTile(arg.cx, arg.cy);
  if (!tile) return;
  const target = overlayAt(tile[0], tile[1]);
  const building = town.buildings.find((b) => tile[0] >= b.x && tile[0] < b.x + b.w && tile[1] >= b.y && tile[1] < b.y + b.h);
  const doorTarget = town.buildings.find((b) => b.frontX === tile[0] && b.frontY === tile[1]);
  let dest = tile;
  if (target) dest = [target.x, target.y];
  else if (doorTarget) dest = [doorTarget.frontX, doorTarget.frontY];
  else if (building) dest = [building.frontX, building.frontY];
  if (!renderer.walkTo(dest[0], dest[1])) {
    toast("走不过去");
  }
}

function screenToTile(cx, cy) {
  const info = renderer.screenInfo();
  if (!info) return null;
  const gx = Math.floor((cx / info.scale + info.camX) / 16);
  const gy = Math.floor((cy / info.scale + info.camY) / 16);
  if (gx < 0 || gy < 0 || gx >= town.w || gy >= town.h) return null;
  return [gx, gy];
}

function overlayAt(gx, gy) {
  const list = renderer.state.overlays || [];
  return list.find((o) => o.x === gx && o.y === gy) || null;
}

function tryInteract() {
  if (scene !== "town" || dialogVisible() || panelOpen()) return;
  const near = renderer.nearInteractable();
  if (!near) return;
  const [px, py] = renderer.playerTile();
  // 门口 → 建筑面板（家 = 睡觉结算）
  const b = near.b;
  const atFront = b.frontX === px && b.frontY === py;
  if (b.id === "home" && atFront) {
    if (state.ended) return;
    sfx.confirm();
    dispatch(["end"]);
    return;
  }
  if (atFront) {
    if (b.id === "incubator" && (stageOf() === "old" || stageOf() === "senior")) {
      showDialog("创业园的招位牌写着：本项目面向年轻与中年的创业者。", null);
      return;
    }
    openBuilding(b);
  }
}

function openBuilding(b) {
  const meta = data.buildings.find((x) => x.id === b.id);
  const v = currentView();
  // 台词由 talk 事件给出；打开面板先用 NPC 名与默认台词
  const opening = content.npc.openings[b.id] || ["……"];
  renderer.setPaused(true);
  showBuildingPanel({
    building: meta,
    npc: npcName(b.id),
    line: opening[seedInt(b.id) % opening.length],
    offers: null,
    view: v,
    dispatch,
    onClose: () => renderer.setPaused(false),
  });
}

function npcName(buildingId) {
  let h = 0;
  const s = seed + ":" + buildingId;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return content.npc.names[h % content.npc.names.length];
}

function seedInt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

/** 点击/走近遭遇标记或陌生人 */
function checkOverlays() {
  const [px, py] = renderer.playerTile();
  const list = renderer.state.overlays || [];
  // 走到标记/陌生人身边（相邻即可）触发：打开的是这个标记对应的遭遇，不是列表第一个
  for (const ov of list) {
    if (Math.abs(ov.x - px) > 1 || Math.abs(ov.y - py) > 1) continue;
    if (ov.encId) {
      const enc = state.encounters.find((e) => e.tpl === ov.encId && e.state === 0 && e.seg <= state.segment);
      if (enc) {
        openBattle(enc.tpl);
        return true;
      }
    } else if (ov.strId) {
      const str = state.strangers.find((s2) => s2.tpl === ov.strId && !s2.done && s2.seg <= state.segment);
      if (str) {
        openTempt(str.tpl);
        return true;
      }
    }
  }
  return false;
}

/* ---------------- 面板 ---------------- */

function openBattle(encId) {
  renderer.setPaused(true);
  const preview = fightPreview(state, encId, []);
  if (!preview) {
    renderer.setPaused(false);
    return;
  }
  showBattlePanel({
    encId,
    preview,
    view: currentView(),
    commit(actions) {
      closePanel();
      renderer.setPaused(false);
      const r = dispatch(["fight", encId, actions]);
      if (r.ok) {
        const end = r.events.find((e) => e.t === "fightEnd");
        if (end) {
          toast(end.win ? "挡住了！下一章相关建议会优先发放" : "没有解决，留下未解决标志");
        }
      }
    },
    onClose: () => renderer.setPaused(false),
  });
}

function openTempt(temptId) {
  renderer.setPaused(true);
  const tempt = data.temptById[temptId];
  showTemptPanel({
    tempt,
    view: currentView(),
    dispatch,
    onClose: () => renderer.setPaused(false),
  });
}

function openMenu() {
  if (scene !== "town" || panelOpen()) return;
  renderer.setPaused(true);
  showMenuPanel({
    view: currentView(),
    dispatch,
    hotlines: data.hotlines,
    onSaveCode: () => encodeSave(makeSave(seed, opts, log)),
    account: account ? { username: account.username } : null,
    syncText: syncText(),
    async onAbandon() {
      if (account) {
        cloud.reset();
        const r = await deleteCloudSave(cloud.rev);
        if (r.ok) cloud.setRev(0);
        cloudSave = null;
      } else {
        clearSave();
      }
      showTitle();
    },
    async onExit() {
      if (account) await cloud.flush();
      showTitle();
    },
    onSettings() {
      showSettingsPanel(settings, (s) => {
        settings = s;
        saveSettings(s);
        applySettings(s);
        setSound(s.sound);
        applyTheme();
        renderer.resize();
      }, () => renderer.setPaused(false));
      renderer.setPaused(true);
    },
    onClose: () => renderer.setPaused(false),
  });
}

/* ---------------- 结算与结局 ---------------- */

function showSettle(events) {
  renderer.setPaused(true);
  renderer.prerender(stageOf());
  showSettlePanel({
    events: events.filter((e) => e.t !== "chapter"),
    view: currentView(),
    onNext() {
      closePanel();
      renderer.setPaused(false);
      if (state.ended) return;
      tiredShown = false;
      refreshOverlays();
      renderer.setPlayer(town.homeDoor[0], town.homeDoor[1]);
      replayAnim(el.mapwrap, "fade-in");
      showDialog(`第${state.chapter}章 · ${state.age} 岁。${state.ap} 个行动点。`, null);
    },
  });
}

async function showEnding(ended) {
  if (account) {
    // 最后一条命令已经排进云存档；立刻发出去，服务器会把这一局归档进「走完的人生」
    cloud.flush().then(() => {
      if (cloud.status !== "saved") toast("这一局的结局还没存进账号，联网后会自动补存", 4000);
    });
  } else {
    clearSave();
  }
  hideDialog();
  lastSaveCode = await encodeSave(makeSave(seed, opts, log));
  const v = currentView();
  // "书里 x.y 条本可以帮你"：按死因遭遇匹配，未采纳、收益大、成本低的前 5 条
  let tags = null;
  if (ended.kind === "death" && ended.deathCause) {
    const tpl = content.encounters.find((t) => t.name === ended.deathCause);
    if (tpl) tags = tpl.tags;
  }
  const suggestions = suggestFor(tags, v);
  renderer.stop();
  showEndingPanel({
    view: v,
    ended,
    suggestions,
    seed,
    saveCode: lastSaveCode,
    onRestart() {
      showTitle();
    },
  });
}

function suggestFor(tags, v) {
  const rank = { 大: 3, 中: 2, 小: 1 };
  const adopted = new Set(v.habits.map((c) => c.id));
  const pool = data.cards.filter((c) => !adopted.has(c.id) && (!tags || c.tags.some((t) => tags.indexOf(t) >= 0)));
  pool.sort((a, b) => {
    const ra = rank[a.benefit.level], rb = rank[b.benefit.level];
    if (ra !== rb) return rb - ra;
    return (a.cost.money + a.cost.time) - (b.cost.money + b.cost.time);
  });
  return pool.slice(0, 5).map((c) => c.id);
}

/* ---------------- 飘字 ---------------- */

/** 同一批事件里的多条飘字错开时间和高度，避免叠在一起 */
function floatText(text, good) {
  const i = floatText.n || 0;
  floatText.n = i + 1;
  window.setTimeout(() => {
    const div = document.createElement("div");
    div.className = "float-text" + (good ? " good" : "");
    div.style.top = `calc(40% + ${(i % 4) * 1.6}em)`;
    div.textContent = text;
    el.mapwrap.appendChild(div);
    window.setTimeout(() => div.remove(), 1100);
  }, i * 220);
}

/** 受击抖动（动效关闭或系统要求减少动效时由 CSS 屏蔽） */
function hitShake() {
  replayAnim(el.mapwrap, "shake");
}

function replayAnim(node, cls) {
  if (!node) return;
  node.classList.remove(cls);
  void node.offsetWidth; // 重新触发动画
  node.classList.add(cls);
  window.setTimeout(() => node.classList.remove(cls), 700);
}

/* ---------------- 门口提示 ---------------- */

/** 站在建筑门口时，在地图底部提示建筑名和操作；交互按钮的文字跟着变 */
function updatePrompt() {
  if (!el.prompt) return;
  let text = "";
  let btn = "交互";
  if (scene === "town" && renderer && !panelOpen() && !dialogVisible()) {
    const near = renderer.nearInteractable();
    const [px, py] = renderer.playerTile();
    if (near && near.b.frontX === px && near.b.frontY === py) {
      const meta = data.buildings.find((x) => x.id === near.b.id);
      const name = meta ? meta.name : near.b.id;
      btn = near.b.id === "home" ? "睡觉" : "进入";
      const how = document.documentElement.dataset.controls === "touch" ? `点「${btn}」`
        : window.matchMedia("(pointer: coarse)").matches ? `点建筑${btn}` : `按 E ${btn}`;
      if (near.b.id === "home") text = state.ended ? name : `${name} · ${how}，结束本章`;
      else text = `${name} · ${how}`;
    }
  }
  if (el.prompt.textContent !== text) {
    el.prompt.textContent = text;
    el.prompt.classList.toggle("hidden", !text);
  }
  if (el.interactBtn && el.interactBtn.textContent !== btn) el.interactBtn.textContent = btn;
}

/* ---------------- 调试钩子 ---------------- */

if (new URLSearchParams(window.location.search).get("debug") !== null) {
  window.__hli = {
    get state() { return state; },
    dispatch,
    jumpTo(chapter) {
      while (state.chapter < chapter && !state.ended) dispatch(["end"]);
      refreshOverlays();
    },
    setSeed(s) { seed = s >>> 0; },
    town() { return town; },
    renderer() { return renderer; },
    legal: () => legal(state),
    fightPreview,
    openBuilding(id) { const b = town.buildings.find((x) => x.id === id); if (b) openBuilding(b); },
    openBattle,
    openTempt,
    cloud: () => ({ status: cloud.status, rev: cloud.rev }),
  };
}

/* 自动启动 */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
