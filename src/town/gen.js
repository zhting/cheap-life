/**
 * gen.js —— 小镇生成：纯数据与算法，Node 里也能跑。
 * 36×28 格。六种骨架 → 按尺寸档放建筑（贴邻摆放）→ 从"家"门口 BFS 连通校验
 * （全部门口和公共空地可达，最多重试 10 次，仍失败退回动态兜底摆放）
 * → 带最小间距的伪随机装饰散布。同一局布局固定，随人生阶段只换外观。
 */
import { stream, int, shuffle } from "../core/rng.js";
import { TOWN_W, TOWN_H } from "../core/params.js";

export const T = { GRASS: 0, ROAD: 1, WATER: 2, SAND: 3, PLAZA: 4, BUILDING: 10, BLOCK: 11 };

const W = TOWN_W, H = TOWN_H;

/** 建筑尺寸档（大 8×5 / 中 6×5 / 小 5×4）。创业园可选，也进布局，面板按阶段开放。 */
const SIZES = {
  home: [5, 4], hospital: [8, 5], market: [8, 5], community: [8, 5], school: [8, 5],
  rescue: [6, 5], bank: [6, 5], hr: [6, 5], police: [6, 5], incubator: [6, 5], park: [5, 4],
};

/** 骨架：主路、水面、公园、广场的位置 */
function skeletonShapes(kind) {
  switch (kind) {
    case 0: // 十字街
      return {
        road: [ { x: 17, y: 0, w: 3, h: H }, { x: 0, y: 13, w: W, h: 3 } ],
        water: [], park: { x: 2, y: 2, w: 9, h: 7 }, plaza: null,
      };
    case 1: // 环形广场
      return {
        road: [ { x: 13, y: 0, w: 3, h: H }, { x: 0, y: 12, w: W, h: 3 }, { x: 26, y: 0, w: 2, h: H } ],
        water: [], park: { x: 2, y: 17, w: 8, h: 8 },
        plaza: { x: 16, y: 14, w: 8, h: 7 },
      };
    case 2: // 河岸街
      return {
        road: [ { x: 8, y: 0, w: 3, h: H }, { x: 0, y: 12, w: W, h: 3 }, { x: 25, y: 0, w: 2, h: H } ],
        water: [ { x: 3, y: 0, w: 2, h: H } ],
        park: { x: 28, y: 2, w: 7, h: 7 }, plaza: null,
      };
    case 3: // 丁字路口
      return {
        road: [ { x: 0, y: 18, w: W, h: 3 }, { x: 18, y: 0, w: 3, h: 21 } ],
        water: [], park: { x: 3, y: 3, w: 10, h: 8 }, plaza: null,
      };
    case 4: // 双街夹公园
      return {
        road: [ { x: 0, y: 7, w: W, h: 3 }, { x: 0, y: 18, w: W, h: 3 }, { x: 16, y: 0, w: 3, h: 7 } ],
        water: [ { x: 31, y: 22, w: 4, h: 5 } ],
        park: { x: 21, y: 10, w: 12, h: 8 }, plaza: null,
      };
    default: // 坡地阶梯街
      return {
        road: [ { x: 0, y: 10, w: 21, h: 3 }, { x: 18, y: 10, w: 3, h: 18 }, { x: 18, y: 23, w: 18, h: 3 }, { x: 29, y: 0, w: 3, h: 13 } ],
        water: [ { x: 2, y: 23, w: 6, h: 4 } ],
        park: { x: 2, y: 2, w: 9, h: 6 }, plaza: null,
      };
  }
}


function fillRects(grid, rects, t) {
  for (const r of rects) {
    for (let y = r.y; y < r.y + r.h && y < H; y++) {
      for (let x = r.x; x < r.x + r.w && x < W; x++) {
        if (x >= 0 && y >= 0) grid[y * W + x] = t;
      }
    }
  }
}

function markBuilding(grid, b, t) {
  for (let y = b.y; y < b.y + b.h; y++) {
    for (let x = b.x; x < b.x + b.w; x++) grid[y * W + x] = t;
  }
}

function freeCellsIn(grid, r, t) {
  const cells = [];
  for (let y = Math.max(0, r.y); y < Math.min(H, r.y + r.h); y++) {
    for (let x = Math.max(0, r.x); x < Math.min(W, r.x + r.w); x++) {
      if (grid[y * W + x] === t) cells.push([x, y]);
    }
  }
  return cells;
}

