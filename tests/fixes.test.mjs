/**
 * fixes.test.mjs —— 2026-10 审查第 1-8 条（内核部分）的回归测试：
 *   1. 急救题（kind rescue）进遭遇牌库；
 *   2. 机遇事件按 12%（千分比）出现，保底可触发；
 *   3. 采纳习惯按 cost.time 扣行动点；
 *   4. fight 命令原子：中途非法时整体作废，状态不变；
 *   5. fightPreview 不消耗洗牌袋，数值来自内核公式；
 *   7. 链式标志不被章末通用倒计时误减（debt-call / unemploy-next 一次性消费，
 *      wage-due / cardioUntil 窗口不被递减，chronic 进医院建议牌权重）；
 *   8. 死于自然衰老时死因为「衰老」。
 * 第 6、9 条（地图标记对应遭遇、纯键盘操作）在 UI 层，由 e2e 覆盖。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { create, apply, legal, hash, fightPreview } from "../src/core/game.js";
import { findTemplate } from "../src/core/fight.js";
import { quizThreat } from "../src/core/quiz.js";
import { drawOffers } from "../src/core/draw.js";
import { habitCut } from "../src/core/habits.js";
import { PAY_CUT } from "../src/core/params.js";
import { data, content } from "../src/core/game.js";

/** 收集一局前 n 章的全部遭遇 id */
function collectEncounters(seed, chapters) {
  const { state } = create(seed, {});
  const seen = [];
  for (let c = 0; c < chapters && !state.ended; c++) {
    for (const e of state.encounters) seen.push(e.tpl);
    apply(state, ["end"]);
  }
  return seen;
}

test("#1 急救题进牌库：多章节种子扫描必然出现 q- 遭遇，且模板可解析", () => {
  let rescueChapters = 0;
  for (let i = 0; i < 60; i++) {
    const seed = (i * 2654435761) >>> 0 || 1;
    const seen = collectEncounters(seed, 13);
    if (seen.some((id) => id.startsWith("q-"))) rescueChapters++;
  }
  assert.ok(rescueChapters >= 20, `60 局里只有 ${rescueChapters} 局出现急救遭遇`);
  // 每道题都能由 findTemplate 解析成战斗模板（含 quiz 字段与救援 intent）
  for (const q of content.quizzes) {
    const tpl = findTemplate({ habits: [] }, "q-" + q.id, data, content);
    assert.ok(tpl, `q-${q.id} 无法解析`);
    assert.equal(tpl.kind, "rescue");
    assert.ok(tpl.quiz === q.id);
  }
});

test("#2 机遇事件：12% 概率 + 保底，多章节扫描必然出现", () => {
  let chanceCount = 0;
  for (let i = 0; i < 60; i++) {
    const seed = (i * 40503) >>> 0 || 1;
    const seen = collectEncounters(seed, 13);
    for (const id of seen) {
      const tpl = content.encounters.find((t) => t.id === id);
      if (tpl && tpl.kind === "chance") chanceCount++;
    }
  }
  assert.ok(chanceCount >= 30, `60 局 × 13 章只出现 ${chanceCount} 次机遇事件`);
});

test("#3 采纳时间成本 2/3 的习惯扣 2/3 个行动点", () => {
  for (const wantTime of [2, 3]) {
    const card = data.cards.find((c) => c.cost.time === wantTime);
    assert.ok(card, `找不到 time=${wantTime} 的卡`);
    const { state } = create(42, {});
    state.offers = [card.id];
    state.bars.money = Math.max(state.bars.money, card.cost.money) + 100;
    const ap0 = state.ap;
    const r = apply(state, ["learn", card.id]);
    assert.equal(r.ok, true, r.reason);
    assert.equal(state.ap, ap0 - wantTime, `time=${wantTime} 应扣 ${wantTime} 点`);
  }
});

test("#4 fight 原子性：第 2 回合非法时，第 1 回合的钱与血不落账", () => {
  // 找一个第 1 章就能遇到、且「花钱求助」要花钱的遭遇
  let found = null;
  for (let seed = 1; seed <= 200 && !found; seed++) {
    const { state } = create(seed, {});
    for (const e of state.encounters) {
      const tpl = findTemplate(state, e.tpl, data, content);
      if (tpl && !tpl.quiz && tpl.help && tpl.help.cost > 0) {
        found = { seed, encId: e.tpl, tpl };
        break;
      }
    }
  }
  assert.ok(found, "200 个种子里没找到可花钱求助的遭遇");
  const { state } = create(found.seed, {});
  const h0 = hash(state);
  const money0 = state.bars.money;
  const r = apply(state, ["fight", found.encId, [["pay"], ["habit", "no-such-card"]]]);
  assert.equal(r.ok, false);
  assert.ok(r.reason);
  assert.equal(state.bars.money, money0, "第 1 回合的求助费被回滚");
  assert.equal(hash(state), h0, "状态哈希被改动");
  // 正例：合法动作列表照常生效
  const ok = apply(state, ["fight", found.encId, [["pay"], ["pay"]]]);
  assert.equal(ok.ok, true, ok.reason);
});

