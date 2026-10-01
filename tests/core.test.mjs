/**
 * core.test.mjs —— 规则内核单元测试（node:test）。
 * 覆盖：减伤公式与保留系数下限、毅力槽溢出、边际递减、习惯发动削减、
 * 确定性（同种子同命令哈希一致）、重放一致、非法命令状态不变、结局判定。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { retention, dropOverflow, passiveBonus, habitCut, reduceOne, LEVEL_KEY } from "../src/core/habits.js";
import { create, apply, legal, replay, hash, fightPreview } from "../src/core/game.js";
import { quizScore } from "../src/core/quiz.js";
import { checkEnding } from "../src/core/chapter.js";

const mkCard = (over = {}) => ({
  id: "1.1", chapter: 1, title: "测试条目", plain: "测试。",
  cost: { money: 0, time: 1, will: 1 },
  benefit: { level: "大", domain: "h" },
  grade: "A", tags: ["traffic"], building: "hospital",
  ...over,
});

test("保留系数：无习惯为 1，有习惯按 ∏(1-r)，下限 0.30", () => {
  assert.equal(retention([]), 10000);
  const big = mkCard();
  const k1 = retention([big]);
  assert.equal(k1, 10000 - reduceOne(big));
  assert.equal(reduceOne(big), 3500); // 大 × A
  const many = Array.from({ length: 8 }, () => mkCard({ id: "1.1" }));
  assert.equal(retention(many), 3000); // 下限
});

test("保留系数：小收益 C 级减伤最少", () => {
  const small = mkCard({ benefit: { level: "小", domain: "h" }, grade: "C" });
  assert.equal(reduceOne(small), Math.floor((1200 * 6000) / 10000)); // 720
});

test("毅力槽溢出：最重的先掉，同重收益小的先掉", () => {
  const cap = 3;
  const cards = [
    mkCard({ id: "1.1", cost: { money: 0, time: 1, will: 2 }, benefit: { level: "大", domain: "h" } }),
    mkCard({ id: "1.2", cost: { money: 0, time: 1, will: 2 }, benefit: { level: "小", domain: "m" } }),
    mkCard({ id: "1.3", cost: { money: 0, time: 1, will: 2 }, benefit: { level: "中", domain: "e" } }),
  ];
  const { kept, dropped } = dropOverflow(cards, cap);
  // 三张各占 2 格：cap 3 只留一张（第一个无条件保留），其余掉
  assert.equal(kept.length, 1);
  assert.equal(dropped.length, 2);
  assert.equal(kept[0].id, "1.1");
  // 两格上限：留毅力小的
  const light = [mkCard({ id: "2.1", cost: { money: 0, time: 1, will: 2 } }), mkCard({ id: "2.2", cost: { money: 0, time: 1, will: 1 } })];
  const r2 = dropOverflow(light, 1);
  assert.equal(r2.kept.length, 1);
  assert.equal(r2.kept[0].id, "2.2");
});

test("被动加成：S ÷ (S + 上限) 的边际递减", () => {
  const b1 = passiveBonus([mkCard()]);
  assert.equal(b1.health, Math.floor((36 * 15000) / (15000 + 360000))); // cap h=36 → 36×15000/375000
  // 同口径越多，单卡增益越小
  const two = passiveBonus([mkCard(), mkCard({ id: "1.2" })]);
  const s1 = 15000, s2 = 30000;
  const exact1 = (36 * s1) / (s1 + 360000);
  const exact2 = (36 * s2) / (s2 + 360000);
  assert.equal(two.health, Math.floor(exact2));
  assert.ok(exact2 < exact1 * 2, "边际递减：状态翻倍加成不到翻倍");
});

test("习惯发动削减：22 基数已调为参数，收益与证据相乘", () => {
  const big = mkCard();
  const cut = habitCut(big, null);
  assert.ok(cut > 0 && Number.isFinite(cut));
  const small = mkCard({ benefit: { level: "小", domain: "h" }, grade: "C" });
  assert.ok(habitCut(small, null) < cut);
  assert.equal(LEVEL_KEY["大"], "big");
});

test("确定性：同种子同命令序列，哈希一致", () => {
  const run = () => {
    const { state } = create(20240930, {});
    for (let i = 0; i < 60; i++) {
      const opts = legal(state);
      if (!opts.length || state.ended) break;
      const pick = opts[i % opts.length];
      let cmd;
      if (pick.cmd === "talk") cmd = ["talk", pick.building];
      else if (pick.cmd === "learn") cmd = ["learn", pick.id];
      else if (pick.cmd === "drop") cmd = ["drop", pick.id];
      else if (pick.cmd === "peek") cmd = ["peek", pick.id];
      else if (pick.cmd === "accept") cmd = ["accept", pick.id];
      else if (pick.cmd === "refuse") cmd = ["refuse", pick.id];
      else if (pick.cmd === "fight") cmd = ["fight", pick.id, [["retreat"]]];
      else if (pick.cmd === "engage") cmd = ["engage", pick.id];
      else cmd = ["end"];
      const r = apply(state, cmd);
      if (!r.ok) break;
    }
    return hash(state);
  };
  assert.equal(run(), run());
  assert.notEqual(run(), create(1, {}) && hash(create(999, {}).state));
});

test("重放：同种子同日志得到同一状态哈希", () => {
  const seed = 424242;
  const { state } = create(seed, {});
  const log = [];
  for (let i = 0; i < 40 && !state.ended; i++) {
    const opts = legal(state);
    if (!opts.length) break;
    const pick = opts[i % opts.length];
    let cmd;
    if (pick.cmd === "talk") cmd = ["talk", pick.building];
    else if (pick.cmd === "learn") cmd = ["learn", pick.id];
    else if (pick.cmd === "fight") cmd = ["fight", pick.id, [["retreat"]]];
    else if (pick.cmd === "engage") cmd = ["engage", pick.id];
    else if (pick.cmd === "peek") cmd = ["peek", pick.id];
    else if (pick.cmd === "refuse") cmd = ["refuse", pick.id];
    else if (pick.cmd === "accept") cmd = ["accept", pick.id];
    else if (pick.cmd === "drop") cmd = ["drop", pick.id];
    else cmd = ["end"];
    const r = apply(state, cmd);
    if (!r.ok) break;
    log.push(cmd);
  }
  const again = replay(seed, {}, log);
  assert.ok(again.ok);
  assert.equal(hash(again.state), hash(state));
});

test("非法命令：状态不变", () => {
  const { state } = create(7, {});
  const h0 = hash(state);
  const bad = apply(state, ["learn", "9.9"]);
  assert.equal(bad.ok, false);
  assert.ok(bad.reason);
  assert.equal(hash(state), h0);
  const bad2 = apply(state, ["fight", "no-such"]);
  assert.equal(bad2.ok, false);
  assert.equal(hash(state), h0);
});

test("结局判定：健康归零为死亡，死因取最后伤害遭遇", () => {
  const { state } = create(7, {});
  state.bars.health = 0;
  state.lastEncName = "厨房起火";
  assert.equal(checkEnding(state), true);
  assert.equal(state.ended.kind, "death");
  assert.equal(state.ended.deathCause, "厨房起火");
  const { state: s2 } = create(7, {});
  s2.bars.freedom = 0;
  checkEnding(s2);
  assert.equal(s2.ended.kind, "freedom");
  const { state: s3 } = create(7, {});
  s3.bars.money = -101;
  checkEnding(s3);
  assert.equal(s3.ended.kind, "debt");
});

test("急救题判分：按步记分", () => {
  const scene = {
    steps: [
      { options: [{ t: "a", ok: true }, { t: "b", ok: false }] },
      { options: [{ t: "a", ok: false }, { t: "b", ok: true }] },
    ],
  };
  assert.equal(quizScore(scene, [0, 1]), 2);
  assert.equal(quizScore(scene, [1, 1]), 1);
  assert.equal(quizScore(scene, [undefined, undefined]), 0);
});

test("战斗预演：同类战斗预演是确定的", () => {
  const { state } = create(7, {});
  const enc = state.encounters[0];
  const a = fightPreview(state, enc.tpl, []);
  const b = fightPreview(state, enc.tpl, []);
  assert.deepEqual(a.threat, b.threat);
  assert.deepEqual(a.matched, b.matched);
});

test("种子重抽：opts.reroll 改变剧本但不改变种子", () => {
  const a = create(123, {}).state.script;
  const b = create(123, { reroll: 1 }).state.script;
  assert.notDeepEqual(a.origin, b.origin);
  assert.equal(a.seed, b.seed);
});
