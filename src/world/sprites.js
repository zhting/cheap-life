/**
 * sprites.js —— 程序绘制的像素素材：地砖、角色、建筑、遭遇图、头像。
 * 页面不引用外部图片；启动时全部画进离屏画布。
 */
import { TILE, C, HAIR_COLORS, CLOTHES_COLORS, SKIN_COLORS, STAGE_ROOFS } from "./palette.js";

function mkCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** 字符位图 → 像素画。'.' 透明，其余按色表取色 */
function stamp(g, rows, colors, ox, oy, scale) {
  const s = scale || 1;
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === "." || ch === " ") continue;
      g.fillStyle = colors[ch] || C.ink;
      g.fillRect(ox + x * s, oy + y * s, s, s);
    }
  }
}

/* ---------------- 地砖 ---------------- */

function hashNoise(seed, x, y) {
  let h = (seed ^ (x * 374761393) ^ (y * 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 画一块 16×16 地砖到 g */
export function drawTile(g, type, x, y, variant, seasonGrass) {
  const px = x * TILE, py = y * TILE;
  if (type === 0) {
    // 草：底色 + 种子噪点
    g.fillStyle = seasonGrass || C.grass;
    g.fillRect(px, py, TILE, TILE);
    for (let i = 0; i < 6; i++) {
      const nx = Math.floor(hashNoise(variant * 7 + 1, x * 16 + i, y * 16) * 16);
      const ny = Math.floor(hashNoise(variant * 7 + 2, x * 16, y * 16 + i) * 16);
      g.fillStyle = (i % 2 === 0) ? C.grassLit : "rgba(0,0,0,0.08)";
      g.fillRect(px + nx, py + ny, 1, 2);
    }
  } else if (type === 1) {
    // 路
    g.fillStyle = C.road;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = C.roadEdge;
    for (let i = 0; i < 3; i++) {
      const nx = Math.floor(hashNoise(variant + 3, x + i, y) * 15);
      const ny = Math.floor(hashNoise(variant + 4, x, y + i) * 15);
      g.fillRect(px + nx, py + ny, 2, 1);
    }
  } else if (type === 2) {
    // 水
    g.fillStyle = C.water;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = C.waterLit;
    const off = (variant % 2) * 4;
    for (let i = 0; i < 2; i++) {
      g.fillRect(px + ((i * 7 + off) % 12) + 1, py + 4 + i * 7, 4, 1);
    }
  } else if (type === 3) {
    // 沙
    g.fillStyle = C.sand;
    g.fillRect(px, py, TILE, TILE);
    g.fillStyle = "rgba(0,0,0,0.06)";
    g.fillRect(px + 3, py + 9, 3, 1);
    g.fillRect(px + 10, py + 4, 2, 1);
  } else if (type === 4) {
    // 广场石板
    g.fillStyle = C.plaza;
    g.fillRect(px, py, TILE, TILE);
    g.strokeStyle = C.plazaEdge;
    g.lineWidth = 1;
    g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
  }
}

/* ---------------- 角色 ---------------- */

/**
 * 画一个 16×16 角色帧。parts = { hair, hairColor, clothes, skin }，均为索引。
 * dir: 0 下 1 上 2 左 3 右；frame: 0-2（走路帧）。
 */
export function drawCharacter(g, ox, oy, parts, dir, frame) {
  const hair = HAIR_COLORS[parts.hairColor % HAIR_COLORS.length];
  const cloth = CLOTHES_COLORS[parts.clothes % CLOTHES_COLORS.length];
  const skin = SKIN_COLORS[parts.skin % SKIN_COLORS.length];
  const ink = C.ink;
  const step = frame === 1 ? 1 : frame === 2 ? -1 : 0;
  // 腿
  g.fillStyle = ink;
  g.fillRect(ox + 5, oy + 12 + Math.max(0, step), 2, 3 - Math.max(0, step));
  g.fillRect(ox + 9, oy + 12 + Math.max(0, -step), 2, 3 - Math.max(0, -step));
  // 身体
  g.fillStyle = cloth;
  g.fillRect(ox + 4, oy + 8, 8, 5);
  g.fillStyle = ink;
  g.fillRect(ox + 4, oy + 8, 8, 1);
  // 手
  g.fillStyle = skin;
  g.fillRect(ox + 3, oy + 9 + step, 1, 2);
  g.fillRect(ox + 12, oy + 9 - step, 1, 2);
  // 头
  g.fillStyle = skin;
  g.fillRect(ox + 5, oy + 2, 6, 6);
  // 头发（6 种发型）
  g.fillStyle = hair;
  const hs = parts.hair % 6;
  if (hs === 0) { g.fillRect(ox + 4, oy + 1, 8, 2); g.fillRect(ox + 4, oy + 2, 1, 3); g.fillRect(ox + 11, oy + 2, 1, 3); }
  else if (hs === 1) { g.fillRect(ox + 4, oy + 1, 8, 3); }
  else if (hs === 2) { g.fillRect(ox + 3, oy + 1, 10, 2); g.fillRect(ox + 3, oy + 2, 1, 5); g.fillRect(ox + 12, oy + 2, 1, 5); }
  else if (hs === 3) { g.fillRect(ox + 5, oy + 1, 6, 2); }
  else if (hs === 4) { g.fillRect(ox + 4, oy + 1, 8, 2); g.fillRect(ox + 4, oy + 3, 2, 1); g.fillRect(ox + 10, oy + 3, 2, 1); }
  else { g.fillRect(ox + 4, oy, 8, 3); }
  // 脸（朝向）
  g.fillStyle = ink;
  if (dir === 0) { g.fillRect(ox + 6, oy + 5, 1, 1); g.fillRect(ox + 9, oy + 5, 1, 1); }
  else if (dir === 1) { g.fillStyle = hair; g.fillRect(ox + 5, oy + 4, 6, 3); }
  else {
    const ex = dir === 2 ? ox + 6 : ox + 9;
    g.fillRect(ex, oy + 5, 1, 1);
    if (dir === 2) g.fillStyle = hair, g.fillRect(ox + 9, oy + 4, 2, 3);
    else g.fillStyle = hair, g.fillRect(ox + 5, oy + 4, 2, 3);
  }
}

/** 预渲染一张角色精灵表：4 方向 × 3 帧 */
export function makeCharacterSheet(parts) {
  const c = mkCanvas(TILE * 3, TILE * 4);
  const g = c.getContext("2d");
  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 3; frame++) {
      drawCharacter(g, frame * TILE, dir * TILE, parts, dir, frame);
    }
  }
  return c;
}

/** 从种子派生 NPC 外观（部件组合，几乎不重样） */
export function partsFromSeed(n) {
  return {
    hair: n % 6,
    hairColor: Math.floor(n / 6) % 6,
    clothes: Math.floor(n / 36) % 8,
    skin: Math.floor(n / 288) % 4,
  };
}

/** 头像（对话框用）：同一套部件放大绘制 */
export function makePortrait(parts) {
  const c = mkCanvas(32, 32);
  const g = c.getContext("2d");
  g.fillStyle = C.wall;
  g.fillRect(0, 0, 32, 32);
  g.scale(2, 2);
  drawCharacter(g, 2, 3, parts, 0, 0);
  return c;
}

/* ---------------- 建筑 ---------------- */

const ICONS = {
  cross: ["................", "......XX........", "......XX........", "...XXXXXXXXX....", "...XXXXXXXXX....", "......XX........", "......XX........", "................"],
  yen: ["................", "....X.....X.....", ".....X...X......", "......X.X.......", ".......X........", ".......X........", ".......X........", "................"],
  shield: ["................", "..XXXXXXXXXX....", "..XXXXXXXXXX....", "..XX......XX....", "..XX......XX....", "...XX....XX.....", "....XX..XX......", ".....XXXX......."],
  basket: ["................", "..X..........X..", "...XXXXXXXXXX...", "...XXXXXXXXXX...", "....XXXXXXXX....", "....XXXXXXXX....", ".....XXXXXX.....", "................"],
  brief: ["................", "..XXXXXXXXXXX...", "..XXXXXXXXXXX...", "..XX.......XX...", "..XXXXXXXXXXX...", "..XXXXXXXXXXX...", "................", "................"],
  badge: ["................", "....XXXXXXXX....", "...XXXXXXXXXX...", "...XX..XX..XX...", "...XX..XX..XX...", "...XXXXXXXXXX...", "....XXXXXXXX....", "................"],
  book: ["................", "...XXXXXXXXXX...", "...XX....XXXX...", "...XX....XXXX...", "...XX....XXXX...", "...XXXXXXXXXX...", "...XX....XXXX...", "................"],
  hands: ["................", "....XX....XX....", "...XXXXXXXXXX...", "...XX.XX.XXXX...", "...XXXXXXXXXX...", "....XXXXXXX.....", "................", "................"],
  tree: ["................", ".....XXXX.......", "...XXXXXXXX.....", "..XXXXXXXXXX....", "..XXXXXXXXXX....", "....XXXXXX......", "......XX........", "......XX........"],
  rocket: ["................", ".......XX.......", "......XXXX......", "......XXXX......", ".....XXXXXX.....", "....XX.XX.XX....", "......XXXX......", "................"],
  home: ["................", "......XX........", ".....XXXX.......", "....XXXXXXXX....", "...XXXXXXXXXX...", "..XXXXXXXXXXXX..", "..XX.XXXXX.XX...", "................"],
};

/** 每栋建筑 8×8 招牌图标（放大到 16） */
const SIGN_ICONS = {
  home: "home", hospital: "cross", rescue: "shield", bank: "yen", market: "basket",
  hr: "brief", police: "badge", school: "book", community: "hands", park: "tree", incubator: "rocket",
};

/**
 * 预渲染一栋建筑（w×h 格）到离屏画布。
 * stage 用于换屋顶主色；LateStage 加养老服务站招牌由调用方处理。
 */
export function makeBuildingSprite(b, stage, seedN) {
  const roofs = STAGE_ROOFS[stage] || STAGE_ROOFS.young;
  const roof = roofs[seedN % roofs.length];
  const w = b.w * TILE, h = b.h * TILE;
  const c = mkCanvas(w, h + 6);
  const g = c.getContext("2d");
  // 墙
  g.fillStyle = C.wall;
  g.fillRect(1, 8, w - 2, h - 9);
  g.fillStyle = C.wallShade;
  for (let yy = 8; yy < h - 1; yy += 8) g.fillRect(1, yy, w - 2, 1);
  // 屋顶（等腰梯形）
  g.fillStyle = roof;
  g.beginPath();
  g.moveTo(0, 9);
  g.lineTo(w / 2, 0);
  g.lineTo(w, 9);
  g.lineTo(w, 12);
  g.lineTo(0, 12);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(0,0,0,0.18)";
  g.fillRect(0, 10, w, 2);
  // 窗
  g.fillStyle = C.window;
  const winRows = Math.max(1, Math.floor((h - 14) / 12));
  for (let r = 0; r < winRows; r++) {
    for (let i = 0; i < Math.floor(b.w / 2); i++) {
      g.fillRect(6 + i * 30, 16 + r * 12, 6, 5);
    }
  }
  // 门（画在南侧中央）
  const dx = Math.floor(w / 2) - 4;
  g.fillStyle = C.door;
  g.fillRect(dx, h - 12, 8, 11);
  g.fillStyle = C.ink;
  g.fillRect(dx, h - 12, 8, 1);
  // 招牌
  const iconName = SIGN_ICONS[b.id] || "home";
  const icon = ICONS[iconName];
  if (icon) {
    g.fillStyle = C.sign;
    g.fillRect(w / 2 - 10, 13, 20, 12);
    g.fillStyle = C.ink;
    g.fillRect(w / 2 - 10, 13, 20, 1);
    stamp(g, icon, { X: roof }, w / 2 - 8, 15, 1);
  }
  // 描边
  g.strokeStyle = C.ink;
  g.strokeRect(0.5, 0.5, w - 1, h + 5.5);
  return c;
}

/* ---------------- 遭遇图标（32×32，战斗里放大 4-6 倍） ---------------- */

const ENC_ICONS = {
  car: ["................", "............XX..", ".XXXXXXXXXXXXX..", ".X..........XX..", ".X..XXXXXXXXXX..", ".XXXXXXXXXXXXX..", ".X....X...X...X.", ".XXXXXX...XXXXX."],
  flame: ["................", ".......X........", "......XX...X....", ".....XXXX.XX....", "....XXXXXXXX....", "...XXXXXXXXX....", "...XXXXXXXXX....", "....XXXXXXX....."],
  gas: ["................", "....XXXXX.......", "...XXXXXXXXX....", "..XXXXXXXXXXX...", "..XXXXXXXXXXX...", "...XXXXXXXXX....", "....XXXXXXX.....", "................"],
  water: ["................", ".......X........", "......XXX.......", ".....XXXXX......", "....XXXXXXX.....", "...XXXXXXXXX....", "....XXXXXXX.....", ".....XXXXX......"],
  heart: ["................", "...XX....XX.....", "..XXXX..XXXX....", "..XXXXXXXXXXX...", "..XXXXXXXXXXX...", "...XXXXXXXXX....", "....XXXXXXX.....", ".....XXXXX......"],
  brain: ["................", "..XX.XXXX.XX....", ".XXXXXXXXXXXX...", ".XXXXXXXXXXXX...", ".XX.XX.XX.XXX...", ".XXXXXXXXXXXX...", "..XX.XXXX.XX....", "................"],
  bolt: ["................", ".......XXXX.....", "......XXXX......", ".....XXXX.......", "....XXXXXXX.....", "......XXXX......", ".....XXXX.......", "....XX.........."],
  chart: ["................", ".........XX.....", "........XXX.....", ".......XXX......", ".....XXXXX......", "...XXXXXX.XX....", "..XXXXXXXXXX....", ".XXXXXXXXXXXX..."],
  pill: ["................", ".....XXXXXX.....", "....XXXXXXXX....", "....XX....XX....", "....XX....XX....", "....XXXXXXXX....", ".....XXXXXX.....", "................"],
  person: ["................", ".....XXXX.......", "....XXXXXX......", ".....XXXX.......", "....XXXXXX......", "...XXXXXXXX.....", "...XX....XX.....", "...XX....XX....."],
  elder: ["................", ".....XXXX.......", "....XXXXXX......", ".....XXXX.......", "....XXXXXX......", "....XXXXXX.X....", "...XX....XX.X...", "...XX....XX.X..."],
  storm: ["................", "....XXXXXXX.....", "...XXXXXXXXX....", "....XXXXXXX.....", "......XX........", ".....XX.........", "....XXXXX.......", "......XX........"],
  mushroom: ["................", "....XXXXXXXX....", "..XXXXXXXXXXXX..", ".XXXX..XX..XXXX.", "..XXXXXXXXXXXX..", "....XX....XX....", "....XX....XX....", "...XXXX..XXXX..."],
  snake: ["................", "..XXXX..........", "..XX.XXXX.......", "..XX....XX......", "..XX..XXXXXX....", "......XX...XX...", "..XXXXX.........", "................"],
  food: ["................", ".........XXXX...", "........XXXXXX..", ".......XXXXXXX..", "......XXXXXXX...", ".....XXXXXX.....", "..XX.XXXX.......", "...XX..........."],
  sun: ["................", ".......XX.......", "...X...XX...X...", "....XXXXXX......", ".XXXXXXXXXXXX...", "....XXXXXX......", "...X...XX...X...", ".......XX......."],
  snow: ["................", "....X..X..X.....", ".....X.X.X......", "..XXXXXXXXXXXX..", ".....X.X.X......", "....X..X..X.....", "................", "................"],
  rain: ["................", "....XXXXXXX.....", "...XXXXXXXXX....", "....XXXXXXX.....", "..X...X...X.....", "....X...X...X...", "..X...X...X.....", "................"],
  moon: ["................", "......XXXX......", ".....XXXX.......", "....XXXX........", "....XXXX........", ".....XXXX.......", "......XXXX......", "................"],
  phone: ["................", "...XXXXXXXXXX...", "...XXXXXXXXXX...", "...XX......XX...", "...XX......XX...", "...XXXXXXXXXX...", "................", "................"],
  paper: ["................", "..XXXXXXXXXXX...", "..XX.......XX...", "..XX..XXXX.XX...", "..XX.......XX...", "..XX..XXXX.XX...", "..XXXXXXXXXXX...", "................"],
  coin: ["................", ".....XXXXXX.....", "...XXXXXXXXXX...", "..XXX.XX.XXXX...", "..XXX.XX.XXXX...", "...XXXXXXXXXX...", ".....XXXXXX.....", "................"],
  hand: ["................", "....XX.XX.XX....", "....XX.XX.XX....", "....XXXXXXXX....", "..XXXXXXXXXX....", "..XXXXXXXXXX....", "...XXXXXXXX.....", "................"],
  cross: ICONS.cross, book: ICONS.book, badge: ICONS.badge, basket: ICONS.basket,
  pen: ["................", "..........XX....", ".........XXXX...", "........XXXX....", ".......XXXX.....", "..XXXX.XXX......", "..XXXXXXXX......", "..XXX..XX......."],
  brief: ICONS.brief, bandage: ["................", "..XXXXXXXXXX....", ".XXXXXXXXXXXX...", ".XXXX....XXXX...", ".XXXX....XXXX...", ".XXXXXXXXXXXX...", "..XXXXXXXXXX....", "................"],
  code: ["................", "....XX....XX....", "...XX......XX...", "..XX...XX...XX..", "..XX...XX...XX..", "...XX......XX...", "....XX....XX....", "................"],
  eye: ["................", "...XXXXXXXXXX...", "..XX........XX..", "..XX..XXXX..XX..", "..XX........XX..", "...XXXXXXXXXX...", "................", "................"],
  fist: ["................", "...XXXXXXXXXX...", "..XXXXXXXXXXXX..", "..XXXXXXXXXXXX..", "..XXXXXXXXXXXX..", "...XXXXXXXXXX...", "................", "................"],
  key: ["................", ".....XXXX.......", "....XX..XX......", "....XX..XX......", ".....XXXX.......", "......XX........", "......XXXX......", "......XX........"],
  flask: ["................", "......XXXX......", "......XXXX......", ".....XX..XX.....", "....XX....XX....", "...XXXXXXXXXX...", "...XXXXXXXXXX...", "................"],
  child: ["................", ".....XXXX.......", "....XXXXXX......", ".....XXXX.......", "....XXXXXX......", "....XXXXXX......", "....XX..XX......", "....XX..XX......"],
  knife: ["................", "..........XXX...", ".........XXXX...", "........XXXX....", "..XX..XXXX......", "..XXXXXXXX......", "....XXXX........", "................"],
  bug: ["................", "......X..X......", "...XXXXXXXXXX...", "..XX.XXXXXX.XX..", "..XXXXXXXXXXXX..", "...XXXXXXXXXX...", "......X..X......", "................"],
  bone: ["................", ".XX.........XX..", "XXXX.XXXXXX.XXXX", "XXXX.XXXXXX.XXXX", ".XX.........XX..", "................", "................", "................"],
  blood: ["................", "......XX........", ".....XXXX.......", "....XXXXXX......", "...XXXXXXXX.....", "...XXXXXXXX.....", "....XXXXXX......", "................"],
  paw: ["................", "...XX..XX..XX...", "...XXXXXXXXXX...", "...XXXXXXXXXX...", "....XXXXXXXX....", ".....XX..XX.....", "................", "................"],
  dice: ["................", "...XXXXXXXXXX...", "..XX..XX..XXXX..", "..XXXXXXXXXXXX..", "..XX..XX..XXXX..", "..XXXXXXXXXXXX..", "...XXXXXXXXXX...", "................"],
  gift: ["................", "......XXXX......", "...XX.XXXX.XX...", "...XXXXXXXXXX...", "......XXXX......", "......XXXX......", "......XXXX......", "................"],
  people: ["................", "....XX...XX.....", "...XXXX.XXXX....", "...XXXX.XXXX....", "..XXXXXXXXXX....", "..XX.XXXX.XX....", "..XX.XXXX.XX....", "................"],
  leaf: ["................", ".......XX.......", ".....XXXXXX.....", "...XXXXXXXXXX...", "...XXXXXXXXXX...", ".....XXXXXX.....", ".......XX.......", "................"],
};

/** 遭遇图标 → 32×32 离屏画布 */
export function makeEncounterIcon(spriteName) {
  const rows = ENC_ICONS[spriteName] || ENC_ICONS.person;
  const c = mkCanvas(32, 32);
  const g = c.getContext("2d");
  const colors = { X: C.ink };
  // 两色：主形用深墨，先画一个 2px 偏移的浅色底
  g.fillStyle = "rgba(255,255,255,0.9)";
  g.fillRect(3, 3, 26, 26);
  g.strokeStyle = C.ink;
  g.strokeRect(2.5, 2.5, 27, 27);
  stamp(g, rows, colors, 8, 10, 1);
  return c;
}

/** 装饰物（树/花/长椅/路灯）16×16 */
export function makeDecorSprite(kind, variant) {
  const c = mkCanvas(TILE, TILE);
  const g = c.getContext("2d");
  if (kind === "tree") {
    g.fillStyle = C.trunk;
    g.fillRect(7, 10, 2, 5);
    g.fillStyle = C.tree;
    g.beginPath();
    g.arc(8, 7, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = C.treeLit;
    g.beginPath();
    g.arc(6, 5, 2.5, 0, Math.PI * 2);
    g.fill();
  } else if (kind === "flower") {
    const col = C.flower[variant % C.flower.length];
    g.fillStyle = C.grassDark;
    g.fillRect(7, 10, 1, 4);
    g.fillStyle = col;
    g.fillRect(6, 7, 3, 3);
    g.fillStyle = C.sign;
    g.fillRect(7, 8, 1, 1);
  } else if (kind === "bench") {
    g.fillStyle = C.bench;
    g.fillRect(2, 8, 12, 3);
    g.fillRect(2, 6, 12, 1);
    g.fillRect(3, 11, 1, 3);
    g.fillRect(12, 11, 1, 3);
  } else if (kind === "lamp") {
    g.fillStyle = C.ink;
    g.fillRect(7, 4, 2, 10);
    g.fillStyle = C.lamp;
    g.fillRect(5, 1, 6, 4);
  }
  return c;
}
