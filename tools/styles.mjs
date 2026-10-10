/**
 * styles.mjs —— 全局样式（构建时内联进 dist/index.html）。
 *
 * 视觉方向：界面跟地图是同一套像素世界。
 *  - 窗口 = 小镇建筑上的白底招牌：墨色描边、缺角、内圈细线（border-image 像素框，见 frame()）。
 *  - 颜色取自地图色板（Sweetie 16）：墨 #1a1c2c、招牌白 #f4f4f4、沙金 #ffcd75、红 #b13e53、
 *    草绿 #38b764、天蓝 #41a6f6；深色主题换成夜里的灰蓝。
 *  - 状态栏是一条墨色的游戏 HUD，四项状态是分格的像素条，行动点是金色方块。
 *  - 字体只用系统中文字体（不加载网字体）；标题招牌用 pixel-text.js 把系统字像素化。
 */

/** 用字符画生成像素图（data URI），'.' 透明，其他字符查色表 */
function pixelSvg(rows, colors) {
  const h = rows.length;
  const w = rows[0].length;
  let rects = "";
  rows.forEach((row, y) => {
    let x = 0;
    while (x < w) {
      const ch = row[x];
      if (ch === ".") { x++; continue; }
      let x1 = x;
      while (x1 < w && row[x1] === ch) x1++;
      rects += `<rect x='${x}' y='${y}' width='${x1 - x}' height='1' fill='${colors[ch]}'/>`;
      x = x1;
    }
  });
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${w} ${h}' width='${w}' height='${h}' shape-rendering='crispEdges'>${rects}</svg>`;
  return `url("data:image/svg+xml,${svg.replace(/#/g, "%23").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
}

/** 窗口框：墨色外框（缺角）+ 一像素留白 + 一圈细线，中间填窗口色 */
function windowFrame(ink, fill, line) {
  return pixelSvg([
    ".KKKKKKK.",
    "KWWWWWWWK",
    "KWHHHHHWK",
    "KWHWWWHWK",
    "KWHWWWHWK",
    "KWHWWWHWK",
    "KWHHHHHWK",
    "KWWWWWWWK",
    ".KKKKKKK.",
  ], { K: ink, W: fill, H: line });
}

/** 按钮/输入框框：缺角墨框，中间透明（底色走 background） */
function buttonFrame(ink) {
  return pixelSvg([
    ".KKK.",
    "K...K",
    "K...K",
    "K...K",
    ".KKK.",
  ], { K: ink });
}

/** 标签页下沿：只有上和两侧，底边敞开连到窗口 */
const P = {
  ink: "#1a1c2c",
  slate: "#333c57",
  white: "#f4f4f4",
  gold: "#ffcd75",
  goldDeep: "#de9e36",
  red: "#b13e53",
  green: "#38b764",
  sky: "#41a6f6",
  violet: "#a77bd0",
  night: "#262b44",
};

export const css = `
:root {
  --ink: ${P.ink};
  --text: ${P.ink};
  --muted: #566c86;
  --win: ${P.white};
  --sub: #e3e8ef;
  --line: #c9d1dc;
  --field: #ffffff;
  --btn: ${P.white};
  --btn-text: ${P.ink};
  --accent: ${P.red};
  --good: #2a8f4f;
  --bad: ${P.red};
  --warn: #b5761f;
  --gold: ${P.gold};
  --focus: #3b5dc9;
  --scrim: rgba(26, 28, 44, 0.42);
  --frame: ${windowFrame(P.ink, P.white, "#c9d1dc")};
  --btn-frame: ${buttonFrame(P.ink)};
  --drop: drop-shadow(0 4px 0 rgba(26, 28, 44, 0.35));
  --font: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", system-ui, sans-serif;
  --px: 2px;
}
:root.dark {
  --text: #eef1f6;
  --muted: #94b0c2;
  --win: ${P.night};
  --sub: #30375a;
  --line: #414b73;
  --field: #1c2036;
  --btn: #3a4268;
  --btn-text: #eef1f6;
  --accent: #ef6b83;
  --good: #5fd18a;
  --bad: #ef6b83;
  --warn: #f0b45a;
  --focus: ${P.gold};
  --scrim: rgba(8, 9, 18, 0.58);
  --frame: ${windowFrame("#0b0c16", P.night, "#414b73")};
  --btn-frame: ${buttonFrame("#0b0c16")};
  --drop: drop-shadow(0 4px 0 rgba(0, 0, 0, 0.5));
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body { font-family: var(--font); background: #29366f; color: var(--text); font-size: 15px; line-height: 1.55; -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased; }
[data-font="s"] body { font-size: 13px; }
[data-font="l"] body { font-size: 17px; }
h1, h2, h3 { margin: 0.2em 0; line-height: 1.3; font-weight: 700; }
button, select, input { font-family: inherit; font-size: inherit; color: inherit; }
a { color: inherit; text-decoration-color: var(--accent); text-underline-offset: 3px; }
a:hover { color: var(--accent); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
kbd { font-family: inherit; font-size: 0.75em; border: 1px solid currentColor; border-bottom-width: 2px; padding: 0 4px; margin-left: 4px; opacity: 0.7; }
.hidden { display: none !important; }
.nowrap { white-space: nowrap; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.muted { color: var(--muted); font-size: 0.9em; }
.warn-text { color: var(--accent); }

/* ---------- 像素窗口：招牌框 ---------- */
.win, .panel, .dialog, .draft-card {
  border-style: solid;
  border-width: calc(var(--px) * 3);
  border-image: var(--frame) 3 fill / calc(var(--px) * 3) stretch;
  background: transparent;
  color: var(--text);
  filter: var(--drop);
}

/* ---------- 按钮 ---------- */
.btn {
  position: relative;
  padding: 8px 16px 10px;
  border: 4px solid transparent;
  border-image: var(--btn-frame) 2 / 4px stretch;
  background: var(--btn);
  background-clip: padding-box;
  color: var(--btn-text);
  cursor: pointer;
  line-height: 1.3;
  font-weight: 600;
  box-shadow: inset 0 -4px 0 rgba(26, 28, 44, 0.16), inset 0 2px 0 rgba(255, 255, 255, 0.55);
  transition: filter 0.1s;
}
.dark .btn { box-shadow: inset 0 -4px 0 rgba(0, 0, 0, 0.28), inset 0 2px 0 rgba(255, 255, 255, 0.08); }
.btn:hover { filter: brightness(1.05); }
.btn:active { transform: translateY(2px); box-shadow: inset 0 -1px 0 rgba(26, 28, 44, 0.16), inset 0 2px 0 rgba(26, 28, 44, 0.1); }
.btn.primary { background: var(--gold); color: ${P.ink}; box-shadow: inset 0 -4px 0 ${P.goldDeep}, inset 0 2px 0 #fff2c4; }
.btn.primary:active { box-shadow: inset 0 -1px 0 ${P.goldDeep}, inset 0 2px 0 rgba(26, 28, 44, 0.1); }
.btn.danger { color: var(--accent); }
.btn.ghost { background: transparent; box-shadow: none; border-image: none; border-color: transparent; text-decoration: underline; text-decoration-color: var(--muted); text-underline-offset: 4px; font-weight: 500; }
.btn.ghost:hover { text-decoration-color: var(--accent); }
.btn.small { padding: 4px 10px 6px; font-size: 0.85em; }
.btn.wide { width: 100%; }
.btn.disabled, .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; filter: none; }
.btn.back { padding: 2px 10px 4px; }
select {
  padding: 5px 8px; border: 4px solid transparent; border-image: var(--btn-frame) 2 / 4px stretch;
  background: var(--field); background-clip: padding-box; color: var(--text);
}
input[type="checkbox"] { accent-color: ${P.red}; width: 1.15em; height: 1.15em; }
[data-motion="off"] * { transition: none !important; animation: none !important; }

/* ---------- 表单 ---------- */
.field { display: block; margin: 0 0 12px; text-align: left; }
.field-label { display: block; font-size: 0.85em; font-weight: 600; margin-bottom: 4px; color: var(--muted); }
.field input {
  width: 100%; padding: 9px 10px; border: 4px solid transparent; border-image: var(--btn-frame) 2 / 4px stretch;
  background: var(--field); background-clip: padding-box; color: var(--text); font-size: 16px;
  box-shadow: inset 0 3px 0 rgba(26, 28, 44, 0.08);
}
.field input:focus { outline: none; background-color: color-mix(in srgb, var(--gold) 16%, var(--field)); }
.field.inline { display: flex; align-items: center; gap: 8px; margin: 0; }
.field.inline .field-label { margin: 0; white-space: nowrap; }
.field.inline input { width: 9em; }
.field-hint { font-size: 0.82em; color: var(--muted); margin: -4px 0 10px; text-align: left; }
.form-error { color: var(--accent); font-weight: 600; min-height: 1.4em; margin: 0 0 8px; font-size: 0.9em; text-align: left; }
.form-error:empty { min-height: 0; margin: 0; }

/* ---------- 布局 ---------- */
#app { height: 100%; display: flex; flex-direction: column; position: relative; }
#backdrop { position: fixed; inset: 0; width: 100%; height: 100%; display: block; image-rendering: pixelated; z-index: 0; }
.front-mode body::after { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none;
  background: radial-gradient(ellipse at 50% 38%, rgba(26, 28, 44, 0.22) 0%, rgba(26, 28, 44, 0.7) 100%); }
#scene-title, #scene-draft { position: relative; z-index: 1; padding: 16px; overflow: auto; height: 100%; }

/* ---------- 登录 / 标题页 ---------- */
.front { max-width: 460px; margin: 0 auto; padding: max(4vh, 12px) 0 24px; display: flex; flex-direction: column; align-items: center; }
.front-hero { text-align: center; margin-bottom: 14px; }
.front-logo { display: block; margin: 0 auto; image-rendering: pixelated; max-width: 100%; }
.front-tagline { margin: 6px 0 0; color: #f4f4f4; font-weight: 600; letter-spacing: 0.04em; text-shadow: 0 2px 0 ${P.ink}, 2px 0 0 ${P.ink}, -2px 0 0 ${P.ink}, 0 -2px 0 ${P.ink}; }
.front-win { width: 100%; padding: 14px 16px 16px; }
.front-notice, .front .attribution { color: #e3e8ef; font-size: 0.8em; text-align: center; max-width: 440px; margin: 12px auto 0; text-shadow: 0 1px 0 ${P.ink}, 1px 0 0 ${P.ink}, -1px 0 0 ${P.ink}, 0 -1px 0 ${P.ink}; }
.front .attribution a { color: #fff; }

.tabs { display: flex; gap: 0; margin: -2px 0 14px; border-bottom: 4px solid var(--ink); }
.dark .tabs { border-bottom-color: #0b0c16; }
.tab { flex: 1; padding: 8px 0 7px; border: 0; background: transparent; color: var(--muted); font-weight: 700; cursor: pointer; position: relative; }
.tab.on { color: var(--text); }
.tab.on::after { content: ""; position: absolute; left: 20%; right: 20%; bottom: -4px; height: 4px; background: ${P.red}; }
.auth-why { font-size: 0.82em; color: var(--muted); margin: 12px 0 0; }
.guest-row { margin-top: 10px; text-align: center; }
.offline-note { margin: 0 0 12px; padding: 8px 10px; background: var(--sub); border-left: 4px solid ${P.goldDeep}; font-size: 0.92em; }

.who { display: flex; align-items: baseline; gap: 6px; padding-bottom: 10px; margin-bottom: 12px; border-bottom: 2px dashed var(--line); flex-wrap: wrap; }
.who-name { font-weight: 700; font-size: 1.1em; }
.who-spacer { flex: 1; }
.save-card { background: var(--sub); padding: 10px 12px; margin-bottom: 12px; border-left: 6px solid ${P.gold}; }
.save-card.loading { border-left-color: var(--line); }
.save-card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.save-card-head b { font-size: 1.1em; }
.save-bars { display: flex; gap: 12px; margin: 6px 0 2px; font-variant-numeric: tabular-nums; font-weight: 600; flex-wrap: wrap; }
.sb-health { color: ${P.red}; } .sb-money { color: #a8701c; } .sb-energy { color: #2a7fc9; } .sb-freedom { color: #7d55a8; }
.dark .sb-health { color: #ef6b83; } .dark .sb-money { color: ${P.gold}; } .dark .sb-energy { color: #73c3ff; } .dark .sb-freedom { color: #c9a2f0; }
.save-when { font-size: 0.8em; }
.home-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.home-actions .btn { flex: 1 1 auto; }
.home-note { margin: 8px 0 0; font-size: 0.8em; }
.seedbox { display: flex; gap: 8px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-top: 12px; padding-top: 12px; border-top: 2px dashed var(--line); }
.import-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; margin-top: 12px; padding: 8px 10px; background: var(--sub); font-size: 0.88em; }
.lives { margin-top: 14px; padding-top: 10px; border-top: 2px dashed var(--line); }
.lives-head { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.lives-list { list-style: none; margin: 0; padding: 0; font-size: 0.9em; }
.lives-list li { display: grid; grid-template-columns: 3.6em 1fr auto; gap: 2px 8px; padding: 5px 0; border-bottom: 1px dotted var(--line); align-items: baseline; }
.lives-list li:last-child { border-bottom: 0; }
.life-age { font-weight: 700; font-variant-numeric: tabular-nums; }
.life-score { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); }
.life-when { grid-column: 2 / 4; font-size: 0.8em; }

/* ---------- 开局剧本 ---------- */
.draft-box { max-width: 720px; margin: max(5vh, 12px) auto; text-align: center; padding: 16px 18px 18px; }
.draft-box h2 { font-size: 1.35em; }
.draft-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 16px 0 12px; }
.draft-card { text-align: left; padding: 0 12px 12px; filter: none; --px: 2px; }
.draft-cat { margin: 0 -12px 8px; padding: 4px 12px 5px; font-size: 0.8em; font-weight: 700; color: ${P.ink}; letter-spacing: 0.15em; }
.draft-origin .draft-cat { background: ${P.gold}; }
.draft-body .draft-cat { background: #f08a9c; }
.draft-mind .draft-cat { background: #c9a2f0; }
.draft-job .draft-cat { background: #73c3ff; }
.draft-card b { display: block; font-size: 1.15em; margin: 2px 0 4px; }
.draft-desc { font-size: 0.88em; color: var(--muted); }
.draft-box .panel-actions { justify-content: center; }

/* ---------- 小镇 ---------- */
#scene-town { display: flex; flex-direction: column; height: 100%; position: relative; z-index: 1; background: ${P.ink}; }

/* 状态栏：墨色 HUD。桌面一行；窄屏两行 */
#hud { display: grid; grid-template-columns: auto 1fr auto auto; grid-template-areas: "chap bars aps will"; align-items: center; gap: 4px 16px; padding: 7px 12px 8px; padding-top: max(7px, env(safe-area-inset-top)); background: ${P.ink}; color: #f4f4f4; border-bottom: 4px solid ${P.slate}; }
.hud-chapter { grid-area: chap; font-weight: 700; white-space: nowrap; display: flex; align-items: center; }
.hud-time { font-weight: 600; font-size: 0.75em; color: ${P.ink}; background: ${P.gold}; margin-left: 8px; padding: 1px 6px 2px; }
.hud-bars { grid-area: bars; display: flex; gap: 16px; min-width: 0; }
.hud-bar { display: flex; align-items: center; gap: 5px; font-size: 0.85em; min-width: 0; --bar: ${P.green}; }
.hud-icon { width: 1.1em; text-align: center; color: var(--bar); }
.hud-health { --bar: #e8566e; }
.hud-money { --bar: ${P.gold}; }
.hud-energy { --bar: ${P.sky}; }
.hud-freedom { --bar: ${P.violet}; }
.hud-num { font-variant-numeric: tabular-nums; min-width: 1.8em; text-align: right; font-weight: 700; }
.hud-bar.warn .hud-num { color: #ff8a9c; }
.hud-track { width: 54px; height: 10px; background: ${P.slate}; display: inline-block; padding: 2px; box-shadow: inset 0 0 0 1px #0b0c16; }
.hud-fill { display: block; height: 100%; background: var(--bar); transition: width 0.35s steps(6); background-image: repeating-linear-gradient(90deg, transparent 0 5px, rgba(26, 28, 44, 0.55) 5px 6px); box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.35); }
.hud-bar.warn .hud-track { animation: warnpulse 1s steps(2) infinite; }
@keyframes warnpulse { 50% { box-shadow: inset 0 0 0 1px #0b0c16, 0 0 0 2px ${P.red}; } }
.hud-aps { grid-area: aps; display: flex; gap: 4px; }
.hud-ap { width: 11px; height: 14px; background: ${P.slate}; box-shadow: inset 0 0 0 1px #0b0c16; }
.hud-ap.on { background: ${P.gold}; box-shadow: inset 0 -3px 0 ${P.goldDeep}, inset 0 2px 0 #fff2c4; }
.hud-will { grid-area: will; font-size: 0.85em; color: #94b0c2; white-space: nowrap; font-variant-numeric: tabular-nums; }
@media (max-width: 640px) {
  #hud { grid-template-columns: 1fr auto auto; grid-template-areas: "chap aps will" "bars bars bars"; padding: 6px 10px 7px; gap: 6px 12px; }
  .hud-bars { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .hud-track { flex: 1; width: auto; min-width: 12px; }
  .hud-ap { width: 9px; height: 12px; }
}

#mapwrap { flex: 1; position: relative; min-height: 0; overflow: hidden; }
#map { width: 100%; height: 100%; display: block; image-rendering: pixelated; touch-action: none; }
.map-fab { position: absolute; top: 10px; right: 10px; z-index: 3; }
[data-controls="touch"] .map-fab { display: none; }
#sync-badge { position: absolute; top: 10px; left: 10px; z-index: 3; padding: 2px 8px 3px; font-size: 0.75em; font-weight: 700; background: rgba(26, 28, 44, 0.78); color: #a7f070; pointer-events: none; }
#sync-badge::before { content: ""; display: inline-block; width: 6px; height: 6px; margin-right: 6px; vertical-align: 1px; background: currentColor; }
#sync-badge.busy { color: ${P.gold}; }
#sync-badge.bad { color: #ff8a9c; }
#prompt { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 3; padding: 5px 14px 6px; background: ${P.ink}; color: #f4f4f4; font-size: 0.9em; font-weight: 600; white-space: nowrap; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; box-shadow: 0 0 0 2px ${P.gold}, 0 4px 0 2px rgba(26, 28, 44, 0.4); pointer-events: none; }

/* 底部操作栏（触屏） */
#dpad-wrap { display: flex; align-items: center; gap: 12px; padding: 10px 12px; padding-bottom: max(10px, env(safe-area-inset-bottom)); background: ${P.ink}; border-top: 4px solid ${P.slate}; }
[data-controls="keys"] #dpad-wrap { display: none; }
#dpad { display: grid; grid-template-columns: repeat(3, 50px); grid-template-rows: repeat(3, 50px); gap: 4px; }
#dpad button { font-size: 18px; border: 0; background: ${P.slate}; color: #f4f4f4; touch-action: none; user-select: none; -webkit-user-select: none; box-shadow: inset 0 -4px 0 #0b0c16, inset 0 2px 0 rgba(255, 255, 255, 0.12); }
#dpad button:active { background: ${P.gold}; color: ${P.ink}; box-shadow: inset 0 -1px 0 ${P.goldDeep}; }
#dpad [data-act] { font-size: 14px; color: ${P.gold}; }
#interact-btn { margin-left: auto; min-width: 104px; padding: 16px 22px 18px; font-size: 1.1em; background: ${P.gold}; color: ${P.ink}; box-shadow: inset 0 -4px 0 ${P.goldDeep}, inset 0 2px 0 #fff2c4; border-image: ${buttonFrame("#0b0c16")} 2 / 4px stretch; }
#menu-btn { padding: 12px 14px 14px; border-image: ${buttonFrame("#0b0c16")} 2 / 4px stretch; }

/* ---------- 面板 ---------- */
#overlay { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
#overlay:has(.panel)::before { content: ""; position: absolute; inset: 0; background: var(--scrim); pointer-events: auto; animation: scrim-in 0.15s ease-out; }
@keyframes scrim-in { from { opacity: 0; } }
.panel { pointer-events: auto; position: absolute; left: 50%; transform: translateX(-50%); bottom: max(8px, env(safe-area-inset-bottom)); width: min(560px, calc(100vw - 16px)); max-height: min(76vh, calc(100% - 24px)); display: flex; flex-direction: column; overflow: hidden; animation: panel-up 0.18s ease-out; }
.panel.fullscreen, .panel.notice { top: 5vh; bottom: auto; max-height: 90vh; width: min(680px, calc(100vw - 16px)); animation-name: panel-fade; }
.panel.notice { top: 10vh; width: min(520px, calc(100vw - 16px)); }
@keyframes panel-up { from { transform: translate(-50%, 24px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@keyframes panel-fade { from { transform: translate(-50%, 8px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
.panel-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px; margin: 0 0 2px; border-bottom: 2px dashed var(--line); }
.panel-head h2 { flex: 1; font-size: 1.12em; }
.panel-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px 10px 10px; overscroll-behavior: contain; }
.panel-body p { margin: 0.4em 0 0.8em; }
.panel-actions { flex: none; display: flex; gap: 8px; padding: 10px 10px 6px; flex-wrap: wrap; }
.panel > .panel-actions { border-top: 2px dashed var(--line); }
.draft-box .panel-actions { padding: 6px 0 0; }

.npc-row { display: flex; gap: 12px; margin-bottom: 10px; align-items: flex-start; }
.portrait { width: 56px; height: 56px; flex: none; image-rendering: pixelated; background: #94b0c2; box-shadow: 0 0 0 3px ${P.ink}; margin: 3px; }
.npc-name { font-weight: 700; }
.npc-line { position: relative; padding: 7px 10px; margin-top: 6px; background: var(--sub); }
.npc-line::before { content: ""; position: absolute; left: -8px; top: 10px; border: 4px solid transparent; border-right-color: var(--sub); border-top-color: var(--sub); }

.card { padding: 10px 12px; margin: 8px 0; background: var(--sub); border-left: 4px solid var(--line); }
.card-title { font-weight: 700; line-height: 1.45; }
.card-plain { font-size: 0.9em; margin: 6px 0; color: color-mix(in srgb, var(--text) 82%, var(--win)); }
.card-meta { font-size: 0.8em; color: var(--muted); display: flex; gap: 4px 10px; flex-wrap: wrap; margin-bottom: 8px; align-items: center; }
.costs { color: var(--accent); font-weight: 600; }
.stamp { display: inline-block; padding: 0 5px; font-weight: 800; margin-right: 4px; line-height: 1.35; color: #fff !important; }
.grade-A { color: var(--good); }
.grade-B { color: var(--warn); }
.grade-C { color: var(--accent); }
.stamp.grade-A { background: #2a8f4f; }
.stamp.grade-B { background: #c98a2e; }
.stamp.grade-C { background: ${P.red}; }
.benefit { color: var(--text); }

.habit-row { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dotted var(--line); align-items: center; }
.habit-row:last-child { border-bottom: 0; }
.habit-row .btn { flex: none; }

.battle-top { display: flex; gap: 12px; align-items: flex-start; }
.enc-icon { width: 64px; height: 64px; flex: none; image-rendering: pixelated; background: #ffe0e5; box-shadow: 0 0 0 3px ${P.red}; margin: 3px; }
.dark .enc-icon { background: #4a2a3a; }
.threat-line b { font-size: 1.35em; color: var(--accent); font-variant-numeric: tabular-nums; }
.intent-line { font-size: 0.85em; color: var(--muted); margin: 4px 0; }
.enc-desc { font-size: 0.9em; }
.battle-log { max-height: 140px; overflow: auto; padding: 6px 10px; margin: 10px 0; font-size: 0.88em; background: ${P.ink}; color: #e3e8ef; font-variant-numeric: tabular-nums; }
.battle-log:empty { display: none; }
.log-line { padding: 1px 0; }
.battle-actions { display: flex; flex-direction: column; gap: 6px; }
.battle-actions .btn { text-align: left; }
.quiz-step { background: var(--sub); padding: 8px 10px; margin: 6px 0; }
.quiz-q { font-weight: 700; }
.quiz-options { display: flex; flex-direction: column; gap: 6px; margin: 6px 0; }
.quiz-opt { text-align: left; }
.quiz-opt.picked { background: var(--gold); color: ${P.ink}; }
.quiz-opt.excluded { opacity: 0.4; text-decoration: line-through; }
.quiz-why { font-size: 0.85em; padding: 6px 8px; background: var(--win); margin-top: 4px; }
.quiz-why .good { color: var(--good); font-weight: 700; }
.quiz-why .bad { color: var(--accent); font-weight: 700; }

.tempt-pitch { font-size: 1.05em; padding: 8px 12px; border-left: 4px solid var(--accent); margin-bottom: 10px; background: var(--sub); }
.peek-card { background: var(--sub); padding: 8px 10px; border-left: 4px solid ${P.sky}; }
.outcome { padding: 8px 10px; border-left: 4px solid ${P.gold}; background: var(--sub); color: var(--text); }

.settle-rows { margin: 6px 0; }
.settle-row { display: grid; grid-template-columns: 3em 3.6em 1fr; gap: 6px; padding: 3px 0; border-bottom: 1px dotted var(--line); }
.settle-delta { text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; }
.settle-reason { color: var(--muted); }
.settle-row .good { color: var(--good); }
.settle-row .bad { color: var(--accent); }
.settle-life, .settle-town { padding: 6px 10px; border-left: 4px solid ${P.gold}; margin: 6px 0; font-size: 0.9em; background: var(--sub); }
.settle-town { border-left-color: var(--line); }
.settle-now { margin-top: 12px; padding: 8px 10px; font-weight: 700; background: ${P.ink}; color: #f4f4f4; }

.ending-score { font-size: 1.2em; margin-bottom: 8px; }
.ending-score b { font-size: 1.7em; color: var(--accent); font-variant-numeric: tabular-nums; }
.ending-cause, .ending-bars, .ending-habits { margin: 6px 0; }
.ending-tips { margin: 10px 0; padding: 8px 10px; background: var(--sub); border-left: 4px solid ${P.sky}; }
.ending-tips ul { margin: 4px 0; padding-left: 18px; }
.ending-seed code, .save-code { word-break: break-all; font-size: 0.8em; }
.panel .attribution { font-size: 0.78em; color: var(--muted); margin: 12px 0 0; max-width: none; }

.hotlines { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin: 6px 0; }
.hotline { padding: 6px 8px; background: var(--sub); }
.hotline b { font-variant-numeric: tabular-nums; margin-right: 4px; color: var(--accent); }
.menu-section { border-top: 2px dashed var(--line); padding: 10px 0; }
.menu-section:first-child { border-top: 0; padding-top: 0; }
.menu-account { display: flex; align-items: baseline; gap: 8px; }
.menu-actions-row { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 6px; }
.set-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; gap: 8px; border-bottom: 1px dotted var(--line); }
.set-row:has(input[type="checkbox"]) { justify-content: flex-start; }
.about p { font-size: 0.85em; color: var(--muted); }
.conflict-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

/* ---------- 对话框：贴底的像素对话窗 ---------- */
.dialog { position: absolute; left: 50%; transform: translateX(-50%); bottom: max(10px, env(safe-area-inset-bottom)); width: min(760px, calc(100% - 20px)); min-height: 120px; padding: 12px 16px 26px; cursor: pointer; pointer-events: auto; z-index: 5; animation: dialog-up 0.16s ease-out; }
.dialog-text { line-height: 1.75; min-height: 3.4em; font-size: 1.04em; }
.dialog-hint { position: absolute; right: 12px; bottom: 4px; font-size: 0.75em; color: var(--muted); }
.dialog-hint::after { content: ""; display: inline-block; margin-left: 6px; border: 5px solid transparent; border-top: 6px solid ${P.red}; border-bottom: 0; vertical-align: middle; animation: nudge 0.8s steps(2) infinite; }
@keyframes dialog-up { from { transform: translate(-50%, 12px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@keyframes nudge { 50% { transform: translateY(3px); } }

#toast { position: fixed; top: 84px; left: 50%; transform: translateX(-50%); background: ${P.ink}; color: #f4f4f4; padding: 7px 16px 8px; font-size: 0.9em; font-weight: 600; z-index: 30; max-width: 90vw; box-shadow: 0 0 0 2px ${P.gold}, 0 4px 0 2px rgba(26, 28, 44, 0.45); }
.front-mode #toast { top: auto; bottom: max(24px, env(safe-area-inset-bottom)); }
.float-text { position: absolute; top: 40%; left: 50%; transform: translateX(-50%); color: #ff8a9c; font-weight: 800; font-size: 1.15em; white-space: nowrap; text-shadow: 2px 0 0 ${P.ink}, -2px 0 0 ${P.ink}, 0 2px 0 ${P.ink}, 0 -2px 0 ${P.ink}, 2px 2px 0 ${P.ink}, -2px 2px 0 ${P.ink}, 2px -2px 0 ${P.ink}, -2px -2px 0 ${P.ink}, 0 4px 0 ${P.ink}; animation: floatup 1s steps(8) forwards; pointer-events: none; z-index: 4; }
.float-text.good { color: #a7f070; }
@keyframes floatup { from { opacity: 1; transform: translate(-50%, 0); } 70% { opacity: 1; } to { opacity: 0; transform: translate(-50%, -40px); } }
#mapwrap.shake { animation: shake 0.3s steps(5); }
@keyframes shake { 20% { transform: translate(-4px, 2px); } 40% { transform: translate(4px, -2px); } 60% { transform: translate(-2px, 0); } 80% { transform: translate(2px, 2px); } }
#mapwrap.fade-in { animation: fade-in 0.6s steps(6); }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .float-text, #mapwrap.shake, #mapwrap.fade-in, .panel, .dialog, .dialog-hint::after, .hud-bar.warn .hud-track, #overlay::before { animation: none; }
  .hud-fill { transition: none; }
}

/* 横屏手机：面板略透明，十字键缩小 */
@media (orientation: landscape) and (max-height: 500px) {
  .panel { max-height: 88vh; }
  .panel.fullscreen { top: 4vh; }
  #dpad { grid-template-columns: repeat(3, 40px); grid-template-rows: repeat(3, 40px); }
  .front { padding-top: 8px; }
}
@media (max-width: 520px) {
  :root { --px: 2px; }
  .front-win { padding: 12px 12px 14px; }
  .dialog { width: calc(100% - 12px); }
}
`;
