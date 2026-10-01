/**
 * renderer.js —— 离屏预渲染、镜头、叠色、文字。
 * 地面层与物体层在小镇生成后一次性预渲染到离屏画布，每帧只做裁剪；
 * 再画角色、NPC、标记和前景层（树冠、屋顶），最后全屏叠色（multiply）
 * 与原生分辨率文字。视口格数由容器尺寸决定，缩放取整数设备像素。
 */
import { TILE, C, SEGMENT_TINTS, SEASONS } from "./palette.js";
import { drawTile, makeCharacterSheet, partsFromSeed, makeBuildingSprite, makeEncounterIcon, makeDecorSprite } from "./sprites.js";
import { T } from "../town/gen.js";
import { findPath } from "../town/path.js";
import { spotFor, computeSpots } from "../town/spots.js";
import { makeWalker, stepWalker, setPath } from "./walker.js";

/** 六个时段的名字 */
const SEG_NAMES = ["清晨", "上午", "正午", "午后", "黄昏", "夜晚"];

export function makeRenderer(canvas, town, seed, content) {
  const { w, h } = town;
  const ground = mkLayer();
  const objects = mkLayer();
  const foreground = mkLayer();
  const scaleState = { scale: 2 };
  const view = { camX: 0, camY: 0, cols: 20, rows: 14 };
  let encounterIcons = null;
  let npcSprites = [];
  let wanderers = [];
  let playerSheet = null;
  let walker = null;
  let paused = false;
  let raf = 0;
  let lastT = 0;
  const interactProbe = { cb: null };

  function mkLayer() {
    const c = document.createElement("canvas");
    c.width = w * TILE;
    c.height = h * TILE;
    return c;
  }

  /* ---- 预渲染（一次性） ---- */
  let stageName = "young";
  function prerender(stage) {
    stageName = stage || stageName;
    const g = ground.getContext("2d");
    const season = SEASONS[state.season || 0];
    let decorIdx = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = town.tiles[y * w + x];
        drawTile(g, t === T.BLOCK ? 0 : t, x, y, (x * 7 + y * 13 + seed) % 4, t === 0 ? season.grass : null);
      }
    }
    // 水边描一圈沙
    const o = objects.getContext("2d");
    const f = foreground.getContext("2d");
    o.clearRect(0, 0, objects.width, objects.height);
    f.clearRect(0, 0, foreground.width, foreground.height);
    // 建筑
    town.buildings.forEach((b, i) => {
      const sprite = makeBuildingSprite(b, stage, i + seed);
      o.drawImage(sprite, b.x * TILE, b.y * TILE - 6);
    });
    // 装饰
    for (const d of town.decor) {
      const s = makeDecorSprite(d.kind, decorIdx++);
      if (d.kind === "tree") f.drawImage(s, d.x * TILE, d.y * TILE - 2);
      else o.drawImage(s, d.x * TILE, d.y * TILE);
    }
    // NPC 与玩家精灵
    npcSprites = [];
    for (let i = 0; i < 8; i++) {
      npcSprites.push(makeCharacterSheet(partsFromSeed(seed * 31 + i * 97 + 5)));
    }
    if (!playerSheet) playerSheet = makeCharacterSheet({ hair: 1, hairColor: 3, clothes: 1, skin: 0 });
    // 遭遇图标
    encounterIcons = new Map();
    for (const e of content.encounters) {
      if (!encounterIcons.has(e.sprite)) encounterIcons.set(e.sprite, makeEncounterIcon(e.sprite));
    }
    // 游荡 NPC（纯装饰）：种子固定位置与相位
    const spots = computeSpots(town);
    wanderers = [];
    for (let i = 0; i < 8; i++) {
      const s = spotFor(spots, seed + i * 7717, "wander" + i);
      if (!s) break;
      wanderers.push({ x: s[0] * TILE, y: s[1] * TILE, sheet: npcSprites[i], phase: (seed + i * 311) % 628 / 100, home: [s[0] * TILE, s[1] * TILE] });
    }
  }

  /* ---- 镜头与缩放 ---- */
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 320;
    const cssH = canvas.clientHeight || 240;
    // 整数缩放：保证像素不糊
    let s = Math.max(1, Math.floor(Math.min(cssW * dpr / (TILE * 12), cssH * dpr / (TILE * 13))));
    if (s < 1) s = 1;
    scaleState.scale = s;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    view.cols = Math.ceil(canvas.width / (TILE * s));
    view.rows = Math.ceil(canvas.height / (TILE * s));
  }

  function centerCam() {
    if (!walker) return;
    view.camX = Math.max(0, Math.min(w * TILE - view.cols * TILE, walker.px + TILE / 2 - (view.cols * TILE) / 2));
    view.camY = Math.max(0, Math.min(h * TILE - view.rows * TILE, walker.py + TILE / 2 - (view.rows * TILE) / 2));
  }

  /* ---- 交互探测：玩家附近可交互的东西 ---- */
  function nearInteractable() {
    if (!walker) return null;
    const px = Math.round(walker.px / TILE), py = Math.round(walker.py / TILE);
    for (const b of town.buildings) {
      // 门口格与建筑相邻格
      if (b.frontX === px && Math.abs(b.frontY - py) <= 1) return { kind: "building", id: b.id, b };
      if (b.frontY === py && Math.abs(b.frontX - px) <= 1) return { kind: "building", id: b.id, b };
      if (px >= b.x - 1 && px < b.x + b.w + 1 && py >= b.y - 1 && py < b.y + b.h + 1) return { kind: "building", id: b.id, b };
    }
    return null;
  }

  /* ---- 主循环 ---- */
  function frame(t) {
    if (paused) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (t - lastT) / 1000 || 0.016);
    lastT = t;
    if (walker && !state.uiPaused) {
      stepWalker(walker, state.held, dt, (x, y) => !walkable(x, y), () => {
        if (interactProbe.cb) interactProbe.cb();
      });
    }
    centerCam();
    draw(t);
  }

  const state = {
    held: { up: false, down: false, left: false, right: false },
    uiPaused: false, // 面板打开时地图暂停（walker 不推进）
    segment: 0,
    onArrive: null,
  };
  interactProbe.cb = () => { if (state.onArrive) state.onArrive(); };

  function walkable(x, y) {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const t = town.tiles[y * w + x];
    return t < T.BUILDING && t !== T.WATER;
  }

  function draw(t) {
    const g = canvas.getContext("2d");
    const s = scaleState.scale;
    g.imageSmoothingEnabled = false;
    g.fillStyle = C.ink;
    g.fillRect(0, 0, canvas.width, canvas.height);
    const cx = Math.floor(view.camX), cy = Math.floor(view.camY);
    // 地面与物体：直接裁剪
    g.drawImage(ground, cx, cy, view.cols * TILE, view.rows * TILE, 0, 0, view.cols * TILE * s, view.rows * TILE * s);
    g.drawImage(objects, cx, cy, view.cols * TILE, view.rows * TILE, 0, 0, view.cols * TILE * s, view.rows * TILE * s);
    // 实体（在物体层之上）
    const bob = Math.sin(t / 300) > 0 ? 0 : 1;
    // 游荡 NPC
    for (const wnd of wanderers) {
      const wx = wnd.home[0] + Math.sin(t / 1000 + wnd.phase) * TILE * 1.5;
      const wy = wnd.home[1] + Math.cos(t / 1400 + wnd.phase) * TILE * 0.8;
      g.drawImage(wnd.sheet, 0, 0, TILE, TILE, Math.round((wx - cx) * s), Math.round((wy - cy) * s - 2 * s), TILE * s, TILE * s);
    }
    // 遭遇标记与陌生人（由 main 提供 overlays）
    for (const ov of state.overlays || []) {
      const sx = Math.round((ov.x * TILE - cx) * s);
      const sy = Math.round((ov.y * TILE - cy) * s);
      if (ov.icon) {
        const icon = encounterIcons.get(ov.icon);
        if (icon) {
          const size = 12 * s;
          g.drawImage(icon, sx + (TILE * s - size) / 2, sy - size * 0.4 - bob * s, size, size);
        }
      }
      if (ov.bubble) {
        g.fillStyle = C.sign;
        const bw = 8 * s;
        g.fillRect(sx + TILE * s / 2 - bw / 2, sy - 10 * s - bob * s, bw, 7 * s);
        g.fillStyle = C.ink;
        g.font = `bold ${5 * s}px monospace`;
        g.textAlign = "center";
        g.fillText(ov.bubble, sx + TILE * s / 2, sy - 5 * s - bob * s);
      }
    }
    // 玩家
    if (walker) {
      g.drawImage(playerSheet, walker.frame * TILE, walker.dir * TILE, TILE, TILE, Math.round((walker.px - cx) * s), Math.round((walker.py - cy) * s - 2 * s), TILE * s, TILE * s);
    }
    // 前景（树冠）
    g.drawImage(foreground, cx, cy, view.cols * TILE, view.rows * TILE, 0, 0, view.cols * TILE * s, view.rows * TILE * s);
    // 全屏叠色：时段 × 季节
    const season = SEASONS[state.season || 0];
    g.globalCompositeOperation = "multiply";
    g.fillStyle = "white";
    g.fillStyle = season.tint;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = SEGMENT_TINTS[state.segment % 6];
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = "source-over";
    // 时段角标（原生分辨率文字）
    g.font = `${Math.max(10, Math.floor(3 * s))}px sans-serif`;
    g.textAlign = "left";
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(canvas.width - 11 * s, 4 * s, 10 * s, 6 * s);
    g.fillStyle = "#fff";
    g.fillText(SEG_NAMES[state.segment % 6] || "", canvas.width - 10.4 * s, 8.6 * s);
  }

  /* ---- 公共接口 ---- */
  const api = {
    state,
    resize,
    setPlayer(x, y) {
      walker = makeWalker(x, y);
      view.camX = Math.max(0, Math.min(w * TILE - view.cols * TILE, x * TILE - (view.cols * TILE) / 2));
      view.camY = Math.max(0, Math.min(h * TILE - view.rows * TILE, y * TILE - (view.rows * TILE) / 2));
    },
    playerTile() {
      return walker ? [Math.round(walker.px / TILE), Math.round(walker.py / TILE)] : [0, 0];
    },
    pathEmpty() {
      return !walker || walker.path.length === 0;
    },
    screenInfo() {
      return { scale: scaleState.scale, camX: Math.floor(view.camX), camY: Math.floor(view.camY) };
    },
    setPlayerSheet(parts) {
      playerSheet = makeCharacterSheet(parts);
    },
    prerender,
    start() {
      if (!raf) {
        lastT = 0;
        raf = requestAnimationFrame(frame);
      }
    },
    stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    setPaused(p) {
      state.uiPaused = p;
      if (p) state.held.up = state.held.down = state.held.left = state.held.right = false;
    },
    setSegment(seg) { state.segment = seg; },
    setSeason(idx) { state.season = idx; prerender(stageName); },
    setOverlays(list) { state.overlays = list; },
    walkTo(gx, gy) {
      if (!walker) return false;
      const [px, py] = api.playerTile();
      const path = findPath(px, py, gx, gy, walkable);
      if (!path) return false;
      setPath(walker, path);
      return true;
    },
    nearInteractable,
    onArrive(cb) { state.onArrive = cb; },
    held: state.held,
  };
  return api;
}
