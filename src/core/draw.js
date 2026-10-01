/**
 * draw.js —— 建议牌、遭遇牌库、连锁权重、洗牌袋。
 * 权重 w = w0 × f_age × f_script × f_state × f_chain × 衰减^n，
 * 累计权重加一次随机数抽取；全程整数与精确 double，不用对数、幂与三角函数。
 */
import { stream, int, permille, weightedIndex, shuffle } from "./rng.js";
import { stageOf, CHAPTER_STAGE_W, ENCOUNTERS_PER_CHAPTER, ENCOUNTERS_PER_CHAPTER_OLD, ENCOUNTERS_OLD_AGE, RARE_CHANCE, CHANCE_CHANCE, CHANCE_PITY_MULT, SAME_ENCOUNTER_MAX, LETHAL_GUARD_CHAPTERS, LETHAL_GUARD_RATIO, CHAIN_CARDIO_MULT, TOWN_EVENT_CHANCE, SEGMENTS } from "./params.js";

/** 剧本修正 → 相关标签（遭遇权重按标签匹配剧本） */
const SCRIPT_TAG_MODS = {
  scamW: ["scam"],
  medicalW: ["insurance", "cancer-screen"],
  chronicW: ["heart", "hypertension", "diabetes", "cancer-screen"],
  overworkW: ["stress", "sleep"],
  cardioW: ["heart", "hypertension"],
  diaW: ["diabetes"],
  injuryW: ["injury"],
  startupW: ["startup"],
  techW: ["tech-law"],
  redlineW: ["redline"],
};

function scriptFactor(script, tags) {
  let f = 1000;
  if (!script || !script.cards) return f;
  const mods = { ...script.cards.origin.mods, ...script.cards.physique.mods, ...script.cards.personality.mods, ...script.cards.job.mods };
  for (const key of Object.keys(SCRIPT_TAG_MODS)) {
    if (!mods[key]) continue;
    for (const t of SCRIPT_TAG_MODS[key]) {
      if (tags.indexOf(t) >= 0) f = Math.max(f, mods[key]);
    }
  }
  return f;
}

function stateFactor(bars, tags) {
  let f = 1000;
  if (bars.health < 50 && (tags.indexOf("heart") >= 0 || tags.indexOf("hypertension") >= 0 || tags.indexOf("diabetes") >= 0 || tags.indexOf("cancer-screen") >= 0)) f = 1300;
  if (bars.money < 0 && (tags.indexOf("debt") >= 0 || tags.indexOf("invest") >= 0 || tags.indexOf("scam") >= 0)) f = 1300;
  return f;
}

function chainFactor(state, tpl) {
  let f = 1000;
  if (state.flags.cardioUntil >= state.chapter && (tpl.tags.indexOf("heart") >= 0 || tpl.tags.indexOf("hypertension") >= 0)) f = Math.max(f, CHAIN_CARDIO_MULT);
  if (state.flags["debt-call"] && tpl.id === "debt-call") f = 3000;
  if (state.flags["unemploy-next"] && tpl.id === "job-loss") f = 2000;
  return f;
}

function inAges(tpl, age) {
  return age >= tpl.ages[0] && age <= tpl.ages[1];
}

/**
 * 章初生成：遭遇 2-3 个、陌生人 2 个、人生事件、小镇事件。
 * 只改 state 的生成相关字段并返回事件列表；由 create / apply(end) 调用。
 */