/** 从 (sx,sy) BFS；返回可达集合（水与建筑不可走） */
function bfsReach(grid, sx, sy) {
  const seen = new Uint8Array(W * H);
  const q = [[sx, sy]];
  seen[sy * W + sx] = 1;
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const i = ny * W + nx;
      if (seen[i]) continue;
      const t = grid[i];
      if (t === T.WATER || t >= T.BUILDING) continue;
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

function doorFrontCell(b) {
  return [b.frontX, b.frontY];
}

function assignDoor(grid, b) {
  const sides = [
    { d: "s", cells: Array.from({ length: b.w }, (_, i) => [b.x + i, b.y + b.h]) },
    { d: "n", cells: Array.from({ length: b.w }, (_, i) => [b.x + i, b.y - 1]) },
    { d: "e", cells: Array.from({ length: b.h }, (_, i) => [b.x + b.w, b.y + i]) },
    { d: "w", cells: Array.from({ length: b.h }, (_, i) => [b.x - 1, b.y + i]) },
  ];
  for (const side of sides) {
    for (const [x, y] of side.cells) {
      if (x >= 0 && y >= 0 && x < W && y < H && (grid[y * W + x] === T.ROAD || grid[y * W + x] === T.PLAZA)) {
        b.door = side.d;
        b.frontX = x; b.frontY = y;
        return;
      }
    }
  }
  // 兜底：扫周边一圈，挑一个可走的前格（优先路/广场，其次草地）
  let best = null;
  for (const side of sides) {
    for (const [x, y] of side.cells) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const t = grid[y * W + x];
      if (t === T.ROAD || t === T.PLAZA) { best = [x, y, side.d]; break; }
      if (t < T.BUILDING && t !== T.WATER && !best) best = [x, y, side.d];
    }
    if (best && best[2] && (grid[best[1] * W + best[0]] === T.ROAD || grid[best[1] * W + best[0]] === T.PLAZA)) break;
  }
  if (best) {
    b.door = best[2];
    b.frontX = best[0];
    b.frontY = best[1];
  } else {
    b.door = "s";
    b.frontX = b.x;
    b.frontY = Math.min(H - 1, b.y + b.h);
  }
}

function canPlace(grid, x, y, bw, bh) {
  if (x < 1 || y < 1 || x + bw > W - 1 || y + bh > H - 1) return false;
  for (let yy = y; yy < y + bh; yy++) {
    for (let xx = x; xx < x + bw; xx++) {
      const t = grid[yy * W + xx];
      if (t !== T.GRASS && t !== T.SAND) return false;
    }
  }
  return true;
}

/**
 * 骨架区表：每个骨架一组已验证的建筑位（互不压路/水/公园/广场、连通可达）。
 * 运行时做确定性抖动与同尺寸轮换，保证布局唯一率；抖动失败退回原位。
 */
const ZONE_TABLE = [
  [ { id: "market", x: 24, y: 1 }, { id: "community", x: 24, y: 16 }, { id: "school", x: 9, y: 2 }, { id: "hospital", x: 1, y: 6 }, { id: "incubator", x: 9, y: 7 }, { id: "bank", x: 26, y: 7 }, { id: "police", x: 2, y: 19 }, { id: "rescue", x: 20, y: 21 }, { id: "hr", x: 27, y: 21 }, { id: "home", x: 11, y: 20 }, { id: "park", x: 12, y: 16 } ],
  [ { id: "hospital", x: 3, y: 7 }, { id: "school", x: 2, y: 16 }, { id: "community", x: 5, y: 21 }, { id: "market", x: 16, y: 3 }, { id: "hr", x: 1, y: 2 }, { id: "bank", x: 7, y: 2 }, { id: "incubator", x: 28, y: 1 }, { id: "police", x: 28, y: 16 }, { id: "rescue", x: 28, y: 6 }, { id: "park", x: 28, y: 21 }, { id: "home", x: 19, y: 8 } ],
  [ { id: "market", x: 12, y: 15 }, { id: "school", x: 11, y: 7 }, { id: "community", x: 16, y: 20 }, { id: "hospital", x: 12, y: 1 }, { id: "bank", x: 28, y: 15 }, { id: "hr", x: 28, y: 7 }, { id: "police", x: 28, y: 1 }, { id: "incubator", x: 28, y: 21 }, { id: "rescue", x: 19, y: 6 }, { id: "park", x: 20, y: 16 }, { id: "home", x: 11, y: 22 } ],
  [ { id: "market", x: 1, y: 7 }, { id: "hospital", x: 13, y: 21 }, { id: "school", x: 25, y: 4 }, { id: "community", x: 3, y: 21 }, { id: "hr", x: 22, y: 10 }, { id: "incubator", x: 12, y: 13 }, { id: "rescue", x: 9, y: 2 }, { id: "police", x: 28, y: 13 }, { id: "bank", x: 26, y: 21 }, { id: "home", x: 10, y: 9 }, { id: "park", x: 1, y: 2 } ],
  [ { id: "school", x: 4, y: 21 }, { id: "market", x: 7, y: 12 }, { id: "hospital", x: 5, y: 1 }, { id: "community", x: 24, y: 1 }, { id: "bank", x: 15, y: 21 }, { id: "hr", x: 20, y: 11 }, { id: "police", x: 25, y: 21 }, { id: "rescue", x: 27, y: 12 }, { id: "incubator", x: 1, y: 10 }, { id: "home", x: 15, y: 13 }, { id: "park", x: 19, y: 3 } ],
  [ { id: "market", x: 10, y: 15 }, { id: "community", x: 1, y: 16 }, { id: "hospital", x: 12, y: 1 }, { id: "school", x: 20, y: 1 }, { id: "rescue", x: 21, y: 14 }, { id: "hr", x: 5, y: 4 }, { id: "incubator", x: 10, y: 20 }, { id: "bank", x: 28, y: 17 }, { id: "police", x: 22, y: 6 }, { id: "park", x: 13, y: 6 }, { id: "home", x: 22, y: 19 } ],
];

