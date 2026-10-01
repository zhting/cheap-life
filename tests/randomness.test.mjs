/**
 * randomness.test.mjs —— 「随机性设计」的五项指标（缩小规模做 CI 版）：
 *   1. 开局剧本多样性：3000 个种子至少 500 种组合，最常见不超过 1%；
 *   2. 遭遇序列差异：任取两种子前 3 章遭遇序列的归一化编辑距离中位数 ≥ 0.6；
 *   3. 单遭遇出现率：任一遭遇在任一章不超过 35%；
 *   4. 整局路径：同一机器人策略 600 局，事件序列完全相同的低于 1%；
 *   5. 小镇布局唯一率在 town.test.mjs 覆盖（≥99%）。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, apply, legal } from "../src/core/game.js";
import { generateTown } from "../src/town/gen.js";

function scriptCombo(seed) {
  const { state } = create(seed, {});
  const sc = state.script;
  return [sc.origin, sc.physique, sc.personality, sc.job].join("/");
}

test("开局剧本：3000 种子 ≥500 种组合，最常见 ≤1%", () => {
  const combos = new Map();
  for (let i = 0; i < 3000; i++) {
    const seed = (i * 2654435761) >>> 0 || 1;
    const c = scriptCombo(seed);
    combos.set(c, (combos.get(c) || 0) + 1);
  }
  assert.ok(combos.size >= 500, `组合数 ${combos.size} < 500`);
  const most = Math.max(...combos.values());
  assert.ok(most <= 30, `最常见组合占 ${(most / 30).toFixed(1)}% 超过 1%`);
});

function encounterSeq(seed, chapters) {
  const { state } = create(seed, {});
  const seq = [];
  for (let ch = 0; ch < chapters; ch++) {
    seq.push(...state.encounters.map((e) => e.tpl).sort());
    const r = apply(state, ["end"]);
    if (!r.ok || state.ended) break;
  }
  return seq.join(",");
}

function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

test("遭遇序列：两两编辑距离中位数 ≥ 0.6", () => {
  const seeds = [11, 23, 37, 51, 66, 82, 97, 113, 129, 141];
  const seqs = seeds.map((s) => encounterSeq(s, 3));
  const dists = [];
  for (let i = 0; i < seqs.length; i++) {
    for (let j = i + 1; j < seqs.length; j++) {
      const maxLen = Math.max(seqs[i].length, seqs[j].length);
      if (maxLen === 0) continue;
      dists.push(editDistance(seqs[i], seqs[j]) / maxLen);
    }
  }
  dists.sort((a, b) => a - b);
  const median = dists[Math.floor(dists.length / 2)];
  assert.ok(median >= 0.6, `编辑距离中位数 ${median.toFixed(2)} < 0.6`);
});

test("单遭遇出现率：任一遭遇在任一章 ≤35%", () => {
  const N = 300;
  const byChapter = new Map(); // chapter -> Map(tpl -> count)
  for (let i = 0; i < N; i++) {
    const seed = (i * 2654435761) >>> 0 || 1;
    const { state } = create(seed, {});
    for (let ch = 1; ch <= 4 && !state.ended; ch++) {
      for (const e of state.encounters) {
        if (!byChapter.has(ch)) byChapter.set(ch, new Map());
        const m = byChapter.get(ch);
        m.set(e.tpl, (m.get(e.tpl) || 0) + 1);
      }
      const r = apply(state, ["end"]);
      if (!r.ok) break;
    }
  }
  let worst = 0;
  for (const [, m] of byChapter) {
    for (const [, n] of m) worst = Math.max(worst, n / N);
  }
  assert.ok(worst <= 0.35, `最常见遭遇章出现率 ${(worst * 100).toFixed(1)}% 超过 35%`);
});

test("整局路径：同一策略 600 局，事件序列相同者 <1%", () => {
  const paths = new Map();
  for (let i = 0; i < 600; i++) {
    const seed = (i * 40503) >>> 0 || 1;
    const { state } = create(seed, {});
    let events = "";
    let guard = 0;
    while (!state.ended && guard++ < 500) {
      const opts = legal(state);
      if (!opts.length) break;
      // 固定策略：优先学牌，其次听建议，最后结算（每局行为一致）
      const learn = opts.find((o) => o.cmd === "learn");
      const talk = opts.find((o) => o.cmd === "talk");
      const fight = opts.find((o) => o.cmd === "fight");
      let cmd;
      if (fight) cmd = ["fight", fight.id, [["retreat"]]];
      else if (learn) cmd = ["learn", learn.id];
      else if (talk && state.ap >= 1) cmd = ["talk", talk.building];
      else cmd = ["end"];
      const r = apply(state, cmd);
      if (!r.ok) { apply(state, ["end"]); continue; }
      events += cmd[0] + ":" + (cmd[1] || "") + ";";
    }
    events += "end:" + state.ended.kind;
    paths.set(events, (paths.get(events) || 0) + 1);
  }
  const most = Math.max(...paths.values());
  assert.ok(most / 600 < 0.01, `相同路径占比 ${(most / 600 * 100).toFixed(1)}% ≥ 1%`);
});

test("小镇生成器：300 种子布局哈希唯一率 ≥99%（快速版，2000 见 town.test.mjs）", () => {
  const layouts = new Set();
  for (let seed = 1; seed <= 300; seed++) {
    const town = generateTown(seed);
    layouts.add(town.buildings.map((b) => `${b.x}:${b.y}:${b.id}:${b.door}`).join("|") + town.decor.map((d) => d.x + "," + d.y + d.kind[0]).join("."));
  }
  assert.ok(layouts.size >= 300 * 0.99, `唯一率 ${(layouts.size / 300 * 100).toFixed(1)}%`);
});
