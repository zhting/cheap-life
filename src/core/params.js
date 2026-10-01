/**
 * params.js —— 全部数值参数与规则版本。
 * 数值为设计初值，经 tools/sim.js 网格搜索后再调。概率与系数用千分比/万分比整数，
 * 收益与减伤每一步向下取整（见 core/draw.js 与 core/fight.js 的定点运算）。
 */

/** 规则版本：params.js 或数据变了就 +1；不同版本存档明说读不了 */
export const RULES_VERSION = 1;

/** 章节：13 章 × 5 年，18 岁到 83 岁 */
export const CHAPTERS = 13;
export const YEARS_PER_CHAPTER = 5;
export const START_AGE = 18;
export const END_AGE = 83;

/** 每章行动点；精力归零（倦怠）时下一章只有 3 点 */
export const AP_PER_CHAPTER = 6;
export const TIRED_AP = 3;

/** 起始状态（体质/性格会微调） */
export const START_HEALTH = 100;
export const START_ENERGY = 70;
export const START_FREEDOM = 80;

/** 出身 → 起始积蓄（千元）与收入系数 */
export const ORIGIN_SAVINGS = { poor: -10, normal: 20, rich: 60, sick: 0 };
export const ORIGIN_INCOME = { poor: 800, normal: 1000, rich: 1150, sick: 900 }; // 千分比

/** 每章净收入（千元）：28 × 职业系数 × 职业生涯曲线；63 岁起 14 */
export const INCOME_RAMP = [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000]; // 万分比，按章 1-13（方案：固定 28 千元 × 职业系数）
export const INCOME_PER_CHAPTER = 28;
export const INCOME_OLD = 14;
export const INCOME_OLD_AGE = 63;

/** 医疗和生活支出增量（千元/章）：从 48/58/68/78 岁起 */
export const EXPENSE_STEPS = [
  { from: 48, add: 4 },
  { from: 58, add: 8 },
  { from: 68, add: 14 },
  { from: 78, add: 20 },
];

/** 健康自然衰减/章：按 33、43、53、63、73 岁分档 */
export const HEALTH_DECAY_STEPS = [33, 43, 53, 63, 73];
export const HEALTH_DECAY = [20, 30, 40, 55, 65]; // 千分比（÷1000 得每章衰减）

/** 毅力槽上限：3 + 精力÷20 取整；性格 ±1 */
export const WILL_BASE = 3;
export const WILL_PER_ENERGY = 20;

/** 被动收益基数（万分比整数）：大 1.5 / 中 0.9 / 小 0.4 */
export const BENEFIT_BASE = { big: 15000, mid: 9000, small: 4000 };
/** 证据系数（万分比）：A 1.0 / B 0.8 / C 0.6 */
export const GRADE_EVIDENCE = { A: 10000, B: 8000, C: 6000 };
/** 各口径被动加成上限：加成 = 上限 × S ÷ (S + 上限) */
export const DOMAIN_CAP = { h: 36, m: 25, e: 16, f: 10 };
/** 口径 → 状态条 */
export const DOMAIN_BAR = { h: "health", m: "money", e: "energy", f: "freedom" };

/** 减伤基数（万分比）：大 0.35 / 中 0.22 / 小 0.12；保留系数下限 0.30 */
export const REDUCE_BASE = { big: 3500, mid: 2200, small: 1200 };
export const RETAIN_FLOOR = 3000;

/** 习惯发动削减：32 × 收益系数（大 1.0 / 中 0.65 / 小 0.35）× 证据系数；每习惯每场一次 */
export const HABIT_CUT_BASE = 40;
export const HABIT_CUT_BENEFIT = { big: 10000, mid: 6500, small: 3500 };

/** 花钱求助固定削减威胁 */
export const PAY_CUT = 28;

/** 战斗：威胁 40-100；回合上限 3；之后终结击伤害 ×1.2 */
export const THREAT_MIN = 40;
export const THREAT_MAX = 100;
export const FIGHT_ROUNDS = 3;
export const FINAL_BLOW_MULT = 12000; // 万分比
/** 撤退：本回合伤害 ×0.6，留下未解决标志 */
export const RETREAT_MULT = 6000;
/** 伤害波动 ±15%（万分比 8500-11500） */
export const VARIANCE_MIN = 8500;
export const VARIANCE_MAX = 11500;
/** 全答错的急救题伤害乘数 */
export const QUIZ_ALL_WRONG_MULT = 13000;

/** 每章遭遇数：38 岁前 2 个，38 岁起 3 个 */
export const ENCOUNTERS_PER_CHAPTER = 2;
export const ENCOUNTERS_PER_CHAPTER_OLD = 3;
export const ENCOUNTERS_OLD_AGE = 38;
/** 稀有事件替换概率 8%；机遇事件 12% */
export const RARE_CHANCE = 800; // 千分比
export const CHANCE_CHANCE = 120; // 千分比
/** 连续两章没有机遇事件，下一章机遇权重 ×3 */
export const CHANCE_PITY_MULT = 3;

