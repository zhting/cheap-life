/**
 * fight.js —— 战斗回合：被动减伤、四选一行动、敌人出手、终结击。
 * 一场战斗的全部动作作为一条 fight 命令提交，内核用同样的种子重演一遍，结果必然一致。
 */
import { stream, int } from "./rng.js";
import {
  FIGHT_ROUNDS, FINAL_BLOW_MULT, RETREAT_MULT, VARIANCE_MIN, VARIANCE_MAX, PAY_CUT,
  QUIZ_ALL_WRONG_MULT, CHAIN_WAGE_EXPIRE, CHAIN_WAGE_LOSS, DOMAIN_BAR,
} from "./params.js";
import { retention, matchedHabitCards, habitCut } from "./habits.js";
import { suggestCards } from "./draw.js";
import { quizScene, quizScore } from "./quiz.js";

/** 急救型遭遇模板：由题目生成，不进内容文件 */
export function rescueTemplate(quiz, cardsById) {
  const tags = [];
  for (const sid of quiz.source) {
    const card = cardsById[sid];
    if (card) for (const t of card.tags) if (tags.indexOf(t) < 0) tags.push(t);
  }
  return {
    id: "q-" + quiz.id,
    kind: "rescue",
    name: quiz.name,
    sprite: quiz.sprite,
    ages: [18, 85],
    weight: 6,
    tags: tags.length > 0 ? tags : ["first-aid"],
    threat: 65,
    intent: [{ bar: "h", dmg: 30 }],
    help: { label: "呼叫专业急救（120）", cost: 2, cut: 25 },
    quiz: quiz.id,
  };
}

export function findTemplate(state, encId, data, content) {
  const prevent = content.encounters.find((e) => e.id === encId);
  if (prevent) return prevent;
  const quiz = content.quizzes.find((q) => "q-" + q.id === encId);
  if (quiz) return rescueTemplate(quiz, data.cardsById);
  return null;
}

function damageEvent(state, bar, amount, reason, events) {
  if (amount <= 0) return;
  // intent 的 bar 是口径代码（h/m/e/f），状态条是全名
  const name = DOMAIN_BAR[bar] || bar;
  if (name === "money") state.bars.money -= amount;
  else state.bars[name] = Math.max(0, state.bars[name] - amount);
  events.push({ t: "bar", bar: name, delta: -amount, reason });
  if (name !== "money") state.lastEncName = reason;
}

