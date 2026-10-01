/**
 * sim.js —— 平衡模拟。四种机器人各跑 N 局（种子互不相同）：
 *   随机：每步从合法命令里随机选；
 *   贪心：按收益/成本从高到低选；
 *   照书选：优先「钱 0、时间少、毅力否、收益大」的条目，模拟按书的排序做；
 *   谨慎：毅力槽留两格余量，遇到诱惑一律先查书。
 * 输出：活到 83 岁比例、结局分布、各章平均状态、习惯数量、平均决策数、前 3 章出局率。
 * 用法：node tools/sim.js [--runs 5000] [--robot 随机|贪心|照书选|谨慎|all] [--report]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { create, apply, legal, fightPreview } from "../src/core/game.js";
import { data } from "../src/core/data.js";

const args = process.argv.slice(2);
function argValue(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
}
const RUNS = argValue("--runs", 5000);
const robotArg = args.indexOf("--robot") >= 0 ? args[args.indexOf("--robot") + 1] : "all";

const BENEFIT_RANK = { 大: 3, 中: 2, 小: 1 };

/** 机器人的战斗动作策略：习惯发动 → 求助一次 → 急救题/撤退；急救题按是否学过作答 */
function fightActions(state, encId, robot) {
  if (robot === "随机") return [["retreat"]];
  const preview = fightPreview(state, encId, []);
  const acts = [];
  const matched = preview.matched.filter((id) => state.habits.indexOf(id) >= 0);
  let habitIdx = 0;
  let paid = false;
  for (let round = 0; round < 3; round++) {
    if (habitIdx < matched.length) {
      acts.push(["habit", matched[habitIdx++]]);
      continue;
    }
    if (!paid && preview.tpl.help && state.bars.money >= preview.tpl.help.cost) {
      acts.push(["pay"]);
      paid = true;
      continue;
    }
    if (preview.scene) {
      // 学过出处条目就答对；没学过按书作答的概率随机器人类型而定
      const learned = preview.scene.learned.length > 0;
      const smart = learned || robot === "照书选" || robot === "谨慎";
      const answers = preview.scene.steps.map((step) => {
        if (smart) {
          const idx = step.options.findIndex((o) => o.ok);
          return idx;
        }
        return Math.floor(seededRandom(state.seed + round * 31 + step.q.length) * step.options.length);
      });
      acts.push(["quiz", answers]);
      continue;
    }
    acts.push(["retreat"]);
  }
  return acts;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededRandom(n) {
  let x = (n | 0) + 0x6d2b79f5;
  x = Math.imul(x ^ (x >>> 15), 1 | x);
  x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
}

/** legal() 的选项对象 → 命令数组 */
function optionToCmd(o, state, robot) {
  switch (o.cmd) {
    case "talk": return ["talk", o.building];
    case "learn": return ["learn", o.id];
    case "drop": return ["drop", o.id];
    case "peek": return ["peek", o.id];
    case "accept": return ["accept", o.id];
    case "refuse": return ["refuse", o.id];
    case "fight": return ["fight", o.id, fightActions(state, o.id, robot)];
    case "engage": return ["engage", o.id];
    default: return ["end"];
  }
}

/** 机器人选一条命令（返回命令数组） */
function pick(state, optsIn, robot, rng) {
  let opts = optsIn;
  const talks = opts.filter((o) => o.cmd === "talk");
  const learns = opts.filter((o) => o.cmd === "learn");
  const fights = opts.filter((o) => o.cmd === "fight" || o.cmd === "engage");
  const peeks = opts.filter((o) => o.cmd === "peek");
  const accepts = opts.filter((o) => o.cmd === "accept");
  const refuses = opts.filter((o) => o.cmd === "refuse");
  const end = opts.find((o) => o.cmd === "end");
  const drops = opts.filter((o) => o.cmd === "drop");

  if (robot === "随机") {
    // 真实玩家不会一上来就睡觉：end 降权到 8%
    const pool = end && rng() > 0.08 ? opts.filter((o) => o.cmd !== "end") : opts;
    const choice = pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : end;
    return choice ? optionToCmd(choice, state, robot) : ["end"];
  }
  // 策略机器人只在行动点耗尽时结算
  if (end && state.ap === 0) return ["end"];
  opts = opts.filter((o) => o.cmd !== "end");

  // 迎战永远优先（拖到章末自动结算更亏）；求助只规划一次，避免积蓄中途不够
  if (fights.length > 0) {
    const f = fights[Math.floor(rng() * fights.length)];
    if (f.cmd === "engage") return ["engage", f.id];
    return ["fight", f.id, fightActions(state, f.id, robot)];
  }
  // 谨慎：见诱惑先查书，坏拒绝、好接受；其他人按性格
  if (peeks.length > 0 && (robot === "谨慎" || rng() < 0.5)) {
    return ["peek", peeks[0].id];
  }
  if (accepts.length > 0 && refuses.length > 0) {
    const t = data.temptById[accepts[0].id];
    const known = state.strangers.find((s) => s.tpl === accepts[0].id && s.ident);
    if (robot === "谨慎" || robot === "照书选" || known) {
      // 谨慎查过书；照书选按书里的建议：看到「高收益、保本」直接走开（5.6）
      return t.kind === "bad" ? ["refuse", t.id] : ["accept", t.id];
    }
    if (robot === "贪心") return rng() < 0.5 ? ["accept", t.id] : ["refuse", t.id];
    return rng() < 0.5 ? ["accept", t.id] : ["refuse", t.id];
  }

  // 学牌：按机器人策略排序
  if (learns.length > 0) {
    const willUsed = state.habits.reduce((s, id) => s + data.cardsById[id].cost.will, 0);
    const cap = 3 + Math.floor(state.bars.energy / 20) + (state.script.willMod || 0);
    let candidates = learns.filter((o) => willUsed + o.cost.will <= cap);
    if (robot === "谨慎") {
      const safe = candidates.filter((o) => willUsed + o.cost.will <= cap - 2);
      if (safe.length > 0) candidates = safe;
    }
    if (candidates.length > 0) {
      const score = (o) => {
        const c = data.cardsById[o.id];
        if (robot === "贪心") return BENEFIT_RANK[c.benefit.level] * 10 - c.cost.money / 6 - c.cost.time - c.cost.will;
        if (robot === "照书选") return -c.cost.money * 5 - c.cost.time * 3 - c.cost.will * 4 + BENEFIT_RANK[c.benefit.level] * 8;
        return BENEFIT_RANK[c.benefit.level] * 10 - c.cost.money / 6 - c.cost.time - c.cost.will;
      };
      candidates.sort((a, b) => score(b) - score(a));
      return ["learn", candidates[0].id];
    }
  }

  // 听建议：还有行动点就去听
  if (talks.length > 0 && state.ap >= 1) {
    return ["talk", talks[Math.floor(rng() * talks.length)].building];
  }

  // 随手丢一个毅力占用的习惯（谨慎除外）
  if (drops.length > 0 && robot !== "谨慎" && rng() < 0.05) {
    return ["drop", drops[0].id];
  }

  if (end) return ["end"];
  return opts[Math.floor(rng() * opts.length)];
}

function runOne(seed, robot) {
  const rng = mulberry32(seed * 7919 + 1);
  const { state } = create(seed, {});
  let decisions = 0;
  let guard = 0;
  while (!state.ended && guard++ < 600) {
    const opts = legal(state);
    if (opts.length === 0) break;
    const cmd = pick(state, opts, robot, rng);
    let r = apply(state, cmd);
    if (!r.ok && cmd[0] === "fight") {
      // 预规划的动作可能因积蓄变化非法：退一步改为撤退
      r = apply(state, ["fight", cmd[1], [["retreat"]]]);
    }
    if (!r.ok && cmd[0] !== "end") {
      r = apply(state, ["end"]);
    }
    if (!r.ok) break;
    decisions += 1;
  }
  return { ended: state.ended, age: state.age, chapter: state.chapter, bars: { ...state.bars }, habits: state.habits.length, decisions };
}

const ROBOTS = ["随机", "贪心", "照书选", "谨慎"];
const chosen = robotArg === "all" ? ROBOTS : [robotArg];
const summary = {};
for (const robot of chosen) {
  const endings = { alive: 0, death: 0, freedom: 0, debt: 0 };
  const earlyOut = { n: 0 };
  let habitSum = 0, decisionSum = 0;
  const chapterStats = {};
  for (let i = 0; i < RUNS; i++) {
    const seed = (i * 2654435761) >>> 0 || 1;
    const r = runOne(seed, robot);
    endings[r.ended.kind] += 1;
    if (r.ended.kind !== "alive" && r.chapter <= 3) earlyOut.n += 1;
    habitSum += r.habits;
    decisionSum += r.decisions;
    const ck = Math.min(r.chapter, 13);
    chapterStats[ck] = chapterStats[ck] || { h: 0, m: 0, e: 0, f: 0, n: 0 };
    chapterStats[ck].h += r.bars.health;
    chapterStats[ck].m += r.bars.money;
    chapterStats[ck].e += r.bars.energy;
    chapterStats[ck].f += r.bars.freedom;
    chapterStats[ck].n += 1;
  }
  const alivePct = ((endings.alive / RUNS) * 100).toFixed(1);
  const earlyPct = ((earlyOut.n / RUNS) * 100).toFixed(1);
  summary[robot] = { endings, alivePct: Number(alivePct), earlyPct: Number(earlyPct), avgHabits: (habitSum / RUNS).toFixed(2), avgDecisions: Math.round(decisionSum / RUNS) };
  console.log(`${robot}：活到83岁 ${alivePct}%（前3章出局 ${earlyPct}%），结局 alive/death/freedom/debt = ${endings.alive}/${endings.death}/${endings.freedom}/${endings.debt}，平均习惯 ${summary[robot].avgHabits}，平均决策 ${summary[robot].avgDecisions}`);
  const lines = [];
  for (const ck of Object.keys(chapterStats).sort((a, b) => a - b)) {
    const s = chapterStats[ck];
    lines.push(`ch${ck}(n=${s.n}) h=${(s.h / s.n).toFixed(0)} m=${(s.m / s.n).toFixed(0)} e=${(s.e / s.n).toFixed(0)} f=${(s.f / s.n).toFixed(0)}`);
  }
  console.log("   " + lines.join(" "));
}

if (args.indexOf("--report") >= 0) {
  mkdirSync(new URL("./reports/", import.meta.url), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const lines = [
    `# sim 基线报告 ${stamp}`,
    `runs: ${RUNS}`,
    "",
    "| 机器人 | 活到83岁 | 前3章出局 | 平均习惯 | 平均决策 | alive/death/freedom/debt |",
    "| --- | --- | --- | --- | --- | --- |",
    ...Object.keys(summary).map((r) => {
      const s = summary[r];
      return `| ${r} | ${s.alivePct}% | ${s.earlyPct}% | ${s.avgHabits} | ${s.avgDecisions} | ${s.endings.alive}/${s.endings.death}/${s.endings.freedom}/${s.endings.debt} |`;
    }),
    "",
    "目标：随机 ≤10% 且前3章出局 ≤3%；贪心 50-70%；照书选 60-75%；谨慎 55-75%。",
  ];
  const out = new URL(`./reports/sim-${stamp}.md`, import.meta.url);
  writeFileSync(out, lines.join("\n"));
  console.log("报告已写入 tools/reports/");
}
