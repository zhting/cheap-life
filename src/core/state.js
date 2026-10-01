/**
 * state.js —— 状态结构与只读视图。
 * 状态只通过 create / apply 改变；世界层与界面层拿到的是只读视图。
 * 状态必须可 JSON 序列化（hash 与存档都依赖这一点），不含函数、Map、坐标。
 */
import { START_HEALTH, START_ENERGY, START_FREEDOM, AP_PER_CHAPTER, START_AGE, WILL_BASE, WILL_PER_ENERGY, RULES_VERSION } from "./params.js";

/** 开局一个空状态（剧本在 create 时抽好） */
export function baseState(seed, opts) {
  return {
    v: RULES_VERSION,
    seed: seed >>> 0,
    opts: {
      reroll: (opts && opts.reroll) || 0,
      filterSensitive: !!(opts && opts.filterSensitive),
    },
    chapter: 0, // 0 = 剧本待确认，1..13 进行中
    age: START_AGE,
    segment: 0,
    bars: { health: START_HEALTH, money: 0, energy: START_ENERGY, freedom: START_FREEDOM },
    ap: AP_PER_CHAPTER,
    script: null, // { origin, physique, personality, job }
    rerolled: 0,
    habits: [], // 已采纳条目 id
    offers: [], // 最近一次听建议抽到的条目 id
    offersBuilding: "",
    encounters: [], // 本章遭遇 { tpl, seg, state: 0未处理 1已解决 2已结算/撤退 }
    strangers: [], // 本章陌生人/诱惑 { tpl, seg, done: false }
    lifeEvent: null, // 本章人生事件 id
    townEvent: null, // 本章小镇事件 id
    flags: {}, // 链式标志：cardioUntil / debtCall / unemployNext / chronic / wageDue
    encCounts: {}, // 模板 id → 本局已发生次数
    bags: {}, // 洗牌袋：key → 剩余下标数组
    fight: null, // 进行中的战斗展示态（由 beginFight 派生，不进存档日志）
    fights: 0, // 已打过的战斗数（用于派生战斗流序号）
    talks: 0, // 已听建议次数
    accepts: 0, // 已接受的诱惑数（用于派生结算流序号）
    bagSeq: 0, // 洗牌袋重灌序号
    eventsUsed: [], // 已发生过的人生事件 id（每个一局最多一次）
    lesson: [], // 最近一场胜利的功课条目 id（下一章建议优先发放）
    lastEncName: "", // 最后一次造成伤害的遭遇名（死因）
    ended: null, // { kind: alive|death|freedom|debt, score, deathCause, ... }
    deathCause: "",
  };
}

/** 毅力槽占用 */
export function usedWill(habits, cardsById) {
  let used = 0;
  for (const id of habits) used += cardsById[id].cost.will;
  return used;
}

/** 毅力槽上限（精力驱动，性格 ±1 在剧本里体现为 willMod） */
export function willCap(energy, script) {
  const mod = script && script.willMod ? script.willMod : 0;
  return Math.max(1, WILL_BASE + Math.floor(energy / WILL_PER_ENERGY) + mod);
}

/** 只读视图：给世界层与界面层。视图在 apply 后重新生成，禁止外部改写。 */
export function makeView(state, cardsById, content) {
  const bars = { ...state.bars };
  const habits = state.habits.map((id) => cardsById[id]);
  const offers = state.offers.map((id) => cardsById[id]);
  return Object.freeze({
    version: state.v,
    seed: state.seed,
    opts: { ...state.opts },
    chapter: state.chapter,
    age: state.age,
    segment: state.segment,
    bars,
    ap: state.ap,
    willUsed: usedWill(state.habits, cardsById),
    willCap: willCap(state.bars.energy, state.script),
    script: state.script ? { ...state.script } : null,
    rerolled: state.rerolled,
    habits: Object.freeze(habits),
    offers: Object.freeze(offers),
    offersBuilding: state.offersBuilding,
    encounters: Object.freeze(state.encounters.map((e) => ({ ...e }))),
    strangers: Object.freeze(state.strangers.map((s) => ({ ...s }))),
    lifeEvent: state.lifeEvent,
    townEvent: state.townEvent,
    flags: { ...state.flags },
    ended: state.ended,
    deathCause: state.deathCause,
    // 面板文案辅助
    encTpl(id) {
      return content.encounters.find((e) => e.id === id) || null;
    },
    strTpl(id) {
      return content.temptations.find((t) => t.id === id) || null;
    },
    quiz(id) {
      return content.quizzes.find((q) => q.id === id) || null;
    },
  });
}
