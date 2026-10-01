/**
 * habits.js —— 习惯（装备）：采纳成本、毅力槽、被动加成、减伤保留系数。
 * 全部用整数定点运算（万分比），每一步向下取整，保证跨环境一致。
 */
import {
  BENEFIT_BASE, GRADE_EVIDENCE, DOMAIN_CAP, DOMAIN_BAR,
  REDUCE_BASE, RETAIN_FLOOR, HABIT_CUT_BASE, HABIT_CUT_BENEFIT,
} from "./params.js";

/** 卡面收益等级（大/中/小）→ 参数键（big/mid/small） */
export const LEVEL_KEY = { 大: "big", 中: "mid", 小: "small" };

/** 习惯在同口径下的效果（万分比）：收益基数 × 证据系数 */
export function habitEffect(card) {
  return Math.floor((BENEFIT_BASE[LEVEL_KEY[card.benefit.level]] * GRADE_EVIDENCE[card.grade]) / 10000);
}

/** 按口径分组求和 S */
export function domainSum(habits) {
  const s = { h: 0, m: 0, e: 0, f: 0 };
  for (const card of habits) s[card.benefit.domain] += habitEffect(card);
  return s;
}

/**
 * 章末被动加成（整数）：加成 = 上限 × S ÷ (S + 上限)，S 是同口径习惯效果之和。
 * 上限以万分比口径换算：DOMAIN_CAP 给的是状态点数。
 */
export function passiveBonus(habits) {
  const bonus = { health: 0, money: 0, energy: 0, freedom: 0 };
  const s = domainSum(habits);
  for (const domain of ["h", "m", "e", "f"]) {
    const cap = DOMAIN_CAP[domain];
    const sBps = s[domain];
    if (sBps <= 0) continue;
    const value = Math.floor((cap * sBps) / (sBps + cap * 10000));
    bonus[DOMAIN_BAR[domain]] = value;
  }
  return bonus;
}

/** 单个习惯对某威胁的减伤基数 r（万分比）：减伤基数 × 证据系数 */
export function reduceOne(card) {
  return Math.floor((REDUCE_BASE[LEVEL_KEY[card.benefit.level]] * GRADE_EVIDENCE[card.grade]) / 10000);
}

/**
 * 保留系数 k（万分比）：k = max(0.30, ∏(1 - r_i))，r_i = b_i × g_i。
 * matchedHabits：标签与遭遇相交的已采纳习惯（按条目 id 排序，保证遍历顺序稳定）。
 */
export function retention(matchedHabits) {
  const ordered = matchedHabits.slice().sort((a, b) => (a.id < b.id ? -1 : 1));
  let k = 10000;
  for (const card of ordered) {
    k = Math.floor((k * (10000 - reduceOne(card))) / 10000);
  }
  return Math.max(k, RETAIN_FLOOR);
}

/** 标签是否相交 */
export function tagsMatch(a, b) {
  if (!a || !b) return false;
  for (const t of a) if (b.indexOf(t) >= 0) return true;
  return false;
}

/** 与遭遇标签匹配的已采纳习惯 */
export function matchedHabitCards(habitCards, encTags) {
  return habitCards.filter((c) => tagsMatch(c.tags, encTags));
}

/** 习惯发动削减（整数威胁值）：22 × 收益系数 × 证据系数 × 好胜修正 */
export function habitCut(card, script) {
  const ben = HABIT_CUT_BENEFIT[LEVEL_KEY[card.benefit.level]];
  const ev = GRADE_EVIDENCE[card.grade];
  const comp = script && script.cards && script.cards.personality.mods.habitCut ? script.cards.personality.mods.habitCut : 10000;
  return Math.max(1, Math.floor((HABIT_CUT_BASE * ben * ev * comp) / 1000000000000));
}

/** 毅力占用；溢出时保留轻毅力、高收益的习惯（即"最重/最不划算的先掉"） */
export function dropOverflow(habitCards, cap) {
  const used = habitCards.reduce((sum, c) => sum + c.cost.will, 0);
  if (used <= cap) return { kept: habitCards.slice(), dropped: [] };
  const levelRank = { 小: 0, 中: 1, 大: 2 };
  const keepOrder = habitCards.slice().sort((a, b) => {
    if (a.cost.will !== b.cost.will) return a.cost.will - b.cost.will;
    const la = levelRank[a.benefit.level];
    const lb = levelRank[b.benefit.level];
    if (la !== lb) return lb - la;
    return a.id < b.id ? -1 : 1;
  });
  const kept = [];
  const dropped = [];
  let will = 0;
  for (const c of keepOrder) {
    if (will + c.cost.will <= cap) {
      kept.push(c);
      will += c.cost.will;
    } else {
      dropped.push(c);
    }
  }
  if (kept.length === 0 && keepOrder.length > 0) {
    kept.push(keepOrder[0]);
    dropped.length = 0;
  }
  kept.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { kept, dropped };
}
