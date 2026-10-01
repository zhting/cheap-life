/**
 * chapter.js —— 章末结算、衰老、结局判定。
 * 结算顺序：未处理遭遇自动结算 → 收入与支出 → 持续事件 → 被动加成 → 自然衰减
 * → 毅力溢出 → 年岁推进 → 结局判定 → 下一章生成。
 */
import { stream, int } from "./rng.js";
import {
  INCOME_PER_CHAPTER, INCOME_OLD, INCOME_OLD_AGE, INCOME_RAMP, EXPENSE_STEPS,
  HEALTH_DECAY_STEPS, HEALTH_DECAY, ENERGY_RECOVER, NEGATIVE_MONEY_FREEDOM_HIT,
  DEBT_COLLAPSE, AP_PER_CHAPTER, TIRED_AP, CHAPTERS, YEARS_PER_CHAPTER,
  SCORE_AGE_MULT, SCORE_BARS_MULT, SCORE_MONEY_CAP, SCORE_MONEY_DIV,
  CHAIN_WAGE_LOSS, DOMAIN_BAR,
} from "./params.js";
import { passiveBonus, matchedHabitCards, retention, dropOverflow } from "./habits.js";
import { startChapter } from "./draw.js";
import { findTemplate } from "./fight.js";

function damageBar(state, bar, amount, reason, events) {
  if (amount <= 0) return;
  // intent 的 bar 是口径代码（h/m/e/f），状态条是全名
  const name = DOMAIN_BAR[bar] || bar;
  if (name === "money") state.bars.money -= amount;
  else state.bars[name] = Math.max(0, state.bars[name] - amount);
  events.push({ t: "bar", bar: name, delta: -amount, reason });
  if (name !== "money") state.lastEncName = reason;
}

function healthDecayFor(age) {
  for (let i = 0; i < HEALTH_DECAY_STEPS.length; i++) {
    if (age < HEALTH_DECAY_STEPS[i]) return HEALTH_DECAY[i];
  }
  return HEALTH_DECAY[HEALTH_DECAY.length - 1];
}

function expenseFor(age) {
  let sum = 0;
  for (const step of EXPENSE_STEPS) if (age >= step.from) sum += step.add;
  return sum;
}

function applyBarDelta(state, d, events, reason) {
  if (d.m) {
    state.bars.money += d.m;
    events.push({ t: "bar", bar: "money", delta: d.m, reason });
  }
  for (const key of ["h", "e", "f"]) {
    const v = d[key];
    if (v) {
      const bar = DOMAIN_BAR[key];
      state.bars[bar] = Math.max(0, Math.min(100, state.bars[bar] + v));
      events.push({ t: "bar", bar, delta: v, reason });
    }
  }
}

/** 结局判定与分数 */
export function checkEnding(state) {
  if (state.ended) return true;
  const b = state.bars;
  let kind = null;
  if (b.health <= 0) kind = "death";
  else if (b.freedom <= 0) kind = "freedom";
  else if (b.money <= DEBT_COLLAPSE) kind = "debt";
  else if (state.chapter > CHAPTERS) kind = "alive";
  if (!kind) return false;
  const endAge = kind === "alive" ? START_END_AGE : state.age;
  let score = endAge * SCORE_AGE_MULT;
  if (kind === "alive") {
    score += (b.health + b.freedom + b.energy) * SCORE_BARS_MULT + Math.floor(Math.min(b.money, SCORE_MONEY_CAP) / SCORE_MONEY_DIV);
  }
  const cause = kind === "death" ? (state.lastEncName || "衰老") : "";
  state.ended = { kind, age: endAge, score, deathCause: cause };
  state.deathCause = cause;
  return true;
}

const START_END_AGE = 18 + CHAPTERS * YEARS_PER_CHAPTER;

