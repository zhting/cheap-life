/**
 * data.js —— 构建时打进内核的数据。cards.json 由 extract.py 生成，不手改；
 * content/ 为手写内容。sensitive 由关键词在加载时标记，供可选过滤开关使用。
 */
import cardsJson from "../../data/cards.json" with { type: "json" };
import buildingsJson from "../../content/buildings.json" with { type: "json" };
import scriptCardsJson from "../../content/script-cards.json" with { type: "json" };
import encountersJson from "../../content/encounters.json" with { type: "json" };
import quizzesJson from "../../content/quizzes.json" with { type: "json" };
import temptationsJson from "../../content/temptations.json" with { type: "json" };
import eventsJson from "../../content/events.json" with { type: "json" };
import townEventsJson from "../../content/town-events.json" with { type: "json" };
import npcJson from "../../content/npc.json" with { type: "json" };

const SENSITIVE_KEYWORDS = [
  "自杀", "自残", "轻生", "性侵", "性健康", "安全套", "艾滋病", "HIV",
  "避孕", "暴力", "犯罪", "赌博", "吸毒",
];

const cards = cardsJson.cards;
const cardsById = {};
for (const c of cards) cardsById[c.id] = c;

const temptById = {};
for (const t of temptationsJson.temptations) temptById[t.id] = t;

const sensitive = new Set();
for (const c of cards) {
  const hay = c.title + c.plain;
  for (const kw of SENSITIVE_KEYWORDS) {
    if (hay.indexOf(kw) >= 0) {
      sensitive.add(c.id);
      break;
    }
  }
}

export const data = {
  meta: cardsJson.meta,
  cards,
  cardsById,
  temptById,
  sensitive,
  buildings: buildingsJson.buildings,
  hotlines: buildingsJson.hotlines,
};

export const content = {
  buildings: buildingsJson,
  scriptCards: scriptCardsJson,
  encounters: encountersJson.encounters,
  quizzes: quizzesJson.quizzes,
  temptations: temptationsJson.temptations,
  events: eventsJson.events,
  townEvents: townEventsJson,
  npc: npcJson,
};
