/**
 * build.mjs —— 构建产物：单个 HTML 文件 dist/index.html。
 * 用 esbuild 把 src/ui/main.js 打成一个压缩脚本，与样式一起内联进 HTML 模板。
 * 构建末尾检查：体积不超过 1.5MB；页面里有署名与许可链接。
 * 参数变化而规则版本 v 没加 1 会在 validate 阶段失败（人工把关）。
 */
import { build } from "esbuild";
import { writeFileSync, mkdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const result = await build({
  entryPoints: [join(root, "src/ui/main.js")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "chrome90", "safari14"],
  write: false,
  legalComments: "none",
  define: { "process.env.NODE_ENV": '"production"' },
  logLevel: "info",
});

const js = result.outputFiles[0].text;

const css = `
:root { --paper: #f4efe4; --ink: #333c57; --muted: #566c86; --line: #c9bfa8; --accent: #b13e53; --good: #2f9e57; --bad: #b13e53; --warn: #b5761f; --card: rgba(255,255,255,0.55); --tint: rgba(51,60,87,0.05); --scrim: rgba(26,28,44,0.32); --shadow: 0 6px 24px rgba(26,28,44,0.22); }
:root.dark { --paper: #24283d; --ink: #e8e3d5; --muted: #94b0c2; --line: #3d445f; --accent: #e0607a; --good: #4fc27a; --bad: #e0607a; --warn: #e2a64a; --card: rgba(0,0,0,0.2); --tint: rgba(255,255,255,0.04); --scrim: rgba(0,0,0,0.5); --shadow: 0 6px 24px rgba(0,0,0,0.45); }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body { font-family: "Noto Sans SC", system-ui, sans-serif; background: var(--paper); color: var(--ink); font-size: 15px; line-height: 1.5; -webkit-tap-highlight-color: transparent; }
[data-font="s"] body { font-size: 13px; }
[data-font="l"] body { font-size: 17px; }
h1, h2, h3 { font-family: "Noto Serif SC", "Noto Sans SC", serif; margin: 0.2em 0; line-height: 1.3; }
button, select, input { font-family: inherit; font-size: inherit; }
a { color: inherit; text-decoration-color: var(--accent); text-underline-offset: 2px; }
a:hover { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
kbd { font-family: ui-monospace, monospace; font-size: 0.8em; border: 1px solid var(--line); border-bottom-width: 2px; padding: 0 4px; margin-left: 2px; color: var(--muted); }
.hidden { display: none !important; }
.nowrap { white-space: nowrap; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.muted { color: var(--muted); font-size: 0.9em; }
.warn-text { color: var(--accent); }

/* 布局：手机竖屏 上地图下操作 */
#app { height: 100%; display: flex; flex-direction: column; }
#scene-title, #scene-draft { padding: 16px; overflow: auto; height: 100%; }
.title-box, .draft-box { max-width: 640px; margin: 8vh auto; text-align: center; }
.title-box h1 { font-size: 2.3em; letter-spacing: 0.08em; }
.title-box h1::after { content: ""; display: block; width: 72px; height: 6px; margin: 10px auto 0; background: linear-gradient(90deg, var(--accent) 0 25%, transparent 25% 37.5%, var(--warn) 37.5% 62.5%, transparent 62.5% 75%, var(--good) 75%); }
.subtitle { color: var(--muted); }
.title-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 24px 0; }
.title-seed { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-bottom: 12px; }
.title-seed input { padding: 8px 10px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); width: 180px; }
.title-seed input:focus { border-color: var(--ink); outline: none; }
.title-notice, .attribution { font-size: 0.82em; color: var(--muted); max-width: 480px; margin: 8px auto; }
.draft-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 16px 0; }
.draft-card { border: 1px solid var(--line); border-top: 3px solid var(--ink); padding: 10px 12px 12px; text-align: left; background: var(--card); }
.draft-card b { display: block; font-size: 1.1em; margin: 2px 0 4px; }
.draft-cat { font-size: 0.75em; color: var(--muted); letter-spacing: 2px; }
.draft-box .panel-actions { justify-content: center; }

#scene-town { display: flex; flex-direction: column; height: 100%; }

/* 状态栏：桌面一行；窄屏两行（章节/行动点/毅力 + 四项状态） */
#hud { display: grid; grid-template-columns: auto 1fr auto auto; grid-template-areas: "chap bars aps will"; align-items: center; gap: 4px 14px; padding: 6px 12px; padding-top: max(6px, env(safe-area-inset-top)); border-bottom: 2px solid var(--line); background: var(--tint); }
.hud-chapter { grid-area: chap; font-family: "Noto Serif SC", serif; font-weight: bold; white-space: nowrap; }
.hud-time { font-family: "Noto Sans SC", system-ui, sans-serif; font-weight: normal; font-size: 0.78em; color: var(--muted); margin-left: 8px; padding: 0 6px; border: 1px solid var(--line); }
.hud-bars { grid-area: bars; display: flex; gap: 14px; min-width: 0; }
.hud-bar { display: flex; align-items: center; gap: 4px; font-size: 0.85em; min-width: 0; }
.hud-icon { width: 1.1em; text-align: center; }
.hud-health .hud-icon { color: #b13e53; }
.hud-money .hud-icon { color: #c98a2e; }
.hud-energy .hud-icon { color: #3b8fd6; }
.hud-freedom .hud-icon { color: #7a5aa0; }
.dark .hud-health .hud-icon { color: #e0607a; }
.dark .hud-energy .hud-icon { color: #5fb3f6; }
.dark .hud-freedom .hud-icon { color: #b58ad6; }
.hud-num { font-variant-numeric: tabular-nums; min-width: 1.8em; text-align: right; }
.hud-bar.warn .hud-num { color: var(--accent); font-weight: bold; }
.hud-track { width: 44px; height: 6px; background: rgba(127,127,127,0.22); display: inline-block; }
.hud-fill { display: block; height: 100%; background: var(--good); transition: width 0.35s ease-out; }
.hud-bar.warn .hud-fill { background: var(--accent); }
.hud-aps { grid-area: aps; display: flex; gap: 3px; }
.hud-ap { width: 10px; height: 14px; border: 1px solid var(--muted); background: transparent; }
.hud-ap.on { background: var(--good); border-color: var(--good); }
.hud-will { grid-area: will; font-size: 0.85em; color: var(--muted); white-space: nowrap; }
@media (max-width: 640px) {
  #hud { grid-template-columns: 1fr auto auto; grid-template-areas: "chap aps will" "bars bars bars"; padding: 5px 10px; }
  .hud-bars { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .hud-track { flex: 1; width: auto; min-width: 12px; }
  .hud-ap { width: 8px; height: 12px; }
}

#mapwrap { flex: 1; position: relative; min-height: 0; overflow: hidden; }
#map { width: 100%; height: 100%; display: block; image-rendering: pixelated; touch-action: none; }
.map-fab { position: absolute; top: 8px; right: 8px; z-index: 3; background: color-mix(in srgb, var(--paper) 88%, transparent); box-shadow: var(--shadow); }
[data-controls="touch"] .map-fab { display: none; }
#prompt { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 3; padding: 6px 14px; background: var(--ink); color: var(--paper); font-size: 0.9em; white-space: nowrap; max-width: calc(100% - 24px); overflow: hidden; text-overflow: ellipsis; box-shadow: var(--shadow); pointer-events: none; }

/* 底部操作栏（触屏） */
#dpad-wrap { display: flex; align-items: center; gap: 12px; padding: 8px 12px; padding-bottom: max(8px, env(safe-area-inset-bottom)); border-top: 2px solid var(--line); background: var(--tint); }
[data-controls="keys"] #dpad-wrap { display: none; }
#dpad { display: grid; grid-template-columns: repeat(3, 50px); grid-template-rows: repeat(3, 50px); gap: 4px; }
#dpad button { font-size: 18px; border: 1px solid var(--line); background: var(--card); color: var(--ink); touch-action: none; user-select: none; -webkit-user-select: none; }
#dpad button:active { background: var(--ink); color: var(--paper); }
#dpad [data-act] { font-size: 12px; color: var(--muted); }
#interact-btn { margin-left: auto; min-width: 96px; padding: 18px 22px; font-size: 1.05em; }
#menu-btn { padding: 12px 14px; }

.btn { padding: 9px 14px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; line-height: 1.3; transition: border-color 0.12s, background 0.12s; }
.btn:hover { border-color: var(--muted); }
.btn:active { transform: translateY(1px); }
.btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.btn.primary:hover { background: color-mix(in srgb, var(--ink) 88%, var(--paper)); }
.btn.danger { color: var(--accent); border-color: var(--accent); }
.btn.small { padding: 5px 10px; font-size: 0.85em; }
.btn.disabled, .btn:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
.btn.back { padding: 4px 10px; }
select { padding: 5px 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); }
input[type="checkbox"] { accent-color: var(--ink); width: 1.1em; height: 1.1em; }
[data-motion="off"] * { transition: none !important; animation: none !important; }

/* 面板 */
#overlay { position: fixed; inset: 0; pointer-events: none; z-index: 10; }
.panel { pointer-events: auto; position: absolute; left: 50%; transform: translateX(-50%); bottom: 0; width: min(560px, 100vw); max-height: 72vh; display: flex; flex-direction: column; overflow: hidden; background: var(--paper); border: 2px solid var(--ink); border-bottom: 0; box-shadow: 0 0 0 100vmax var(--scrim), var(--shadow); animation: panel-up 0.18s ease-out; padding-bottom: env(safe-area-inset-bottom); }
.panel.fullscreen, .panel.notice { top: 6vh; bottom: auto; max-height: 88vh; width: min(680px, 94vw); border-bottom: 2px solid var(--ink); animation-name: panel-fade; }
.panel.notice { top: 10vh; width: min(520px, 94vw); }
@keyframes panel-up { from { transform: translate(-50%, 24px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
@keyframes panel-fade { from { transform: translate(-50%, 8px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
.panel-head { flex: none; display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-bottom: 1px solid var(--line); background: var(--paper); }
.panel-head h2 { flex: 1; font-size: 1.1em; }
.panel-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px 12px; overscroll-behavior: contain; }
.panel-body p { margin: 0.4em 0 0.8em; }
.panel-actions { flex: none; display: flex; gap: 8px; padding: 10px 12px; flex-wrap: wrap; }
.panel > .panel-actions { border-top: 1px solid var(--line); background: var(--tint); }
.draft-box .panel-actions { padding: 6px 0; }

.npc-row { display: flex; gap: 12px; margin-bottom: 10px; align-items: flex-start; }
.portrait { width: 52px; height: 52px; flex: none; image-rendering: pixelated; border: 2px solid var(--ink); background: var(--card); }
.npc-name { font-weight: bold; }
.npc-line { font-family: "Noto Serif SC", serif; position: relative; padding: 6px 10px; margin-top: 4px; border: 1px solid var(--line); background: var(--card); }

.card { border: 1px solid var(--line); padding: 10px 12px; margin: 8px 0; background: var(--card); }
.card-title { font-weight: bold; line-height: 1.4; }
.card-plain { font-size: 0.9em; margin: 6px 0; color: color-mix(in srgb, var(--ink) 85%, var(--paper)); }
.card-meta { font-size: 0.8em; color: var(--muted); display: flex; gap: 4px 10px; flex-wrap: wrap; margin-bottom: 8px; }
.costs { color: var(--accent); }
.stamp { display: inline-block; border: 2px solid; padding: 0 5px; font-weight: bold; margin-right: 4px; line-height: 1.25; font-family: ui-monospace, monospace; }
.grade-A { color: var(--good); }
.grade-B { color: var(--warn); }
.grade-C { color: var(--accent); }
.benefit { color: var(--ink); }

.habit-row { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px dashed var(--line); align-items: center; }
.habit-row:last-child { border-bottom: 0; }
.habit-row .btn { flex: none; }

.battle-top { display: flex; gap: 12px; align-items: flex-start; }
.enc-icon { width: 64px; height: 64px; flex: none; image-rendering: pixelated; border: 2px solid var(--accent); background: var(--card); }
.threat-line b { font-size: 1.3em; color: var(--accent); font-variant-numeric: tabular-nums; }
.intent-line { font-size: 0.85em; color: var(--muted); margin: 4px 0; }
.enc-desc { font-size: 0.9em; }
.battle-log { max-height: 140px; overflow: auto; border: 1px dashed var(--line); padding: 6px 8px; margin: 10px 0; font-size: 0.88em; background: var(--tint); }
.battle-log:empty { display: none; }
.log-line { padding: 1px 0; }
.battle-actions { display: flex; flex-direction: column; gap: 6px; }
.battle-actions .btn { text-align: left; }
.quiz-step { border: 1px solid var(--line); padding: 8px 10px; margin: 6px 0; }
.quiz-q { font-weight: bold; }
.quiz-options { display: flex; flex-direction: column; gap: 5px; margin: 6px 0; }
.quiz-opt { text-align: left; }
.quiz-opt.picked { outline: 2px solid var(--ink); outline-offset: -2px; background: var(--tint); }
.quiz-opt.excluded { opacity: 0.4; text-decoration: line-through; }
.quiz-why { font-size: 0.85em; padding: 6px 8px; background: var(--tint); margin-top: 4px; }
.quiz-why .good { color: var(--good); font-weight: bold; }
.quiz-why .bad { color: var(--accent); font-weight: bold; }

.tempt-pitch { font-family: "Noto Serif SC", serif; font-size: 1.05em; padding: 8px 12px; border-left: 3px solid var(--accent); margin-bottom: 10px; background: var(--tint); }
.peek-card { border: 1px dashed var(--line); padding: 8px 10px; }
.outcome { padding: 8px 10px; border-left: 3px solid var(--ink); background: var(--tint); color: var(--ink); }

.settle-rows { margin: 6px 0; }
.settle-row { display: grid; grid-template-columns: 3em 3.6em 1fr; gap: 6px; padding: 3px 0; border-bottom: 1px dotted var(--line); }
.settle-delta { text-align: right; font-variant-numeric: tabular-nums; }
.settle-reason { color: var(--muted); }
.settle-row .good { color: var(--good); }
.settle-row .bad { color: var(--accent); }
.settle-life, .settle-town { padding: 6px 10px; border-left: 3px solid var(--warn); margin: 6px 0; font-size: 0.9em; background: var(--tint); }
.settle-town { border-left-color: var(--line); }
.settle-now { margin-top: 12px; padding: 8px 10px; font-weight: bold; border: 1px solid var(--line); }

.ending-score { font-size: 1.2em; margin-bottom: 8px; }
.ending-score b { font-size: 1.6em; color: var(--accent); }
.ending-cause, .ending-bars, .ending-habits { margin: 6px 0; }
.ending-tips { margin: 10px 0; padding: 8px 10px; border: 1px solid var(--line); background: var(--card); }
.ending-tips ul { margin: 4px 0; padding-left: 18px; }
.ending-seed code, .save-code { word-break: break-all; font-size: 0.8em; }
.panel .attribution { font-size: 0.78em; color: var(--muted); margin: 12px 0 0; max-width: none; }

.hotlines { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 6px 0; }
.hotline { border: 1px solid var(--line); padding: 6px 8px; background: var(--card); }
.hotline b { font-variant-numeric: tabular-nums; margin-right: 4px; }
.menu-section { border-top: 1px dashed var(--line); padding: 10px 0; }
.menu-section:first-child { border-top: 0; padding-top: 0; }
.menu-actions-row { display: flex; gap: 8px; flex-wrap: wrap; padding-top: 6px; }
.set-row { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; gap: 8px; border-bottom: 1px dotted var(--line); }
.set-row:has(input[type="checkbox"]) { justify-content: flex-start; }
.about p { font-size: 0.85em; color: var(--muted); }

/* 对话框：贴底，桌面上文字收在中间一栏 */
.dialog { position: absolute; left: 0; right: 0; bottom: 0; min-height: 18vh; background: var(--paper); border-top: 2px solid var(--ink); padding: 14px max(16px, calc((100% - 760px) / 2)); padding-bottom: max(14px, env(safe-area-inset-bottom)); cursor: pointer; pointer-events: auto; z-index: 5; box-shadow: 0 -6px 18px rgba(26,28,44,0.15); animation: dialog-up 0.16s ease-out; }
.dialog-text { font-family: "Noto Serif SC", serif; line-height: 1.7; min-height: 3.4em; }
.dialog-hint { font-size: 0.75em; color: var(--muted); margin-top: 8px; text-align: right; animation: blink 1.2s steps(2) infinite; }
[data-controls="touch"] .dialog { min-height: max(18vh, calc(186px + env(safe-area-inset-bottom))); }
@keyframes dialog-up { from { transform: translateY(12px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes blink { 50% { opacity: 0.35; } }

#toast { position: fixed; top: 76px; left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--paper); padding: 8px 16px; font-size: 0.9em; z-index: 30; max-width: 90vw; box-shadow: var(--shadow); }
.float-text { position: absolute; top: 40%; left: 50%; transform: translateX(-50%); color: var(--accent); font-weight: bold; white-space: nowrap; text-shadow: 0 0 3px var(--paper), 0 0 3px var(--paper), 0 1px 0 var(--paper); animation: floatup 1s ease-out forwards; pointer-events: none; z-index: 4; }
.float-text.good { color: var(--good); }
@keyframes floatup { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -40px); } }
#mapwrap.shake { animation: shake 0.3s linear; }
@keyframes shake { 20% { transform: translate(-4px, 1px); } 40% { transform: translate(4px, -1px); } 60% { transform: translate(-3px, 0); } 80% { transform: translate(2px, 1px); } }
#mapwrap.fade-in { animation: fade-in 0.6s ease-out; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .float-text, #mapwrap.shake, #mapwrap.fade-in, .panel, .dialog, .dialog-hint { animation: none; }
  .hud-fill { transition: none; }
}

/* 横屏手机：面板半透明 */
@media (orientation: landscape) and (max-height: 500px) {
  .panel { background: color-mix(in srgb, var(--paper) 92%, transparent); max-height: 86vh; }
  .panel.fullscreen { top: 4vh; }
  #dpad { grid-template-columns: repeat(3, 40px); grid-template-rows: repeat(3, 40px); }
}
`;

const template = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>高性价比人生 · 像素小镇 RPG</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'%3E%3Cpath fill='%231a1c2c' d='M7 1h2v1h1v1h1v1h1v1h1v1h1v2h-1v7H3V8H2V6h1V5h1V4h1V3h1V2h1z'/%3E%3Cpath fill='%23c95d42' d='M7 2h2v1h1v1h1v1h1v1h1v1H3V6h1V5h1V4h1V3h1z'/%3E%3Cpath fill='%23e0d5b3' d='M4 8h8v6H4z'/%3E%3Cpath fill='%238a6f4d' d='M7 10h2v4H7z'/%3E%3Cpath fill='%2341a6f6' d='M5 9h1v1H5zm5 0h1v1h-1z'/%3E%3C/svg%3E">
<meta name="description" content="改编自 HowToLiveBetter《高性价比人生指南》的行走小镇 RPG：13 章、640 条建议、种子驱动的一局人生。">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700&family=Noto+Serif+SC:wght@700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<div id="app">
  <div id="scene-title" class="hidden"></div>
  <div id="scene-draft" class="hidden"></div>
  <div id="scene-town" class="hidden">
    <header id="hud" aria-label="状态栏"></header>
    <div id="mapwrap">
      <canvas id="map"></canvas>
      <button id="menu-fab" class="btn small map-fab" aria-label="菜单">菜单<kbd>Esc</kbd></button>
      <div id="prompt" class="hidden" aria-hidden="true"></div>
    </div>
    <div id="dpad-wrap">
      <div id="dpad" aria-label="方向键">
        <span></span><button data-dir="up" aria-label="上">▲</button><span></span>
        <button data-dir="left" aria-label="左">◀</button>
        <button data-act="interact" aria-label="交互">●</button>
        <button data-dir="right" aria-label="右">▶</button>
        <span></span><button data-dir="down" aria-label="下">▼</button><span></span>
      </div>
      <button id="interact-btn" class="btn">交互</button>
      <button id="menu-btn" class="btn" aria-label="菜单">菜单</button>
    </div>
  </div>
  <div id="overlay"></div>
  <div id="toast" class="hidden" role="status"></div>
</div>
<noscript>需要启用 JavaScript 才能游玩。</noscript>
<script>${js}</script>
</body>
</html>`;

mkdirSync(join(root, "dist"), { recursive: true });
writeFileSync(join(root, "dist/index.html"), template);
const size = statSync(join(root, "dist/index.html")).size;
const limit = 1.5 * 1024 * 1024;
if (size > limit) {
  console.error(`构建失败：dist/index.html 为 ${(size / 1024).toFixed(0)} KB，超过 1.5MB 上限`);
  process.exit(1);
}
if (template.indexOf("HowToLiveBetter") < 0 || template.indexOf("CC BY 4.0") < 0) {
  console.error("构建失败：页面缺少署名或许可链接");
  process.exit(1);
}
console.log(`dist/index.html 构建完成：${(size / 1024).toFixed(0)} KB`);
