/**
 * game.js —— 内核对外接口：create、legal、apply、fightPreview、replay、hash。
 * 世界层与界面层只发命令、读状态与事件；状态只能通过 apply 改变。
 * 非法命令返回 { ok:false, reason }，状态不变。
 */
import { baseState, makeView, willCap } from "./state.js";
import { drawScript } from "./script.js";
import { dropOverflow } from "./habits.js";
import { drawOffers, startChapter, takeFromBag } from "./draw.js";
import { resolveFight, findTemplate } from "./fight.js";
import { quizScene } from "./quiz.js";
import { doPeek, doAccept, doRefuse, autoIdentified } from "./tempt.js";
import { applyEnd, checkEnding, applyChapterContent } from "./chapter.js";
import { hash32 } from "./hash.js";
import { data, content } from "./data.js";
import { CHAIN_WAGE_EXPIRE } from "./params.js";

/** 开局：抽剧本，落第 1 章 */
export function create(seed, opts) {
  const state = baseState(seed >>> 0, opts);
  state.script = drawScript(state.seed, state.opts, content);
  state.bars.money = state.script.savings0;
  state.bars.health = state.script.startHealth;
  state.bars.energy = state.script.startEnergy;
  state.chapter = 1;
  state.ap = 6;
  const events = [{ t: "start", seed: state.seed, script: state.script }];
  const spawns = startChapter(state, data, content);
  applyChapterContent(state, data, content, spawns);
  return { state, events: events.concat(spawns) };
}

/** 当前能发的命令（界面据此决定按钮能不能点；内核仍会再校验一次） */
export function legal(state) {
  if (state.ended || state.chapter === 0) return [];
  const list = [];
  for (const b of data.buildings) {
    if (b.chapters.length > 0 && state.ap >= 1) list.push({ cmd: "talk", building: b.id });
  }
  for (const id of state.offers) {
    if (state.habits.indexOf(id) >= 0) continue;
    const c = data.cardsById[id];
    if (!c) continue;
    const freeLearn = !!state.flags.freeLearn;
    const apOk = freeLearn || state.ap >= c.cost.time;
    const moneyOk = state.bars.money >= c.cost.money;
    if (apOk && moneyOk) list.push({ cmd: "learn", id, cost: c.cost, freeLearn });
  }
  for (const id of state.habits) list.push({ cmd: "drop", id });
  for (const s of state.strangers) {
    if (s.done) continue;
    const tempt = data.temptById[s.tpl];
    const auto = tempt && autoIdentified(state, tempt, data);
    if (!s.ident && (auto || state.ap >= 1)) list.push({ cmd: "peek", id: s.tpl, free: auto });
    list.push({ cmd: "accept", id: s.tpl });
    list.push({ cmd: "refuse", id: s.tpl });
  }
  for (const e of state.encounters) {
    if (e.state !== 0 || e.seg > state.segment) continue;
    const tpl = findTemplate(state, e.tpl, data, content);
    if (!tpl) continue;
    if (tpl.kind === "chance") list.push({ cmd: "engage", id: e.tpl });
    else list.push({ cmd: "fight", id: e.tpl });
  }
  list.push({ cmd: "end" });
  return list;
}

function spendAp(state, events) {
  state.ap -= 1;
  state.segment = Math.min(5, state.segment + 1);
  events.push({ t: "ap", ap: state.ap, segment: state.segment });
}

function clampBars(state) {
  state.bars.health = Math.max(0, Math.min(100, state.bars.health));
  state.bars.energy = Math.max(0, Math.min(100, state.bars.energy));
  state.bars.freedom = Math.max(0, Math.min(100, state.bars.freedom));
}

/** 听建议：1 点，从建筑卡池抽 3 条 */
function cmdTalk(state, buildingId) {
  const b = data.buildings.find((x) => x.id === buildingId);
  if (!b || b.chapters.length === 0) return { ok: false, reason: "这栋楼不听建议" };
  if (state.ap < 1) return { ok: false, reason: "行动点不够" };
  const events = [];
  state.offers = drawOffers(state, buildingId, data, content);
  state.offersBuilding = buildingId;
  state.talks += 1;
  spendAp(state, events);
  // NPC 开场白（洗牌袋）
  const lines = content.npc.openings[buildingId] || [""];
  const bagIdx = takeFromBag(state, "open-" + buildingId, 1, lines.length, null);
  events.push({
    t: "talk", building: buildingId, offers: state.offers,
    npc: npcName(state, buildingId), line: lines[bagIdx[0]],
  });
  // 走进人社大院，欠薪追索续期
  if (buildingId === "hr" && state.flags["wage-due"]) {
    state.flags["wage-due"] = Math.min(state.flags["wage-due"], state.chapter + CHAIN_WAGE_EXPIRE);
    events.push({ t: "flag", name: "wage-due", value: state.flags["wage-due"], text: "劳动监察受理了你的材料，追索续上了" });
  }
  return { ok: true, events };
}

function npcName(state, buildingId) {
  // 名字由种子派生，同一局同一建筑固定
  let h = 0;
  const s = state.seed + ":" + buildingId;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  }
  const names = content.npc.names;
  return names[h % names.length];
}