export function startChapter(state, data, content) {
  const events = [];
  const age = state.age;
  const chapter = state.chapter;

  // —— 遭遇牌库 ——
  const next = stream(state.seed, "encdeck", chapter);
  const normal = content.encounters.filter(
    (t) => t.kind === "prevent" && !t.rare && inAges(t, age) && (state.encCounts[t.id] || 0) < SAME_ENCOUNTER_MAX
  );
  const lethalCut = chapter <= LETHAL_GUARD_CHAPTERS
    ? Math.floor((state.bars.health * LETHAL_GUARD_RATIO) / 10000)
    : 9999;
  const pool = normal.filter((t) => t.intent.every((it) => it.dmg <= lethalCut));
  const count = age >= ENCOUNTERS_OLD_AGE ? ENCOUNTERS_PER_CHAPTER_OLD : ENCOUNTERS_PER_CHAPTER;
  const picked = [];
  const weightsOf = (t) => {
    let w = t.weight;
    w = Math.floor((w * scriptFactor(state.script, t.tags)) / 1000);
    w = Math.floor((w * stateFactor(state.bars, t.tags)) / 1000);
    w = Math.floor((w * chainFactor(state, t)) / 1000);
    const n = state.encCounts[t.id] || 0;
    const decay = [1000, 500, 250][Math.min(n, 2)];
    w = Math.floor((w * decay) / 1000);
    return Math.max(w, 1);
  };
  const avail = pool.slice();
  // 链式强制：负债 → 本章必有催债电话
  if (state.flags["debt-call"]) {
    const forced = avail.find((t) => t.id === "debt-call");
    if (forced) {
      picked.push(forced);
      avail.splice(avail.indexOf(forced), 1);
    }
  }
  while (picked.length < count && avail.length > 0) {
    const idx = weightedIndex(next, avail.map(weightsOf));
    picked.push(avail.splice(idx, 1)[0]);
  }
  // 稀有事件：8% 概率替换一个普通遭遇
  if (permille(next, RARE_CHANCE / 10)) {
    const rares = content.encounters.filter((t) => t.kind === "prevent" && t.rare && inAges(t, age));
    if (rares.length > 0) {
      const r = rares[int(next, 0, rares.length)];
      if (picked.length > 0) picked[picked.length - 1] = r;
      else picked.push(r);
    }
  }
  // 机遇事件：12%，连续两章没出现则 ×3
  const chancePity = state.flags.chancePity ? CHANCE_PITY_MULT : 1;
  const chanceBase = Math.floor((CHANCE_CHANCE * chancePity) / 1000);
  if (permille(next, chanceBase)) {
    const chances = content.encounters.filter((t) => t.kind === "chance" && inAges(t, age));
    if (chances.length > 0) {
      const c = chances[int(next, 0, chances.length)];
      const chanceList = picked.filter((t) => t.kind === "chance");
      if (chanceList.length === 0) picked.push(c);
    }
    state.flags.chancePity = 0;
  } else {
    state.flags.chancePity = (state.flags.chancePity || 0) + 1;
  }

  state.encounters = picked.map((t) => ({
    tpl: t.id,
    seg: int(next, 0, SEGMENTS),
    state: 0,
  }));
  for (const e of state.encounters) {
    events.push({ t: "spawn", kind: "encounter", id: e.tpl, seg: e.seg });
  }

  // —— 陌生人（诱惑洗牌袋） ——
  const strPool = content.temptations;
  const bag = takeFromBag(state, "stranger", 2, strPool.length, next);
  state.strangers = bag.map((idx) => ({
    tpl: strPool[idx].id,
    seg: int(next, 0, SEGMENTS),
    done: false,
  }));
  for (const s of state.strangers) {
    events.push({ t: "spawn", kind: "stranger", id: s.tpl, seg: s.seg });
  }

  // —— 人生事件 ——
  state.lifeEvent = null;
  const ageNext = state.age;
  const eligible = content.events.filter((ev) => {
    if (ageNext < ev.ages[0] || ageNext > ev.ages[1]) return false;
    if (state.eventsUsed.indexOf(ev.id) >= 0) return false;
    if (ev.flag && ev.flag.need && !(state.flags[ev.flag.name] > 0)) return false;
    return true;
  });
  if (eligible.length > 0) {
    const w = eligible.map((ev) => {
      let weight = ev.w;
      if (ev.script && state.script) {
        for (const key of Object.keys(ev.script)) {
          if (key === state.script.job || key === state.script.origin) weight = Math.floor((weight * ev.script[key]) / 1000);
        }
      }
      return Math.max(weight, 1);
    });
    const ev = eligible[weightedIndex(next, w)];
    state.lifeEvent = ev.id;
    state.eventsUsed.push(ev.id);
    events.push({ t: "life", id: ev.id });
  }

  // —— 小镇事件 ——
  state.townEvent = null;
  if (permille(next, TOWN_EVENT_CHANCE / 10)) {
    const bag2 = takeFromBag(state, "town", 1, content.townEvents.events.length, next);
    const te = content.townEvents.events[bag2[0]];
    state.townEvent = te.id;
    events.push({ t: "town", id: te.id });
  }
  return events;
}

