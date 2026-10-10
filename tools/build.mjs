/**
 * build.mjs —— 构建产物：单个 HTML 文件 dist/index.html。
 * 用 esbuild 把 src/ui/main.js 打成一个压缩脚本，与样式一起内联进 HTML 模板。
 * 样式在 tools/styles.mjs。构建末尾检查：体积不超过 1.5MB；页面里有署名与许可链接。
 * 参数变化而规则版本 v 没加 1 会在 validate 阶段失败（人工把关）。
 */
import { build } from "esbuild";
import { css } from "./styles.mjs";
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


const template = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>高性价比人生 · 像素小镇 RPG</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'%3E%3Cpath fill='%231a1c2c' d='M7 1h2v1h1v1h1v1h1v1h1v1h1v2h-1v7H3V8H2V6h1V5h1V4h1V3h1V2h1z'/%3E%3Cpath fill='%23c95d42' d='M7 2h2v1h1v1h1v1h1v1h1v1H3V6h1V5h1V4h1V3h1z'/%3E%3Cpath fill='%23e0d5b3' d='M4 8h8v6H4z'/%3E%3Cpath fill='%238a6f4d' d='M7 10h2v4H7z'/%3E%3Cpath fill='%2341a6f6' d='M5 9h1v1H5zm5 0h1v1h-1z'/%3E%3C/svg%3E">
<meta name="description" content="改编自 HowToLiveBetter《高性价比人生指南》的行走小镇 RPG：13 章、640 条建议、种子驱动的一局人生。">
<meta name="theme-color" content="#1a1c2c">
<style>${css}</style>
</head>
<body>
<div id="app">
  <canvas id="backdrop" class="hidden" aria-hidden="true"></canvas>
  <div id="scene-title" class="hidden"></div>
  <div id="scene-draft" class="hidden"></div>
  <div id="scene-town" class="hidden">
    <header id="hud" aria-label="状态栏"></header>
    <div id="mapwrap">
      <canvas id="map"></canvas>
      <div id="sync-badge" class="hidden" role="status"></div>
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
