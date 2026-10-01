/**
 * town.test.mjs —— 小镇生成器：2000 个种子，门口全部可达、建筑不重叠、
 * 单次生成不超过 30ms、布局唯一率不低于 99%（含门与装饰）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateTown, T } from "../src/town/gen.js";
import { computeSpots, spotFor } from "../src/town/spots.js";
import { findPath } from "../src/town/path.js";

const ESSENTIAL = ["home", "hospital", "market", "community", "school", "rescue", "bank", "hr", "police", "park"];

function walkable(town, x, y) {
  const t = town.tiles[y * town.w + x];
  return t < T.BUILDING && t !== T.WATER;
}

test("小镇生成器：2000 种子全部合格", () => {
  const layouts = new Set();
  let worst = 0;
  for (let seed = 1; seed <= 2000; seed++) {
    const t0 = performance.now();
    const town = generateTown(seed);
    const dt = performance.now() - t0;
    if (dt > worst) worst = dt;
    // 11 栋建筑齐全
    const ids = new Set(town.buildings.map((b) => b.id));
    for (const id of ESSENTIAL) assert.ok(ids.has(id), `seed ${seed} 缺 ${id}`);
    // 两两不重叠
    for (let i = 0; i < town.buildings.length; i++) {
      for (let j = i + 1; j < town.buildings.length; j++) {
        const a = town.buildings[i], b = town.buildings[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        assert.ok(!overlap, `seed ${seed} 建筑 ${a.id}/${b.id} 重叠`);
      }
    }
    // 家门口可达 + 全部门口可达 + 道路 92% 可达
    const seen = bfs(town);
    for (const b of town.buildings) {
      const f = front(b);
      assert.ok(seen[f[1] * town.w + f[0]], `seed ${seed} ${b.id} 门口不可达`);
    }
    let total = 0, reach = 0;
    for (let i = 0; i < town.tiles.length; i++) {
      const t = town.tiles[i];
      if (t === T.ROAD || t === T.PLAZA) { total++; if (seen[i]) reach++; }
    }
    assert.ok(reach >= total * 0.92, `seed ${seed} 道路可达率 ${(reach / total).toFixed(2)}`);
    // 寻路抽查：家到每栋门口都有路
    for (const b of town.buildings) {
      const f = front(b);
      const p = findPath(town.homeDoor[0], town.homeDoor[1], f[0], f[1], (x, y) => walkable(town, x, y));
      assert.ok(p, `seed ${seed} 无路径到 ${b.id}`);
    }
    layouts.add(town.buildings.map((b) => `${b.x}:${b.y}:${b.id}:${b.door}`).join("|") + "#" + town.decor.map((d) => d.x + "," + d.y + d.kind[0]).join("."));
  }
  assert.ok(worst < 30, `单次生成 ${worst.toFixed(1)}ms 超过 30ms`);
  assert.ok(layouts.size >= 2000 * 0.99, `布局唯一率 ${(layouts.size / 2000 * 100).toFixed(1)}% 低于 99%`);
});

function front(b) {
  return [b.frontX, b.frontY];
}

function bfs(town) {
  const { w, h, tiles } = town;
  const seen = new Uint8Array(w * h);
  const [sx, sy] = town.homeDoor;
  seen[sy * w + sx] = 1;
  const q = [[sx, sy]];
  let head = 0;
  while (head < q.length) {
    const [x, y] = q[head++];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const i = ny * w + nx;
      if (seen[i]) continue;
      const t = tiles[i];
      if (t === T.WATER || t >= T.BUILDING) continue;
      seen[i] = 1;
      q.push([nx, ny]);
    }
  }
  return seen;
}

test("候选格与定点：同一 (seed, key) 得到同一格", () => {
  const town = generateTown(42);
  const spots = computeSpots(town);
  assert.ok(spots.length > 50, "候选格过少");
  const a = spotFor(spots, 7, "enc:car-bump");
  const b = spotFor(spots, 7, "enc:car-bump");
  assert.deepEqual(a, b);
  assert.ok(spots.some((s) => s[0] === a[0] && s[1] === a[1]), "定点落在候选格内");
});