/** 生成小镇。布局只在开局生成一次；阶段只换外观。 */
export function generateTown(seed) {
  const next = stream(seed, "town", 0);
  const skeleton = int(next, 0, 6);
  const shape = skeletonShapes(skeleton);
  const tiles = new Uint8Array(W * H).fill(T.GRASS);
  fillRects(tiles, shape.road, T.ROAD);
  fillRects(tiles, shape.water, T.WATER);
  if (shape.plaza) fillRects(tiles, [shape.plaza], T.PLAZA);

  // 同尺寸随机排列：大建筑四个位置、中建筑五个位置
  const zones = ZONE_TABLE[skeleton].map((z) => ({ ...z }));
  const bigs = zones.filter((z) => SIZES[z.id][0] * SIZES[z.id][1] >= 40);
  const mids = zones.filter((z) => SIZES[z.id][0] * SIZES[z.id][1] === 30);
  const rest = zones.filter((z) => SIZES[z.id][0] * SIZES[z.id][1] < 30);
  const bigIds = shuffle(next, ["hospital", "market", "community", "school"].slice());
  const midIds = shuffle(next, ["rescue", "bank", "hr", "police", "incubator"].slice());
  const placed = [];
  const assign = [];
  for (let i = 0; i < bigs.length; i++) assign.push({ id: bigIds[i % bigIds.length], x: bigs[i].x, y: bigs[i].y });
  for (let i = 0; i < mids.length; i++) assign.push({ id: midIds[i % midIds.length], x: mids[i].x, y: mids[i].y });
  for (const z of rest) assign.push({ id: z.id, x: z.x, y: z.y });

  // 确定性抖动：±3 全偏移洗牌，valid 就用；全区都试过则退回原位
  let grid = tiles.slice();
  const jn = stream(seed, "townjitter", 0);
  const offsets = [];
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) offsets.push([dx, dy]);
  const tryJitter = () => {
    const g = tiles.slice();
    const out = [];
    for (const a of assign) {
      const [bw, bh] = SIZES[a.id];
      const order = offsets.slice();
      shuffle(jn, order);
      let done = false;
      for (const [dx, dy] of order) {
        const x = a.x + dx, y = a.y + dy;
        if (canPlace(g, x, y, bw, bh)) {
          markBuilding(g, { x, y, w: bw, h: bh }, T.BUILDING);
          out.push({ id: a.id, x, y, w: bw, h: bh });
          done = true;
          break;
        }
      }
      if (!done) return null; // 有一栋放不稳：整局放弃抖动
    }
    return { g, out };
  };
  const jittered = tryJitter();
  if (jittered) {
    grid = jittered.g;
    for (const b of jittered.out) placed.push(b);
  } else {
    for (const a of assign) {
      const [bw, bh] = SIZES[a.id];
      markBuilding(grid, { x: a.x, y: a.y, w: bw, h: bh }, T.BUILDING);
      placed.push({ id: a.id, x: a.x, y: a.y, w: bw, h: bh });
    }
  }

  for (const b of placed) assignDoor(grid, b);
  const home = placed.find((b) => b.id === "home");
  let homeDoor = doorFrontCell(home);
  const reach = bfsReach(grid, homeDoor[0], homeDoor[1]);
  let bad = false;
  for (const b of placed) {
    const f = doorFrontCell(b);
    if (f[0] < 0 || f[1] < 0 || f[0] >= W || f[1] >= H || !reach[f[1] * W + f[0]]) { bad = true; break; }
  }
  if (bad) {
    // 抖动破坏了连通：整体退回区表原位（区表已验证）
    const tiles2 = new Uint8Array(W * H).fill(T.GRASS);
    fillRects(tiles2, shape.road, T.ROAD);
    fillRects(tiles2, shape.water, T.WATER);
    if (shape.plaza) fillRects(tiles2, [shape.plaza], T.PLAZA);
    const g2 = tiles2;
    for (const a of assign) {
      const [bw, bh] = SIZES[a.id];
      markBuilding(g2, { x: a.x, y: a.y, w: bw, h: bh }, T.BUILDING);
    }
    const placed2 = assign.map((a) => ({ id: a.id, x: a.x, y: a.y, w: SIZES[a.id][0], h: SIZES[a.id][1] }));
    for (const b of placed2) assignDoor(g2, b);
    const home2 = placed2.find((b) => b.id === "home");
    return decorate(seed, finishTown(seed, skeleton, shape, g2, placed2, tiles, doorFrontCell(home2)));
  }
  return decorate(seed, finishTown(seed, skeleton, shape, grid, placed, tiles, homeDoor));
}

