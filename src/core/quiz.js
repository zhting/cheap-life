/**
 * quiz.js —— 急救题抽样与判分。
 * 场景文字模板、受助者、地点用洗牌袋与种子派生流；选项顺序洗牌；
 * 干扰项只来自书中明确反对的做法。不设倒计时。
 */
import { stream, int, sample } from "./rng.js";
import { takeFromBag } from "./draw.js";

/** 每个场景的候选地点（{place} 变量） */
const PLACES = {
  cardiac: ["家里", "楼道口", "菜市场", "公园长椅边"],
  "elder-fall": ["卫生间", "家里", "小区花坛边", "楼道里"],
  stroke: ["饭桌上", "家里", "棋牌室", "楼下小广场"],
  "chest-pain": ["家里", "工地上", "班上", "电梯口"],
  bleeding: ["厨房里", "工地上", "车库里", "修理铺"],
  "animal-bite": ["小区遛弯路上", "家门口", "乡间小路", "宠物店门口"],
  burn: ["厨房里", "开水房", "大排档后厨", "家里"],
  anaphylaxis: ["饭馆里", "家里", "野餐时", "亲戚家饭桌上"],
  seizure: ["家里", "公交站", "广场上", "办公室"],
  hypoglycemia: ["家里", "班上", "超市里", "公园里"],
  electric: ["家里", "修理铺", "工棚里", "厨房里"],
  "co-alarm": ["家里", "浴室里", "出租屋里", "老家堂屋"],
  chemical: ["工地上", "储物间", "自家装修的房子里", "打印店里"],
  heatstroke: ["工地", "大太阳底下", "田间地头", "仓库里"],
  fire: ["居民楼", "出租屋", "老家属院", "临街商铺"],
  drowning: ["水库边", "河边", "池塘边", "鱼塘旁"],
  choking: ["饭桌上", "食堂里", "大排档", "家里"],
  hypothermia: ["山路上", "冬天的江边", "露天工地", "郊外"],
  "snake-bite": ["草丛边", "山路旁", "菜园子里", "后山小道"],
  "tick-bite": ["草丛里", "露营地", "狗窝旁", "树林边"],
  extortion: ["郊外小路", "桥洞附近", "废弃厂区", "夜里的河堤"],
  brawl: ["夜市口", "台球厅门口", "大排档", "街角"],
  impaled: ["工地上", "装修现场", "旧货仓库", "废品站"],
  fracture: ["球场边", "楼梯上", "结冰的路面", "工地跳板上"],
};

const WHO_TEXT = { family: "家人", friend: "朋友", stranger: "陌生人" };

/**
 * 生成一场战斗的急救场景（确定性）：
 * 谁出事、在哪、哪套模板、每步选项顺序，全部由 seed:quiz:ordinal 派生。
 * 学过（已采纳出处条目）的玩家得到提示：每步排除一个错误选项。
 */
export function quizScene(seed, ordinal, quizId, state, content) {
  const quiz = content.quizzes.find((q) => q.id === quizId);
  if (!quiz) return null;
  const next = stream(seed, "quiz", ordinal);
  const who = quiz.who && quiz.who.length > 0 ? sample(next, quiz.who, 1)[0] : null;
  const bagIdx = takeFromBag(state, "quiz-" + quizId, 1, quiz.setup.length, next);
  const setupTpl = quiz.setup[bagIdx[0]];
  const places = PLACES[quizId] || ["镇上"];
  const placeIdx = takeFromBag(state, "place-" + quizId, 1, places.length, next);
  const place = places[placeIdx[0]];
  const learned = quiz.source.filter((sid) => state.habits.indexOf(sid) >= 0);
  const steps = quiz.steps.map((step) => {
    const order = step.options.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = int(next, 0, i + 1);
      const t = order[i];
      order[i] = order[j];
      order[j] = t;
    }
    let excluded = -1;
    if (learned.length > 0) {
      // 排除洗牌后靠后的一个错误选项（确定性）
      for (let i = order.length - 1; i >= 0; i--) {
        if (!step.options[order[i]].ok) {
          excluded = order[i];
          break;
        }
      }
    }
    return {
      q: step.q,
      options: order.map((oi) => ({ t: step.options[oi].t, ok: step.options[oi].ok, basis: step.options[oi].basis })),
      why: step.why,
      excluded,
    };
  });
  const setupText = setupTpl
    .replace("{who}", who ? WHO_TEXT[who] : "")
    .replace("{place}", place);
  return {
    id: quiz.id,
    name: quiz.name,
    who,
    whoText: who ? WHO_TEXT[who] : "",
    place,
    setup: setupText,
    steps,
    learned,
    source: quiz.source,
  };
}

/** 判分：每步答对得 1 分。answers 与 steps 对齐，存的是洗牌后选项下标 */
export function quizScore(scene, answers) {
  let score = 0;
  for (let i = 0; i < scene.steps.length; i++) {
    const pick = answers[i];
    if (pick === undefined || pick === null) continue;
    const opt = scene.steps[i].options[pick];
    if (opt && opt.ok) score += 1;
  }
  return score;
}
