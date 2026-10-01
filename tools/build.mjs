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
:root { --paper: #f4efe4; --ink: #333c57; --muted: #566c86; --line: #c9bfa8; --accent: #b13e53; --good: #38b764; --bad: #b13e53; }
:root.dark { --paper: #24283d; --ink: #e8e3d5; --muted: #94b0c2; --line: #3d445f; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; }
body { font-family: "Noto Sans SC", system-ui, sans-serif; background: var(--paper); color: var(--ink); font-size: 15px; }
[data-font="s"] body { font-size: 13px; }
[data-font="l"] body { font-size: 17px; }
h1, h2, h3 { font-family: "Noto Serif SC", "Noto Sans SC", serif; margin: 0.2em 0; }
button { font-family: inherit; }
.hidden { display: none !important; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.muted { color: var(--muted); font-size: 0.9em; }
.warn-text { color: var(--accent); }

/* 布局：手机竖屏 上地图下操作 */
#app { height: 100%; display: flex; flex-direction: column; }
#scene-title, #scene-draft { padding: 16px; overflow: auto; }
.title-box, .draft-box { max-width: 640px; margin: 8vh auto; text-align: center; }
.subtitle { color: var(--muted); }
.title-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 24px 0; }
.title-seed { display: flex; gap: 8px; justify-content: center; margin-bottom: 12px; }
.title-seed input { padding: 8px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); width: 180px; }
.title-notice, .attribution { font-size: 0.82em; color: var(--muted); max-width: 480px; margin: 8px auto; }
.draft-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin: 16px 0; }
.draft-card { border: 1px solid var(--line); padding: 12px; text-align: left; background: rgba(255,255,255,0.5); }
.dark .draft-card { background: rgba(0,0,0,0.2); }
.draft-cat { font-size: 0.75em; color: var(--muted); letter-spacing: 2px; }

#scene-town { display: flex; flex-direction: column; height: 100%; }
#hud { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border-bottom: 2px solid var(--line); background: rgba(0,0,0,0.04); flex-wrap: wrap; }
.hud-chapter { font-family: "Noto Serif SC", serif; font-weight: bold; }
.hud-bars { display: flex; gap: 8px; flex: 1; min-width: 0; flex-wrap: wrap; }
.hud-bar { display: flex; align-items: center; gap: 3px; font-size: 0.85em; }
.hud-bar.warn .hud-num { color: var(--accent); font-weight: bold; }
.hud-track { width: 40px; height: 6px; background: rgba(0,0,0,0.12); display: inline-block; }
.hud-fill { display: block; height: 100%; background: var(--good); }
.hud-bar.warn .hud-fill { background: var(--accent); }
.hud-aps { display: flex; gap: 3px; }
.hud-ap { width: 10px; height: 14px; border: 1px solid var(--line); background: transparent; }
.hud-ap.on { background: var(--good); }
.hud-will { font-size: 0.85em; color: var(--muted); }
#mapwrap { flex: 1; position: relative; min-height: 0; }
#map { width: 100%; height: 100%; display: block; image-rendering: pixelated; touch-action: none; }
#dpad-wrap { display: flex; justify-content: space-between; padding: 8px 12px; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
#dpad { display: grid; grid-template-columns: repeat(3, 52px); grid-template-rows: repeat(3, 52px); gap: 4px; }
#dpad button { font-size: 18px; border: 1px solid var(--line); background: rgba(255,255,255,0.6); color: var(--ink); touch-action: none; }
.dark #dpad button { background: rgba(0,0,0,0.3); }
#interact-btn { align-self: center; padding: 16px 22px; font-size: 16px; }
[data-dpad="off"] #dpad-wrap #dpad { visibility: hidden; }
@media (pointer: fine) { [data-dpad="auto"] #dpad-wrap #dpad { visibility: hidden; } }

.btn { padding: 9px 14px; border: 1px solid var(--line); background: var(--paper); color: var(--ink); cursor: pointer; }
.btn:hover { border-color: var(--muted); }
.btn.primary { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.btn.danger { color: var(--accent); border-color: var(--accent); }
.btn.small { padding: 5px 9px; font-size: 0.85em; }
.btn.disabled { opacity: 0.5; cursor: not-allowed; }
[data-motion="off"] * { transition: none !important; animation: none !important; }

/* 面板 */
#overlay { position: fixed; inset: 0; pointer-events: none; }
.panel { pointer-events: auto; position: absolute; left: 50%; transform: translateX(-50%); bottom: 0; width: min(560px, 96vw); max-height: 72vh; overflow: auto; background: var(--paper); border: 2px solid var(--ink); padding: 0 0 10px; }
.panel.fullscreen { top: 6vh; bottom: auto; max-height: 86vh; width: min(680px, 94vw); }
.panel.notice { top: 20vh; bottom: auto; }
.panel-head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--paper); z-index: 2; }
.panel-head h2 { flex: 1; font-size: 1.1em; }
.panel-body { padding: 10px 12px; }
.panel-actions { display: flex; gap: 8px; padding: 6px 12px; flex-wrap: wrap; }