/** 洗牌袋：从袋里取 k 个下标，不够就重灌（重灌用 bagSeq 派生流，保证可复现） */
export function takeFromBag(state, key, k, size, _next) {
  let bag = state.bags[key];
  if (!bag || bag.length < k) {
    const refill = [];
    for (let i = 0; i < size; i++) refill.push(i);
    const bn = stream(state.seed, "bag", state.bagSeq++);
    shuffle(bn, refill);
    bag = (bag || []).concat(refill);
  }
  const out = bag.slice(-k);
  state.bags[key] = bag.slice(0, bag.length - k);
  return out;
}

/** 建筑卡池（不含已采纳的） */
export function buildingPool(cards, buildingId, habitIds) {
  return cards.filter((c) => c.building === buildingId && habitIds.indexOf(c.id) < 0);
}

/** 听建议：从建筑卡池按权重抽 3 条。权重 = 阶段 × 剧本 × 已有习惯协同 × 功课优先 */
export function drawOffers(state, buildingId, data, content) {
  const next = stream(state.seed, "talk", state.talks);
  const stage = stageOf(state.age);
  const chapters = content.buildings.buildings.find((b) => b.id === buildingId).chapters;
  const pool = data.cards.filter(
    (c) => buildingId === "home" ? false : c.building === buildingId && state.habits.indexOf(c.id) < 0
  );
  const lesson = state.lesson || [];
  const habitTags = [];
  for (const id of state.habits) {
    for (const t of data.cardsById[id].tags) habitTags.push(t);
  }
  const weights = pool.map((c) => {
    let w = 1000;
    w = Math.floor((w * (CHAPTER_STAGE_W[c.chapter] ? CHAPTER_STAGE_W[c.chapter][stageIndexOf(stage)] : 1000)) / 1000);
    // 同建筑内，与本章 NPC 主题（章节重叠）更贴的优先
    if (chapters.indexOf(c.chapter) >= 0) w = Math.floor((w * 1200) / 1000);
    // 已有习惯的协同标签
    for (const t of c.tags) {
      if (habitTags.indexOf(t) >= 0) {
        w = Math.floor((w * 1300) / 1000);
        break;
      }
    }
    if (lesson.indexOf(c.id) >= 0) w = Math.floor((w * 2000) / 1000);
    return Math.max(w, 1);
  });
  const picked = [];
  const availIdx = pool.map((_, i) => i);
  while (picked.length < 3 && availIdx.length > 0) {
    const idx = weightedIndex(next, availIdx.map((i) => weights[i]));
    picked.push(pool[availIdx[idx]]);
    availIdx.splice(idx, 1);
  }
  return picked.map((c) => c.id);
}

const STAGE_INDEX = { young: 0, mid: 1, senior: 2, old: 3 };
function stageIndexOf(stage) {
  return STAGE_INDEX[stage] || 0;
}

/**
 * 「书里 x.y 条本可以帮你」：从遭遇匹配的卡里挑 收益最大、成本最低、还没采纳 的最多 5 条。
 * 同时作为战斗胜利后的功课（lesson），下一章优先发放。
 */
export function suggestCards(encTags, habitIds, data) {
  const rank = { 大: 3, 中: 2, 小: 1 };
  const matched = data.cards.filter(
    (c) => habitIds.indexOf(c.id) < 0 && c.tags.some((t) => encTags.indexOf(t) >= 0)
  );
  matched.sort((a, b) => {
    const ra = rank[a.benefit.level];
    const rb = rank[b.benefit.level];
    if (ra !== rb) return rb - ra;
    const ca = a.cost.money + a.cost.time;
    const cb = b.cost.money + b.cost.time;
    if (ca !== cb) return ca - cb;
    const ga = { A: 3, B: 2, C: 1 }[a.grade];
    const gb = { A: 3, B: 2, C: 1 }[b.grade];
    if (ga !== gb) return gb - ga;
    return a.id < b.id ? -1 : 1;
  });
  return matched.slice(0, 5).map((c) => c.id);
}