/** 采纳习惯：扣积蓄、占行动点与毅力槽 */
function cmdLearn(state, cardId) {
  const card = data.cardsById[cardId];
  if (!card || state.offers.indexOf(cardId) < 0) return { ok: false, reason: "这张牌不在当前建议里" };
  if (state.habits.indexOf(cardId) >= 0) return { ok: false, reason: "已经采纳过了" };
  const freeLearn = !!state.flags.freeLearn;
  if (!freeLearn && state.ap < card.cost.time) return { ok: false, reason: "行动点不够" };
  if (state.bars.money < card.cost.money) return { ok: false, reason: "积蓄不够" };
  const events = [];
  if (card.cost.money > 0) {
    state.bars.money -= card.cost.money;
    events.push({ t: "bar", bar: "money", delta: -card.cost.money, reason: "采纳：" + card.title });
  }
  if (!freeLearn && card.cost.time > 0) spendAp(state, events);
  if (freeLearn) {
    state.flags.freeLearn = 0;
    events.push({ t: "flag", name: "freeLearn", value: 0, text: "公益培训的免费学习名额用掉了" });
  }
  state.habits.push(cardId);
  // 采纳后若超出毅力槽，最重的先掉
  const habitCards = state.habits.map((id) => data.cardsById[id]);
  const cap = willCap(state.bars.energy, state.script);
  const { kept, dropped } = dropOverflow(habitCards, cap);
  state.habits = kept.map((c) => c.id);
  for (const c of dropped) events.push({ t: "habit", id: c.id, op: "broken", reason: "毅力槽不够了" });
  events.push({ t: "habit", id: cardId, op: "adopted", cost: card.cost });
  events.push({ t: "offers", ids: state.offers, building: state.offersBuilding });
  return { ok: true, events };
}

function cmdDrop(state, cardId) {
  const idx = state.habits.indexOf(cardId);
  if (idx < 0) return { ok: false, reason: "没有这个习惯" };
  state.habits.splice(idx, 1);
  return { ok: true, events: [{ t: "habit", id: cardId, op: "dropped" }] };
}

/** 机遇事件：免费筛查 / 公益培训 / 补贴窗口 */
function cmdEngage(state, encId) {
  const enc = state.encounters.find((e) => e.tpl === encId && e.state === 0);
  const tpl = findTemplate(state, encId, data, content);
  if (!enc || !tpl || tpl.kind !== "chance") return { ok: false, reason: "没有这个机遇" };
  if (enc.seg > state.segment) return { ok: false, reason: "还没到时间" };
  const events = [{ t: "engage", id: encId }];
  if (encId === "chance-screen") {
    state.bars.health = Math.min(100, state.bars.health + 3);
    events.push({ t: "bar", bar: "health", delta: 3, reason: "免费筛查" });
  } else if (encId === "chance-training") {
    state.flags.freeLearn = 1;
    state.bars.freedom = Math.min(100, state.bars.freedom + 2);
    events.push({ t: "bar", bar: "freedom", delta: 2, reason: "公益培训" });
    events.push({ t: "flag", name: "freeLearn", value: 1, text: "获得一次免费学习名额（采纳习惯不花行动点）" });
  } else if (encId === "chance-subsidy") {
    state.bars.money += 5;
    events.push({ t: "bar", bar: "money", delta: 5, reason: "补贴到账" });
  }
  enc.state = 2;
  events.push({ t: "encState", id: encId, state: 2 });
  clampBars(state);
  return { ok: true, events };
}

/** 执行命令。成功就地改状态并返回事件；失败返回 { ok:false, reason } 且状态不变。 */
export function apply(state, cmd) {
  if (state.ended) return { ok: false, reason: "这一局已经结束了" };
  const name = cmd[0];
  let result;
  switch (name) {
    case "talk":
      result = cmdTalk(state, cmd[1]);
      break;
    case "learn":
      result = cmdLearn(state, cmd[1]);
      break;
    case "drop":
      result = cmdDrop(state, cmd[1]);
      break;
    case "peek":
      result = doPeek(state, cmd[1], data);
      break;
    case "accept":
      result = doAccept(state, cmd[1], data);
      break;
    case "refuse":
      result = doRefuse(state, cmd[1], data);
      break;
    case "fight":
      result = resolveFight(state, cmd[1], cmd[2] || [], data, content);
      break;
    case "engage":
      result = cmdEngage(state, cmd[1]);
      break;
    case "end":
      result = { ok: true, events: applyEnd(state, data, content) };
      break;
    default:
      result = { ok: false, reason: "未知命令：" + name };
  }
  if (result && result.ok) {
    clampBars(state);
    if (checkEnding(state) && !result.events.some((e) => e.t === "ending")) {
      result.events.push({ t: "ending", kind: state.ended.kind, age: state.ended.age, score: state.ended.score, deathCause: state.ended.deathCause });
    }
  }
  return result;
}

/** 战斗预演（不落状态）：界面逐回合演出用，命令提交后内核按同一种子重演 */
export function fightPreview(state, encId, actions) {
  const tpl = findTemplate(state, encId, data, content);
  if (!tpl) return null;
  const habitCards = state.habits.map((id) => data.cardsById[id]);
  const matched = [];
  for (const c of habitCards) {
    for (const t of c.tags) {
      if (tpl.tags.indexOf(t) >= 0) {
        matched.push(c);
        break;
      }
    }
  }
  const scene = tpl.quiz ? quizScene(state.seed, state.fights, tpl.quiz, state, content) : null;
  return {
    tpl,
    threat: tpl.threat,
    intent: tpl.intent,
    matched: matched.map((c) => c.id),
    scene,
    actions: actions || [],
  };
}

/** 重放整局：种子 + 选项 + 命令日志 → 同一状态 */
export function replay(seed, opts, log) {
  const { state } = create(seed, opts);
  for (const cmd of log) {
    const result = apply(state, cmd);
    if (!result.ok) return { ok: false, reason: "命令被内核拒绝：" + JSON.stringify(cmd) + " " + result.reason };
  }
  return { ok: true, state };
}

export function hash(state) {
  return hash32(state);
}

export function view(state) {
  return makeView(state, data.cardsById, content);
}

export { data, content };