.npc-row { display: flex; gap: 10px; margin-bottom: 10px; }
.portrait { width: 48px; height: 48px; image-rendering: pixelated; border: 1px solid var(--line); }
.npc-name { font-weight: bold; }
.npc-line { font-family: "Noto Serif SC", serif; }

.card { border: 1px solid var(--line); padding: 8px; margin: 8px 0; background: rgba(255,255,255,0.5); }
.dark .card { background: rgba(0,0,0,0.2); }
.card-title { font-weight: bold; }
.card-plain { font-size: 0.9em; margin: 4px 0; }
.card-meta { font-size: 0.8em; color: var(--muted); display: flex; gap: 8px; flex-wrap: wrap; }
.costs { color: var(--accent); }
.stamp { display: inline-block; border: 1px solid; padding: 0 4px; font-weight: bold; margin-right: 4px; }
.grade-A { color: var(--good); }
.grade-B { color: #c98a2e; }
.grade-C { color: var(--accent); }
.benefit { color: var(--ink); }

.habit-row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px dashed var(--line); align-items: center; }

.battle-top { display: flex; gap: 10px; }
.enc-icon { width: 64px; height: 64px; image-rendering: pixelated; }
.threat-line b { font-size: 1.2em; color: var(--accent); }
.intent-line { font-size: 0.85em; color: var(--muted); margin: 4px 0; }
.battle-log { max-height: 130px; overflow: auto; border: 1px dashed var(--line); padding: 6px; margin: 8px 0; font-size: 0.88em; }
.log-line { padding: 1px 0; }
.battle-actions { display: flex; flex-direction: column; gap: 6px; }
.quiz-step { border: 1px solid var(--line); padding: 8px; margin: 6px 0; }
.quiz-options { display: flex; flex-direction: column; gap: 5px; margin: 6px 0; }
.quiz-opt.picked { outline: 2px solid var(--ink); }
.quiz-opt.excluded { opacity: 0.4; text-decoration: line-through; }
.quiz-why { font-size: 0.85em; padding: 6px; background: rgba(0,0,0,0.05); margin-top: 4px; }
.quiz-why .good { color: var(--good); font-weight: bold; }
.quiz-why .bad { color: var(--accent); font-weight: bold; }

.tempt-pitch { font-family: "Noto Serif SC", serif; font-size: 1.05em; padding: 8px; border-left: 3px solid var(--accent); margin-bottom: 10px; }
.peek-card { border: 1px dashed var(--line); padding: 8px; }

.settle-row { padding: 3px 0; }
.settle-row .good { color: var(--good); }
.settle-row .bad { color: var(--accent); }
.settle-life, .settle-town { padding: 6px 8px; border-left: 3px solid var(--line); margin: 6px 0; font-size: 0.9em; }
.settle-now { margin-top: 10px; font-weight: bold; }

.ending-score { font-size: 1.2em; margin-bottom: 8px; }
.ending-tips ul { margin: 4px 0; padding-left: 18px; }
.ending-seed code, .save-code { word-break: break-all; font-size: 0.8em; }
.attribution { font-size: 0.78em; color: var(--muted); margin-top: 10px; }

.hotlines { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin: 6px 0; }
.hotline { border: 1px solid var(--line); padding: 6px; }
.menu-section { border-top: 1px dashed var(--line); padding: 8px 0; }
.menu-actions-row { display: flex; gap: 8px; flex-wrap: wrap; }
.set-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; gap: 8px; }
.about p { font-size: 0.85em; color: var(--muted); }

.dialog { position: absolute; left: 0; right: 0; bottom: 0; min-height: 18vh; background: var(--paper); border-top: 2px solid var(--ink); padding: 12px 16px; cursor: pointer; pointer-events: auto; z-index: 5; }
.dialog-text { font-family: "Noto Serif SC", serif; line-height: 1.5; }
.dialog-hint { font-size: 0.75em; color: var(--muted); margin-top: 8px; text-align: right; }

#toast { position: fixed; top: 64px; left: 50%; transform: translateX(-50%); background: var(--ink); color: var(--paper); padding: 8px 16px; font-size: 0.9em; z-index: 30; max-width: 90vw; }
.float-text { position: absolute; top: 40%; left: 50%; transform: translateX(-50%); color: var(--accent); font-weight: bold; animation: floatup 1s ease-out forwards; pointer-events: none; z-index: 20; }
@keyframes floatup { from { opacity: 1; transform: translate(-50%, 0); } to { opacity: 0; transform: translate(-50%, -40px); } }
@media (prefers-reduced-motion: reduce) { .float-text { animation: none; } }

/* 横屏手机：面板半透明 */
@media (orientation: landscape) and (max-height: 500px) {
  .panel { background: color-mix(in srgb, var(--paper) 88%, transparent); }
  .panel.fullscreen { top: 4vh; }
}
`;

const template = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>高性价比人生 · 像素小镇 RPG</title>
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
    <div id="mapwrap"><canvas id="map"></canvas></div>
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
