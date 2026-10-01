/**
 * tempt.js —— 诱惑与查书。接受按条目概率结算后果；拒绝是教学不是惩罚；
 * 查书显示条目标题、证据等级和「说人话」。性格影响识破与心软。
 */
import { stream, weightedIndex } from "./rng.js";
import { TEMPT_PEEK_AP } from "./params.js";
import { tagsMatch } from "./habits.js";

/** 自动识破：已采纳习惯的标签与诱惑标签相交 */
export function autoIdentified(state, tempt, data) {
  for (const id of state.habits) {
    const card = data.cardsById[id];
    if (card && tagsMatch(card.tags, tempt.tags)) return true;
  }
  return false;
}

/** 识破难度：话术识别加成（性格 identify，万分比偏移） */
export function identifyHint(state, tempt, data) {
  const base = autoIdentified(state, tempt, data);
  const mod = state.script && state.script.identify ? state.script.identify : 0;
  return { auto: base, mod };
}

/** 查书（花 1 点；自动识破时不花点数） */
export function doPeek(state, temptId, data) {
  const s = state.strangers.find((x) => x.tpl === temptId && !x.done);
  const tempt = data.temptById[temptId];
  if (!s || !tempt) return { ok: false, reason: "没有这个陌生人" };
  if (s.ident) return { ok: false, reason: "已经看过了" };
  const auto = autoIdentified(state, tempt, data);
  if (!auto) {
    if (state.ap < TEMPT_PEEK_AP) return { ok: false, reason: "行动点不够" };
    state.ap -= 1;
    state.segment = Math.min(5, state.segment + 1);
  }
  s.ident = 2;
  const book = data.cardsById[tempt.book];
  return {
    ok: true,
    events: [
      { t: "peek", id: temptId, book: tempt.book, title: book ? book.title : "", plain: book ? book.plain : "", grade: book ? book.grade : "", auto },
      { t: "ap", ap: state.ap },
    ],
  };
}

/** 接受：按概率结算后果 */
export function doAccept(state, temptId, data) {
  const s = state.strangers.find((x) => x.tpl === temptId && !x.done);
  const tempt = data.temptById[temptId];
  if (!s || !tempt) return { ok: false, reason: "没有这个陌生人" };
  const next = stream(state.seed, "tempt", state.accepts);
  state.accepts += 1;
  let outcome = tempt.accept[0];
  if (tempt.accept.length > 1) {
    const idx = weightedIndex(next, tempt.accept.map((o) => Math.round(o.p * 1000)));
    outcome = tempt.accept[idx];
  }
  s.done = true;
  const events = [{ t: "accept", id: temptId, text: outcome.text }];
  applyTemptDelta(state, outcome.d || {}, events, tempt.name || tempt.id);
  return { ok: true, events };
}

/** 拒绝：坏诱惑教学一句，好诱惑提示错过了什么 */
export function doRefuse(state, temptId, data) {
  const s = state.strangers.find((x) => x.tpl === temptId && !x.done);
  const tempt = data.temptById[temptId];
  if (!s || !tempt) return { ok: false, reason: "没有这个陌生人" };
  s.done = true;
  const events = [];
  if (tempt.kind === "bad") {
    const big = tempt.accept[0];
    events.push({ t: "refuse", id: temptId, kind: "bad", text: `如果你接了……${big.text}` });
  } else {
    events.push({ t: "refuse", id: temptId, kind: "good", text: `你错过了：${tempt.accept[0].text}` });
  }
  return { ok: true, events };
}

function applyTemptDelta(state, d, events, reason) {
  if (d.m) {
    state.bars.money += d.m;
    events.push({ t: "bar", bar: "money", delta: d.m, reason });
  }
  if (d.h) {
    state.bars.health = Math.max(0, Math.min(100, state.bars.health + d.h));
    events.push({ t: "bar", bar: "health", delta: d.h, reason });
  }
  if (d.e) {
    state.bars.energy = Math.max(0, Math.min(100, state.bars.energy + d.e));
    events.push({ t: "bar", bar: "energy", delta: d.e, reason });
  }
  if (d.f) {
    state.bars.freedom = Math.max(0, Math.min(100, state.bars.freedom + d.f));
    events.push({ t: "bar", bar: "freedom", delta: d.f, reason });
  }
}