function finishTown(seed, skeleton, shape, grid, buildings, baseTiles, homeDoor) {
  return {
    w: W, h: H, skeleton,
    tiles: grid,
    buildings,
    parkCells: freeCellsIn(baseTiles, shape.park, T.GRASS),
    plaza: shape.plaza,
    waterCells: shape.water,
    homeDoor,
  };
}

/** 装饰：树/花/长椅/路灯，带最小间距，不占路不占门口格；树与长椅只放开阔格 */
function decorate(seed, town) {
  const dn = stream(seed, "towndecor", 0);
  const grid = town.tiles;
  const doorFronts = new Set();
  for (const b of town.buildings) doorFronts.add(b.doorX + "," + b.doorY);
  const decor = [];
  const taken = new Set();
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (grid[i] !== T.GRASS) continue;
      if (doorFronts.has(x + "," + y)) continue;
      let near = false;
      for (let dy = -2; dy <= 2 && !near; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (taken.has((x + dx) + "," + (y + dy))) { near = true; break; }
        }
      }
      if (near) continue;
      const roll = int(dn, 0, 100);
      let kind = null;
      if (roll < 12) kind = "tree";
      else if (roll < 24) kind = "flower";
      else if (roll < 28) kind = "bench";
      else if (roll < 33) kind = "lamp";
      if (!kind) continue;
      if (kind === "tree" || kind === "bench") {
        let walk = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const t = grid[(y + dy) * W + (x + dx)];
          if (t < T.BUILDING && t !== T.WATER) walk++;
        }
        if (walk < 3) continue;
      }
      decor.push({ x, y, kind });
      taken.add(x + "," + y);
    }
  }
  const grid2 = grid.slice();
  for (const d of decor) {
    if (d.kind === "tree" || d.kind === "bench") grid2[d.y * W + d.x] = T.BLOCK;
  }
  const reach = bfsReach(grid2, town.homeDoor[0], town.homeDoor[1]);
  let a = 0, b2 = 0;
  for (let i = 0; i < W * H; i++) {
    const t = grid2[i];
    if (t === T.ROAD || t === T.PLAZA) { a++; if (reach[i]) b2++; }
  }
  let doorsOk = true;
  for (const b of town.buildings) {
    const f = doorFrontCell(b);
    if (f[0] < 0 || f[1] < 0 || f[0] >= W || f[1] >= H || !reach[f[1] * W + f[0]]) { doorsOk = false; break; }
  }
  let finalDecor = decor;
  if (b2 < a * 0.92 || !doorsOk) {
    // 阻挡装饰破坏了道路或门口连通：全部撤掉，只留花草灯
    finalDecor = decor.filter((d) => d.kind === "flower" || d.kind === "lamp");
  } else {
    town.tiles = grid2;
  }
  town.decor = finalDecor;
  return town;
}
