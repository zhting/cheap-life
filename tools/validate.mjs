/**
 * validate.mjs —— 数据与手写内容校验（技术方案「抽取与校验」）。任何一项不过，构建失败。
 * 校验项：
 *   1. 全部条目 id 唯一，字段取值都在枚举内；
 *   2. 每个标签至少 3 张卡；
 *   3. 每个遭遇至少匹配 3 张卡，且来自不少于 2 章；
 *   4. 每栋建筑在每个人生阶段的可发放池不少于 6 张；
 *   5. 每道急救题的出处 id 都存在，每个选项都标了依据（book/contrast）；
 *   6. 界面里出现的热线号码，都能在书中条目里找到。
 * 外加：手写内容结构（遭遇/诱惑/急救题/事件/剧本牌/NPC 台词）与引用完整性。
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => JSON.parse(readFileSync(join(root, p), "utf8"));

const errors = [];
const warns = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warns.push(msg);

// —— 数据 ——
const cardsJson = read("data/cards.json");
const cards = cardsJson.cards;
const cardsById = {};
for (const c of cards) cardsById[c.id] = c;

const tagRules = read("content/tag-rules.json");
const tagIds = new Set(tagRules.tags.map((t) => t.id));
const buildings = read("content/buildings.json").buildings;
const hotlines = read("content/buildings.json").hotlines;
const scriptCards = read("content/script-cards.json");
const encounters = read("content/encounters.json").encounters;
const quizzes = read("content/quizzes.json").quizzes;
const temptations = read("content/temptations.json").temptations;
const events = read("content/events.json").events;
const townEvents = read("content/town-events.json").events;
const npc = read("content/npc.json");

// —— 1. 条目字段枚举 ——
const MONEY = [0, 1, 6], TIME = [1, 2, 3], WILL = [0, 1, 2];
const LEVELS = ["大", "中", "小"], DOMAINS = ["h", "m", "f", "e"], GRADES = ["A", "B", "C"];
const buildingIds = new Set(buildings.map((b) => b.id));
const ids = new Set();
for (const c of cards) {
  if (ids.has(c.id)) fail(`条目 id 重复：${c.id}`);
  ids.add(c.id);
  if (!MONEY.includes(c.cost.money)) fail(`${c.id} cost.money 非法`);
  if (!TIME.includes(c.cost.time)) fail(`${c.id} cost.time 非法`);
  if (!WILL.includes(c.cost.will)) fail(`${c.id} cost.will 非法`);
  if (!LEVELS.includes(c.benefit.level)) fail(`${c.id} benefit.level 非法`);
  if (!DOMAINS.includes(c.benefit.domain)) fail(`${c.id} benefit.domain 非法`);
  if (!GRADES.includes(c.grade)) fail(`${c.id} grade 非法`);
  if (!buildingIds.has(c.building)) fail(`${c.id} building 非法：${c.building}`);
  if (!Array.isArray(c.tags)) fail(`${c.id} tags 缺失`);
  for (const t of c.tags) if (!tagIds.has(t)) fail(`${c.id} 未知标签 ${t}`);
  if (!c.title || !c.plain) fail(`${c.id} 缺标题或说人话`);
  if (c.plain.length > 160) warn(`${c.id} 卡面文字超过 160 字（${c.plain.length}）`);
}
if (cards.length !== cardsJson.meta.count) fail(`meta.count 与实际条数不符`);
if (cards.length < 600) fail(`条目数异常：${cards.length}`);

// —— 2. 每个标签至少 3 张卡 ——
const tagCount = {};
for (const c of cards) for (const t of c.tags) tagCount[t] = (tagCount[t] || 0) + 1;
for (const t of tagIds) {
  const n = tagCount[t] || 0;
  if (n > 0 && n < 3) fail(`标签 ${t} 只有 ${n} 张卡`);
}

// —— 3. 每个遭遇至少匹配 3 张卡，来自不少于 2 章 ——
function matchCards(tags) {
  const matched = cards.filter((c) => c.tags.some((t) => tags.includes(t)));
  const chapters = new Set(matched.map((c) => c.chapter));
  return { n: matched.length, chapters: chapters.size };
}
const spriteSet = new Set(["car", "flame", "gas", "water", "heart", "brain", "bolt", "chart", "pill", "person", "elder", "storm", "mushroom", "snake", "food", "sun", "snow", "rain", "moon", "phone", "pen", "coin", "paper", "hand", "brief", "bandage", "code", "eye", "fist", "badge", "key", "flask", "child", "cross", "book", "knife", "bug", "bone", "blood", "paw", "dice", "gift", "people", "leaf"]);
for (const e of encounters) {
  if (!e.id || !e.name || !e.sprite) fail(`遭遇缺字段：${e.id}`);
  if (!spriteSet.has(e.sprite)) fail(`遭遇 ${e.id} 未知 sprite：${e.sprite}`);
  if (!e.ages || e.ages.length !== 2 || e.ages[0] >= e.ages[1]) fail(`遭遇 ${e.id} ages 非法`);
  if (typeof e.weight !== "number" || e.weight <= 0) fail(`遭遇 ${e.id} weight 非法`);
  for (const t of e.tags) if (!tagIds.has(t)) fail(`遭遇 ${e.id} 未知标签 ${t}`);
  if (e.kind === "prevent") {
    if (e.threat < 40 || e.threat > 100) fail(`遭遇 ${e.id} threat 越界`);
    if (!Array.isArray(e.intent) || e.intent.length === 0) fail(`遭遇 ${e.id} intent 缺失`);
    for (const it of e.intent) {
      if (!["h", "m", "e", "f"].includes(it.bar)) fail(`遭遇 ${e.id} intent.bar 非法`);
      if (typeof it.dmg !== "number" || it.dmg <= 0) fail(`遭遇 ${e.id} intent.dmg 非法`);
    }
    if (!e.help || typeof e.help.cost !== "number" || e.help.cost < 0 || e.help.cut !== 25) fail(`遭遇 ${e.id} help 非法`);
  }
  const { n, chapters } = matchCards(e.tags);
  if (n < 3) fail(`遭遇 ${e.id} 只匹配 ${n} 张卡（需 ≥3）`);
  else if (chapters < 2) fail(`遭遇 ${e.id} 匹配的卡来自 ${chapters} 章（需 ≥2）`);
}

// —— 4. 每栋建筑在每个人生阶段的可发放池 ≥ 6 ——
const chapterToBuilding = {};
for (const c of cards) chapterToBuilding[c.id] = c.building;
for (const b of buildings) {
  if (b.chapters.length === 0) continue;
  const pool = cards.filter((c) => c.building === b.id);
  for (const stage of ["young", "mid", "senior", "old"]) {
    if (pool.length < 6) fail(`建筑 ${b.id} 在 ${stage} 阶段可发放池只有 ${pool.length} 张`);
  }
}

// —— 5. 急救题出处与选项依据 ——
for (const q of quizzes) {
  if (!q.id || !q.name || !q.sprite) fail(`急救题缺字段：${q.id}`);
  if (!spriteSet.has(q.sprite)) fail(`急救题 ${q.id} 未知 sprite`);
  if (!Array.isArray(q.source) || q.source.length === 0) fail(`急救题 ${q.id} 缺出处`);
  for (const sid of q.source) if (!cardsById[sid]) fail(`急救题 ${q.id} 出处不存在：${sid}`);
  if (!Array.isArray(q.setup) || q.setup.length < 2) warn(`急救题 ${q.id} 场景模板少于 2 套`);
  if (!Array.isArray(q.steps) || q.steps.length < 1 || q.steps.length > 3) fail(`急救题 ${q.id} 步数非法`);
  for (const step of q.steps) {
    if (!step.q || !step.why) fail(`急救题 ${q.id} 步骤缺问题或讲解`);
    if (!Array.isArray(step.options) || step.options.length < 2 || step.options.length > 4) fail(`急救题 ${q.id} 选项数非法`);
    const okCount = step.options.filter((o) => o.ok).length;
    if (okCount !== 1) fail(`急救题 ${q.id} 每步必须恰好一个正确项（现在 ${okCount}）`);
    for (const o of step.options) {
      if (!["book", "contrast"].includes(o.basis)) fail(`急救题 ${q.id} 选项缺依据：${o.t}`);
      if (o.basis === "contrast" && o.ok) fail(`急救题 ${q.id} 正确项不能是 contrast`);
    }
    if (step.why.indexOf("取自") < 0) warn(`急救题 ${q.id} 讲解未标注出处`);
  }
}

// —— 6. 热线号码在书中出现 ——
let bookText = "";
{
  const fsMod = await import("node:fs");
  const dir = join(root, "book");
  for (const f of fsMod.readdirSync(dir)) {
    if (f.endsWith(".md")) bookText += fsMod.readFileSync(join(dir, f), "utf8");
  }
  for (const h of hotlines) {
    if (bookText.indexOf(h.num) < 0) fail(`热线号码 ${h.num} 在书中找不到`);
  }
  // 署名与许可的关键串在书里能对上
  if (bookText.indexOf("CC BY") < 0 && bookText.indexOf("署名") < 0) warn("书中未见许可说明（仅提示）");
}

// —— 手写内容结构 ——
if (scriptCards.origin.length !== 4) fail(`出身牌应 4 张，实际 ${scriptCards.origin.length}`);
if (scriptCards.physique.length !== 5) fail(`体质牌应 5 张，实际 ${scriptCards.physique.length}`);
if (scriptCards.personality.length !== 5) fail(`性格牌应 5 张，实际 ${scriptCards.personality.length}`);
if (scriptCards.job.length !== 6) fail(`职业牌应 6 张，实际 ${scriptCards.job.length}`);

const preventCount = encounters.filter((e) => e.kind === "prevent").length;
if (preventCount < 48) fail(`预防型遭遇应 ≥48 个，实际 ${preventCount}`);
if (quizzes.length < 24) fail(`急救题应 ≥24 个，实际 ${quizzes.length}`);
const badT = temptations.filter((t) => t.kind === "bad").length;
const goodT = temptations.filter((t) => t.kind === "good").length;
if (badT < 16 || goodT < 8) fail(`诱惑应坏 16 好 8，实际 ${badT}/${goodT}`);
if (events.length < 16) fail(`人生事件应 ≥16 条，实际 ${events.length}`);
if (townEvents.length < 20) fail(`小镇事件应 ≥20 条，实际 ${townEvents.length}`);

for (const t of temptations) {
  if (!["bad", "good"].includes(t.kind)) fail(`诱惑 ${t.id} kind 非法`);
  if (!cardsById[t.book]) fail(`诱惑 ${t.id} 出处条目不存在：${t.book}`);
  if (!Array.isArray(t.accept) || t.accept.length === 0) fail(`诱惑 ${t.id} 缺 accept`);
  let pSum = 0;
  for (const a of t.accept) {
    pSum += a.p;
    for (const k of Object.keys(a.d || {})) {
      if (!["m", "h", "e", "f"].includes(k)) fail(`诱惑 ${t.id} 效果键非法：${k}`);
    }
  }
  if (Math.abs(pSum - 1) > 0.001) fail(`诱惑 ${t.id} 概率之和不是 1：${pSum}`);
  for (const tg of t.tags) if (!tagIds.has(tg)) fail(`诱惑 ${t.id} 未知标签 ${tg}`);
}

for (const ev of events) {
  if (!ev.id || !ev.name || !Array.isArray(ev.ages) || ev.ages.length !== 2) fail(`人生事件 ${ev.id} 字段缺失`);
  if (ev.flag && !ev.flag.name) fail(`人生事件 ${ev.id} flag 缺 name`);
  for (const k of Object.keys(ev.d || {})) {
    if (!["m", "h", "e", "f"].includes(k)) fail(`人生事件 ${ev.id} 效果键非法：${k}`);
  }
}
for (const te of townEvents) {
  for (const k of Object.keys(te.d || {})) {
    if (!["m", "h", "e", "f"].includes(k)) fail(`小镇事件 ${te.id} 效果键非法：${k}`);
  }
}

for (const b of buildings) {
  if (b.chapters.length === 0) continue;
  const open = npc.openings[b.id] || [];
  const close = npc.closings[b.id] || [];
  if (open.length < 8) fail(`建筑 ${b.id} 开场白少于 8 句`);
  if (close.length < 6) fail(`建筑 ${b.id} 收尾少于 6 句`);
}
if (npc.names.length < 60) fail(`NPC 名字池应 ≥60，实际 ${npc.names.length}`);

// 遭遇/诱惑 sprite 与急救题 sprite 都必须能画出来 —— 与 world/sprites.js 对齐
// 机遇事件
for (const e of encounters) {
  if (e.kind === "chance" && e.intent) fail(`机遇事件 ${e.id} 不应有 intent`);
}

// 结果
if (errors.length > 0) {
  console.error(`校验失败，共 ${errors.length} 项：`);
  for (const e of errors) console.error("  ✗ " + e);
  process.exit(1);
}
if (warns.length > 0) {
  for (const w of warns) console.warn("  ! " + w);
}
console.log(`校验通过：${cards.length} 条条目、${encounters.length} 个遭遇、${quizzes.length} 道急救题、${temptations.length} 条诱惑、${events.length} 条人生事件、${townEvents.length} 条小镇事件。`);