/** 防重复：同一遭遇模板一局最多 3 次；重复一次权重减半（×0.5^n） */
export const SAME_ENCOUNTER_MAX = 3;
export const REPEAT_DECAY_PERMILLE = 500;

/** 前 3 章不抽致命级遭遇：预计伤害超过当前健康 60% 的不进牌库 */
export const LETHAL_GUARD_CHAPTERS = 3;
export const LETHAL_GUARD_RATIO = 6000; // 万分比

/** 积蓄为负（千元）：每章扣自由；低于 -100（负 10 万）债务崩盘 */
export const NEGATIVE_MONEY_FREEDOM_HIT = 3;
export const DEBT_COLLAPSE = -100;

/** 精力自然恢复/章（睡眠与日常），上限 100 */
export const ENERGY_RECOVER = 4;

/** 链式事件 */
export const CHAIN_CARDIO_MULT = 16000; // 睡眠类未解决 → 2 章心血管遭遇权重 ×1.6
export const CHAIN_CARDIO_CHAPTERS = 2;
export const CHAIN_WAGE_EXPIRE = 2; // 欠薪未处理：2 章内不去人社大院就失去追索（自由 -8）
export const CHAIN_WAGE_LOSS = 8;
export const CHAIN_DEBT_CALL_FLAG = "debt-call"; // 负债 → 下一章催债电话
export const CHAIN_UNEMPLOY_FLAG = "unemploy"; // 失业 → 下一章招聘季机遇
export const CHAIN_CHRONIC_FLAG = "chronic"; // 筛查发现慢病 → 医院 NPC 发放第 16 章条目

/** 诱惑：接受坏诱惑时后果概率直接用条目里的 p */
export const TEMPT_PEEK_AP = 1;

/** 人生事件：每章最多 1 个；受剧本和标志位控制 */
export const LIFE_EVENT_MAX_PER_CHAPTER = 1;
/** 小镇随机事件出现概率（千分比） */
export const TOWN_EVENT_CHANCE = 600;

/** 结算分数：结束年龄 × 10 + 状态项；活到结局时状态项 = (健康+自由+精力)×2 + min(积蓄,300)÷3 */
export const SCORE_AGE_MULT = 10;
export const SCORE_BARS_MULT = 2;
export const SCORE_MONEY_CAP = 300;
export const SCORE_MONEY_DIV = 3;

/** 小镇：36×28 格，每格 16 像素 */
export const TOWN_W = 36;
export const TOWN_H = 28;
export const TILE = 16;

/** 每章时间段数（行动点推进） */
export const SEGMENTS = 6;

/** 人生阶段（用于建议牌与遭遇权重） */
export const STAGES = ["young", "mid", "senior", "old"];
export const STAGE_AGE = [18, 38, 58, 73]; // 每档起始年龄
export function stageOf(age) {
  if (age >= 73) return "old";
  if (age >= 58) return "senior";
  if (age >= 38) return "mid";
  return "young";
}

/** 章节在四个人生阶段的建议牌权重（千分比乘数），默认 1000 */
export const CHAPTER_STAGE_W = {
  1: [1000, 1000, 1000, 1000],
  2: [1000, 1000, 1200, 1200],
  3: [1200, 1200, 1000, 1000],
  4: [1200, 1000, 1000, 1000],
  5: [1000, 1200, 1000, 1000],
  6: [1000, 1000, 1000, 1000],
  7: [1200, 1000, 800, 800],
  8: [1200, 1200, 1000, 1000],
  9: [1200, 1000, 1000, 1000],
  10: [1400, 1200, 600, 400],
  11: [1200, 1200, 800, 600],
  12: [1400, 1200, 700, 400],
  13: [1000, 1000, 1000, 1000],
  14: [1200, 1200, 1000, 800],
  15: [1400, 1200, 800, 800],
  16: [800, 1000, 1200, 1400],
  17: [400, 800, 1400, 1600],
  18: [1400, 1300, 500, 300],
  19: [1200, 1200, 900, 700],
  20: [1300, 1300, 500, 300],
  21: [1200, 900, 700, 500],
  22: [1000, 1000, 1200, 1200],
  23: [1400, 1100, 800, 600],
  24: [900, 1000, 1200, 1300],
  25: [300, 700, 1400, 1600],
  26: [1400, 1200, 700, 400],
  27: [1300, 1300, 500, 300],
  28: [1000, 1000, 1100, 1100],
  29: [1000, 1000, 1100, 1100],
  30: [1200, 1300, 800, 500],
  31: [1500, 900, 500, 400],
  32: [1500, 800, 500, 400],
  33: [700, 900, 1100, 1200],
  34: [1000, 1000, 1200, 1200],
};