/** 执行一整场战斗。actions: [["habit",cardId]|["pay"]|["quiz",[answers]]|["retreat"], ...] */
export function resolveFight(state, encId, actions, data, content) {
  const events = [];
  const slot = state.encounters.find((e) => e.tpl === encId && e.state === 0);
  const tpl = findTemplate(state, encId, data, content);
  if (!slot || !tpl) {
    return { ok: false, reason: "没有这场遭遇" };
  }
  const next = stream(state.seed, "fight", state.fights);
  const habitCards = state.habits.map((id) => data.cardsById[id]);
  const matched = matchedHabitCards(habitCards, tpl.tags);
  const k = retention(matched);
  let threat = tpl.threat;
  const used = [];
  const acts = actions || [];
  const warm = state.script && state.script.personality === "warm";
  let scene = null;
  if (tpl.quiz) scene = quizScene(state.seed, state.fights, tpl.quiz, state, content);

  let round = 1;
  let ended = null; // { win } | { win: false, unresolved: true }
  while (round <= FIGHT_ROUNDS && !ended) {
    const isFinal = round === FIGHT_ROUNDS;
    const action = acts[round - 1] || null;
    let allWrong = false;
    let retreated = false;
    if (action) {
      const kind = action[0];
      if (kind === "habit") {
        const cardId = action[1];
        const card = data.cardsById[cardId];
        const already = used.indexOf(cardId) >= 0;
        const isMatched = matched.some((c) => c.id === cardId);
        if (!card || already || !isMatched) {
          return { ok: false, reason: "这个习惯本场不能发动" };
        }
        used.push(cardId);
        const cut = habitCut(card, state.script);
        threat = Math.max(0, threat - cut);
        events.push({ t: "action", kind: "habit", card: cardId, cut, round });
      } else if (kind === "pay") {
        const cost = warm ? Math.max(0, Math.floor((tpl.help.cost * 7) / 10)) : tpl.help.cost;
        if (state.bars.money < cost) {
          return { ok: false, reason: "积蓄不够这笔求助" };
        }
        state.bars.money -= cost;
        events.push({ t: "bar", bar: "money", delta: -cost, reason: tpl.help.label });
        threat = Math.max(0, threat - PAY_CUT);
        events.push({ t: "action", kind: "pay", cost, round });
      } else if (kind === "quiz") {
        if (!tpl.quiz) return { ok: false, reason: "这场遭遇没有急救题" };
        const score = quizScore(scene, action[1] || []);
        events.push({ t: "action", kind: "quiz", score, total: scene.steps.length, round });
        if (score >= scene.steps.length) {
          threat = 0;
        } else if (score > 0) {
          threat = Math.ceil(threat / 2);
        } else {
          allWrong = true;
        }
      } else if (kind === "retreat") {
        retreated = true;
        events.push({ t: "action", kind: "retreat", round });
      } else {
        return { ok: false, reason: "未知行动" };
      }
    }
    events.push({ t: "round", round, threat, k });

    if (threat <= 0) {
      ended = { win: true };
      break;
    }
    // 敌人出手：伤害 = 预告 × 保留系数 × 波动（±15%）
    let mult = 10000;
    if (allWrong) mult = Math.floor((mult * QUIZ_ALL_WRONG_MULT) / 10000);
    if (retreated) mult = Math.floor((mult * RETREAT_MULT) / 10000);
    if (isFinal) mult = Math.floor((mult * FINAL_BLOW_MULT) / 10000);
    for (const it of tpl.intent) {
      const variance = int(next, VARIANCE_MIN, VARIANCE_MAX + 1);
      let dmg = Math.floor((it.dmg * k * variance * mult) / (10000 * 10000 * 10000));
      if (dmg < 1) dmg = 1;
      damageEvent(state, it.bar, dmg, tpl.name, events);
    }
    if (isFinal) {
      ended = { win: false, unresolved: true };
      break;
    }
    if (retreated) {
      ended = { win: false, unresolved: true };
      break;
    }
    round += 1;
  }

  if (ended.win) {
    slot.state = 1;
    state.lesson = suggestCards(tpl.tags, state.habits, data);
    events.push({ t: "fightEnd", id: encId, win: true, lesson: state.lesson });
  } else {
    slot.state = 2;
    if (tpl.chain && tpl.chain.unresolved === "wage-due") {
      state.flags["wage-due"] = state.chapter + CHAIN_WAGE_EXPIRE;
    } else if (tpl.chain && tpl.chain.unresolved === "unemploy-next") {
      state.flags["unemploy-next"] = 1;
    } else if (tpl.chain && tpl.chain.unresolved === "debt-call") {
      state.flags["debt-call"] = 1;
    }
    // 睡眠类未解决 → 心血管遭遇窗口
    if (tpl.tags.indexOf("sleep") >= 0) {
      state.flags.cardioUntil = state.chapter + 2;
    }
    events.push({ t: "fightEnd", id: encId, win: false, unresolved: true });
  }
  state.fights += 1;
  events.push({ t: "encState", id: encId, state: slot.state });
  return { ok: true, events };
}

/** 战斗里造成的伤害可能直接触发结局，由 game.js 在 apply 后统一检查 */
export function chainCleanup(state) {
  // 欠薪时效：超过期限还没去人社大院就失去追索
  if (state.flags["wage-due"] && state.chapter > state.flags["wage-due"]) {
    state.flags["wage-due"] = 0;
    state.bars.freedom = Math.max(0, state.bars.freedom - CHAIN_WAGE_LOSS);
  }
}
