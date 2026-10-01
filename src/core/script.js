/**
 * script.js —— 人生剧本。开局抽四张牌（出身/体质/性格/职业各一），
 * 可整套重抽一次（opts.reroll）。600 种开局，同一 seed + reroll 得到同一套。
 */
import { stream, sample } from "./rng.js";
import { ORIGIN_SAVINGS, ORIGIN_INCOME } from "./params.js";

/**
 * 抽剧本。content.scriptCards = { origin:[], physique:[], personality:[], job:[] }
 * 返回 { origin, physique, personality, job, willMod, ...派生值 }
 */
export function drawScript(seed, opts, content) {
  const next = stream(seed, "script", (opts && opts.reroll) || 0);
  const pick = (list) => sample(next, list, 1)[0];
  const origin = pick(content.scriptCards.origin);
  const physique = pick(content.scriptCards.physique);
  const personality = pick(content.scriptCards.personality);
  const job = pick(content.scriptCards.job);
  const mods = {
    ...origin.mods,
    ...physique.mods,
    ...personality.mods,
    ...job.mods,
  };
  return {
    origin: origin.id,
    physique: physique.id,
    personality: personality.id,
    job: job.id,
    // 剧本内嵌数值，供结算与权重使用（都来自卡面 mods，游戏设定）
    savings0: ORIGIN_SAVINGS[origin.id],
    incomeK: (ORIGIN_INCOME[origin.id] / 1000) * (job.mods.income / 1000),
    volatility: job.mods.vol || 1000,
    willMod: mods.willMod || 0,
    identify: mods.identify || 0,
    helpDiscount: mods.helpDiscount || 0,
    startHealth: 100 + (mods.health || 0),
    startEnergy: 70 + (mods.energy || 0),
    cards: { origin, physique, personality, job },
  };
}

/** 剧本对事件/遭遇的权重乘数（万分比） */
export function scriptWeight(script, kind) {
  if (!script || !script.cards) return 1000;
  const all = { ...script.cards.origin.mods, ...script.cards.physique.mods, ...script.cards.personality.mods, ...script.cards.job.mods };
  return all[kind] || 1000;
}
