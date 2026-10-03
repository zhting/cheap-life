/**
 * main.js —— 启动、场景切换、把各层接起来。
 * 场景状态机：标题页 / 开局剧本 / 小镇（Canvas+状态栏）/ 面板（菜单栈）/
 * 章末结算 / 结局页。界面每做一个有后果的选择就 dispatch 一条命令，
 * 内核返回一组事件，状态栏、世界层与面板按事件播放。
 */
import { create, apply, legal, view, replay, fightPreview } from "../core/game.js";
import { data, content } from "../core/data.js";
import { generateTown } from "../town/gen.js";
import { computeSpots, spotFor } from "../town/spots.js";
import { makeRenderer } from "../world/renderer.js";
import { makeInput } from "../world/input.js";
import { renderHud } from "./hud.js";
import { initDialog, showDialog, hideDialog, dialogVisible, advanceDialog, showNotice } from "./dialog.js";
import { initPanels, closePanel, closeTopPanel, panelOpen, showBuildingPanel, showBattlePanel, updateOffers, showTemptPanel, showTemptPeek, showTemptOutcome, showSettlePanel, showEndingPanel, showMenuPanel } from "./panels.js";
import { loadSettings, saveSettings, applySettings, showSettingsPanel } from "./settings.js";
import { setSound, sfx } from "./sfx.js";
import { initA11y, A11Y } from "./a11y.js";
import { storageAvailable, writeSave, readSave, clearSave, encodeSave, decodeSave, validateSaveShape, makeSave } from "../save/save.js";

const COMMAND_NAMES = ["talk", "learn", "drop", "peek", "accept", "refuse", "fight", "engage", "end"];

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

  // 字体加载完成后再首绘（加载失败回退系统字体）
  const start = () => showTitle();
  if (document.fonts && document.fonts.load) {
    Promise.all([
      document.fonts.load("16px 'Noto Sans SC'"),
      document.fonts.load("16px 'Noto Serif SC'"),
    ]).then(start).catch(start);
    window.setTimeout(() => { if (scene === "boot") start(); }, 1500);
    scene = "boot";
  } else {
    start();
  }

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
  // Esc/M：有可关的面板先关面板，否则开菜单
  input.on("menu", () => {
    if (closeTopPanel()) return;
    openMenu();
  });
  input.on("tap", (arg) => onTap(arg));
  input.bindDpad(el.dpadWrap);

  // 设置持久化
  window.addEventListener("beforeunload", () => saveSettings(settings));
  window.addEventListener("resize", () => { if (renderer && scene === "town") renderer.resize(); });
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

/* ---------------- 场景：标题页 ---------------- */

function showTitle() {
  scene = "title";
  closePanel();
  hideDialog();
  if (renderer) renderer.stop();
  el.title.classList.remove("hidden");
  el.draft.classList.add("hidden");
  el.townScene.classList.add("hidden");
  const saved = readSave();
  const hasSave = saved && validateSaveShape(saved, COMMAND_NAMES);
  el.title.innerHTML = `
    <div class="title-box">
      <h1>高性价比人生</h1>
      <p class="subtitle">像素小镇 RPG · 把书里的建议走成一辈子</p>
      <div class="title-actions">
        <button class="btn primary" id="t-new">新的一局</button>
        ${hasSave ? '<button class="btn" id="t-continue">继续上局</button>' : ""}
        <button class="btn" id="t-load">粘贴存档码</button>
      </div>
      <div class="title-seed hidden" id="t-seedbox">
        <input id="t-seed" inputmode="numeric" placeholder="种子（留空随机）">
        <button class="btn small" id="t-seed-go">用这个种子开局</button>
      </div>
      <p class="title-notice" id="t-notice-line">内容提示：含意外急救、慢病、金钱诈骗、法律等话题，建议 18 岁以上；游戏数值是设定，不构成医疗或法律建议。</p>
      <p class="attribution">改编自 <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noopener">eternity4719/HowToLiveBetter</a>《高性价比人生指南》，CC BY 4.0，已做游戏化改编与摘录</p>
      ${storageAvailable() ? "" : '<p class="warn-text">无法自动存档，请复制存档码保存进度。</p>'}
    </div>
  `;
  el.title.querySelector("#t-new").addEventListener("click", () => {
    const proceed = () => {
      el.title.querySelector("#t-seedbox").classList.toggle("hidden");
    };
    if (!noticeOk()) showNotice(proceed);
    else proceed();
  });
  const seedBtn = el.title.querySelector("#t-seed-go");
  if (seedBtn) seedBtn.addEventListener("click", () => {
    const v = Number(el.title.querySelector("#t-seed").value);
    const s = Number.isInteger(v) && v > 0 ? (v >>> 0) : randomSeed();
    startDraft(s);
  });
  const cont = el.title.querySelector("#t-continue");
  if (cont) cont.addEventListener("click", () => continueSaved(saved));
  el.title.querySelector("#t-load").addEventListener("click", () => pasteSaveCode());
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
    <div class="draft-box">
      <h2>你的人生剧本</h2>
      <p class="muted">开局抽四张牌，可以整套重抽一次。种子 ${seed}</p>
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
  return `<div class="draft-card"><div class="draft-cat">${cat}</div><b>${card.name}</b><div class="muted">${card.desc}</div></div>`;
}

/* ---------------- 场景：小镇 ---------------- */

function startTown(s, o, savedLog) {
  seed = s >>> 0;
  opts = o || { reroll: 0 };
  tiredShown = false;
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
    const tpl = content.encounters.find((t) => t.id === e.tpl);
    if (!tpl) continue;
    list.push({ x: pos[0], y: pos[1], icon: tpl.sprite, bubble: "!" });
  }
  for (const s of state.strangers) {
    if (s.done || s.seg > state.segment) continue;
    const pos = spotFor(spots, seed, "str:" + s.tpl);
    if (!pos) continue;
    list.push({ x: pos[0], y: pos[1], icon: "person", bubble: "?" });
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
  if (!storageAvailable()) return;
  writeSave(makeSave(seed, opts, log));
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
        if (ev && e !== events[0]) toast("小镇：" + ev.text);
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
  // 走到标记/陌生人身边（相邻即可）触发
  for (const ov of list) {
    if (Math.abs(ov.x - px) > 1 || Math.abs(ov.y - py) > 1) continue;
    if (ov.bubble === "!") {
      const enc = state.encounters.find((e) => e.state === 0 && e.seg <= state.segment);
      if (enc) {
        openBattle(enc.tpl);
        return true;
      }
    } else if (ov.bubble === "?") {
      const str = state.strangers.find((s2) => !s2.done && s2.seg <= state.segment);
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
  showBattlePanel({
    encId,
    view: currentView(),
    state,
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
    onAbandon() {
      clearSave();
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
  clearSave();
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
  };
}

/* 自动启动 */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