test("#5 fightPreview 纯净：不消耗洗牌袋，削减与求助数值来自内核", () => {
  // 找一场急救战斗（quizScene 走洗牌袋路径）
  let quizEnc = null;
  for (let seed = 1; seed <= 300 && !quizEnc; seed++) {
    const { state } = create(seed, {});
    const e = state.encounters.find((x) => x.tpl.startsWith("q-"));
    if (e) quizEnc = { seed, encId: e.tpl };
  }
  assert.ok(quizEnc, "300 个种子里没抽到急救遭遇");
  const { state } = create(quizEnc.seed, {});
  const h0 = hash(state);
  const a = fightPreview(state, quizEnc.encId, []);
  const b = fightPreview(state, quizEnc.encId, []);
  assert.ok(a && a.scene, "急救预演应带场景");
  assert.deepEqual(a.scene, b.scene, "两次预演场景不一致");
  assert.equal(hash(state), h0, "预演改动了状态（洗牌袋被消耗）");
  // 普通战斗：削减值与内核 habitCut 一致，求助削减 = PAY_CUT
  const { state: s2 } = create(quizEnc.seed, {});
  const encId2 = s2.encounters.find((x) => !x.tpl.startsWith("q-")).tpl;
  const p2 = fightPreview(s2, encId2, []);
  for (const id of p2.matched) {
    assert.equal(p2.cuts[id], habitCut(data.cardsById[id], s2.script));
  }
  assert.equal(p2.payCut, PAY_CUT);
});

test("#7a debt-call / unemploy-next：章初一次性消费，催债电话强制出现", () => {
  const { state } = create(7, {});
  state.flags["debt-call"] = 1;
  state.flags["unemploy-next"] = 2;
  const r = apply(state, ["end"]);
  assert.equal(r.ok, true);
  assert.ok(state.encounters.some((e) => e.tpl === "debt-call"), "负债标志未强制催债电话");
  assert.equal(state.flags["debt-call"], 0, "debt-call 未被消费");
  assert.equal(state.flags["unemploy-next"], 0, "unemploy-next 未被消费");
});

test("#7b wage-due / cardioUntil / freeLearn：窗口标志不被章末倒计时误减", () => {
  const { state } = create(11, {});
  const deadline = state.chapter + 2;
  state.flags["wage-due"] = deadline;
  state.flags.cardioUntil = state.chapter + 2;
  state.flags.freeLearn = 1;
  apply(state, ["end"]);
  assert.equal(state.flags["wage-due"], deadline, "欠薪时效被提前");
  assert.equal(state.flags.cardioUntil, state.chapter + 1, "心血管窗口被缩短");
  assert.equal(state.flags.freeLearn, 0, "免费名额应当章过期");
  // 期限一到：失去追索
  const { state: s2 } = create(11, {});
  s2.flags["wage-due"] = s2.chapter; // 期限就是本章末
  const f0 = s2.bars.freedom;
  apply(s2, ["end"]);
  assert.equal(s2.flags["wage-due"], 0);
  assert.equal(s2.bars.freedom, Math.max(0, f0 - 8), "超时未扣自由");
});

test("#7c chronic 标志进入医院建议牌权重", () => {
  const drawOnce = (withChronic, talk) => {
    const { state } = create(99, {});
    if (withChronic) state.flags.chronic = 99;
    state.talks = talk;
    return drawOffers(state, "hospital", data, content);
  };
  const count16 = (offers) => offers.filter((id) => data.cardsById[id].chapter === 16).length;
  let withSum = 0;
  let withoutSum = 0;
  for (let i = 0; i < 300; i++) {
    withSum += count16(drawOnce(true, i));
    withoutSum += count16(drawOnce(false, i));
  }
  assert.ok(withSum > withoutSum, `有慢病标志(${withSum}) 应比没有(${withoutSum}) 更多发放第 16 章`);
});

test("#8 死于自然衰老时死因为「衰老」，不再挂到旧遭遇", () => {
  const { state } = create(7, {});
  state.encounters = [];
  state.strangers = [];
  state.bars.health = 1; // 章末自然衰减(≥2)必致死
  state.lastEncName = "网贷缠身";
  const r = apply(state, ["end"]);
  assert.equal(r.ok, true);
  assert.equal(state.ended.kind, "death");
  assert.equal(state.deathCause, "衰老");
  // 对照：遭遇伤害致死仍报遭遇名（章末无自然衰减兜底）
  const { state: s2 } = create(7, {});
  s2.encounters = [];
  s2.strangers = [];
  s2.bars.health = 0;
  s2.lastEncName = "燃气泄漏";
  apply(s2, ["end"]);
  assert.equal(s2.deathCause, "燃气泄漏");
});

test("急救判分曲线：全对清零、部分减半、全错保留（内核与面板共用）", () => {
  assert.deepEqual(quizThreat(65, 2, 2), { threat: 0, allWrong: false });
  assert.deepEqual(quizThreat(65, 1, 2), { threat: 33, allWrong: false });
  assert.deepEqual(quizThreat(65, 0, 2), { threat: 65, allWrong: true });
});

test("legal：时间成本 2 的卡要求 2 个行动点", () => {
  const card = data.cards.find((c) => c.cost.time === 2);
  const { state } = create(42, {});
  state.offers = [card.id];
  state.bars.money = 999;
  state.ap = 1;
  const opts = legal(state);
  assert.ok(!opts.some((o) => o.cmd === "learn" && o.id === card.id), "1 点不该能学 time=2 的卡");
  state.ap = 2;
  const opts2 = legal(state);
  assert.ok(opts2.some((o) => o.cmd === "learn" && o.id === card.id), "2 点应该能学");
});
