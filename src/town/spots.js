/**
 * spots.js —— 遭遇与陌生人的候选格。
 * 标记和陌生人的位置从预先算好的候选格里按种子选取，
 * 不依赖玩家此刻站在哪里：内核不需要坐标，命令日志就足够复现整局。
 */
import { T } from "./gen.js";

const W = 36, H = 28;

/**
 * 候选格：可走、不在门口一格、彼此分散。只在开局算一次。
 * 返回按固定顺序排列的候选数组（去重、洗牌后按行距散布）。
 */
export function computeSpots(town) {
  const { tiles, buildings } = town;
  const blocked = new Set();
  for (const b of buildings) {
    for (let y = b.y; y < b.y + b.h; y++) {
      for (let x = b.x; x < b.x + b.w; x++) blocked.add(x + "," + y);
    }
    // 门口与门前一格不放
    blocked.add(b.doorX + "," + b.doorY);
    const f = doorFront(b);
    if (f) blocked.add(f.join(","));
  }
  const spots = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const t = tiles[y * W + x];
      if (t !== T.ROAD && t !== T.PLAZA) continue;
      if (blocked.has(x + "," + y)) continue;
      spots.push([x, y]);
    }
  }
  return spots;
}

function doorFront(b) {
  return [b.frontX, b.frontY];
}

/**
 * 按种子给一个标记挑位置：候选格里取 (hash % n)。
 * 同一 (seed, key) 永远得到同一格。
 */
export function spotFor(spots, seed, key) {
  if (spots.length === 0) return null;
  let h = 2166136261;
  const s = `${seed}:${key}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return spots[h % spots.length];
}