/** 章末结算（end 命令） */
export function applyEnd(state, data, content) {
  const events = [];
  const age = state.age;
  const next = stream(state.seed, "settle", state.chapter);

  // 1. 未处理的遭遇自动结算：被动减伤照常生效，急救题按未作答计
  const habitCards = state.habits.map((id) => data.cardsById[id]);
  for (const enc of state.encounters) {
    if (enc.state !== 0) continue;
    const tpl = findTemplate(state, enc.tpl, data, content);
    if (!tpl) continue;
    if (tpl.kind === "chance") {
      enc.state = 2;
      events.push({ t: "encState", id: enc.tpl, state: 2 });
      continue;
    }
    const matched = matchedHabitCards(habitCards, tpl.tags);
    const k = retention(matched);
    let mult = 10000;
    if (tpl.kind === "rescue") mult = 13000; // 未作答
    for (const it of tpl.intent) {
      const variance = int(next, 8500, 11501);
      let dmg = Math.floor((it.dmg * k * variance * mult) / (10000 * 10000 * 10000));
      if (dmg < 1) dmg = 1;
      damageBar(state, it.bar, dmg, tpl.name, events);
    }
    // 睡眠类未解决 → 心血管遭遇窗口
    if (tpl.tags.indexOf("sleep") >= 0) state.flags.cardioUntil = state.chapter + 2;
    enc.state = 2;
    events.push({ t: "encState", id: enc.tpl, state: 2 });
    if (checkEnding(state)) return events.concat([{ t: "ending", ...state.ended }]);
  }

  // 2. 章末收入与支出
  const incomeBase = age >= INCOME_OLD_AGE ? INCOME_OLD : INCOME_PER_CHAPTER;
  const vol = state.script.volatility || 1000;
  const volNow = 10000 + int(next, -vol, vol + 1);
  const ramp = INCOME_RAMP[Math.min(state.chapter, INCOME_RAMP.length) - 1] || 10000;
  // incomeK 是小数系数；volNow 与 ramp 是万分比
  const income = Math.max(0, Math.floor((incomeBase * state.script.incomeK * volNow * ramp) / 100000000));
  const expense = expenseFor(age);
  state.bars.money += income - expense;
  events.push({ t: "bar", bar: "money", delta: income, reason: "收入" });
  if (expense > 0) events.push({ t: "bar", bar: "money", delta: -expense, reason: "生活与医疗开支" });

  // 3. 持续事件（婚姻、房贷、带娃……）
  for (const name of Object.keys(state.flags)) {
    const v = state.flags[name];
    if (typeof v !== "number" || v <= 0 || v >= 90) continue;
    const ev = content.events.find((e) => e.flag && e.flag.name === name);
    if (ev && ev.flag.per) applyBarDelta(state, ev.flag.per, events, ev.name);
    state.flags[name] = v - 1;
  }

  // 4. 被动加成与自然衰减
  const bonus = passiveBonus(habitCards);
  for (const bar of ["health", "money", "energy", "freedom"]) {
    if (bonus[bar] > 0) {
      if (bar === "money") state.bars.money += bonus[bar];
      else state.bars[bar] = Math.min(100, state.bars[bar] + bonus[bar]);
      events.push({ t: "bar", bar, delta: bonus[bar], reason: "习惯的复利" });
    }
  }
  const decay = Math.floor(healthDecayFor(age) / 10);
  state.bars.health = Math.max(0, state.bars.health - decay);
  events.push({ t: "bar", bar: "health", delta: -decay, reason: "衰老" });
  state.bars.energy = Math.min(100, state.bars.energy + ENERGY_RECOVER);
  state.bars.freedom = Math.min(100, state.bars.freedom + 0);
  if (state.bars.money < 0) {
    state.bars.freedom = Math.max(0, state.bars.freedom - NEGATIVE_MONEY_FREEDOM_HIT);
    events.push({ t: "bar", bar: "freedom", delta: -NEGATIVE_MONEY_FREEDOM_HIT, reason: "负债缠身" });
  }

  // 5. 欠薪时效
  if (state.flags["wage-due"] && state.chapter >= state.flags["wage-due"]) {
    state.flags["wage-due"] = 0;
    state.bars.freedom = Math.max(0, state.bars.freedom - CHAIN_WAGE_LOSS);
    events.push({ t: "bar", bar: "freedom", delta: -CHAIN_WAGE_LOSS, reason: "超过维权时效" });
  }

  // 6. 毅力槽溢出：最重的习惯先前掉
  const cap = 3 + Math.floor(state.bars.energy / 20) + (state.script.willMod || 0);
  const { kept, dropped } = dropOverflow(habitCards, cap);
  if (dropped.length > 0) {
    state.habits = kept.map((c) => c.id);
    for (const c of dropped) events.push({ t: "habit", id: c.id, op: "broken", reason: "毅力槽不够了" });
  }

  // 7. 年岁推进
  state.age += YEARS_PER_CHAPTER;
  state.chapter += 1;
  state.segment = 0;

  // 8. 结局判定
  if (checkEnding(state)) {
    events.push({ t: "ending", kind: state.ended.kind, age: state.ended.age, score: state.ended.score, deathCause: state.ended.deathCause });
    return events;
  }

  // 9. 下一章
  state.ap = state.bars.energy <= 0 ? TIRED_AP : AP_PER_CHAPTER;
  events.push({ t: "chapter", chapter: state.chapter, age: state.age, ap: state.ap });
  const spawnEvents = startChapter(state, data, content);
  applyChapterContent(state, data, content, spawnEvents);
  return events.concat(spawnEvents);
}

/** 章初内容落地：人生事件与小镇事件的数值效果 */
export function applyChapterContent(state, data, content, events) {
  if (state.lifeEvent) {
    const ev = content.events.find((e) => e.id === state.lifeEvent);
    if (ev) {
      applyBarDelta(state, ev.d || {}, events, ev.name);
      if (ev.flag) {
        state.flags[ev.flag.name] = ev.flag.chapters;
      }
    }
  }
  if (state.townEvent) {
    const te = content.townEvents.events.find((e) => e.id === state.townEvent);
    if (te) applyBarDelta(state, te.d || {}, events, "小镇：" + te.text);
  }
}
