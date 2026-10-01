/**
 * panels.js —— 全屏卡片与菜单：建筑面板、习惯、战斗（含急救题）、诱惑、
 * 章末结算、结局、菜单（习惯/设置/求助热线/存档码）。
 * 面板只读视图 + dispatch 命令，不直接改状态。
 */
import { A11Y } from "./a11y.js";
import { makePortrait, makeEncounterIcon, partsFromSeed } from "../world/sprites.js";
import { GRADE_EVIDENCE } from "../core/params.js";
import { data, content } from "../core/data.js";
import { fightPreview } from "../core/game.js";

let overlayEl = null;
let current = null; // { close() }

export function initPanels(overlay) {
  overlayEl = overlay;
}

export function closePanel() {
  if (current) {
    current.close();
    current = null;
  }
}

export function panelOpen() {
  return !!current;
}

function mount(html, opts = {}) {
  closePanel();
  const box = document.createElement("div");
  box.className = "panel " + (opts.cls || "");
  box.setAttribute("role", opts.role || "dialog");
  if (opts.label) box.setAttribute("aria-label", opts.label);
  box.innerHTML = html;
  overlayEl.appendChild(box);
  const api = {
    el: box,
    close() {
      box.remove();
    },
  };
  current = api;
  const back = box.querySelector("[data-back]");
  if (back) back.addEventListener("click", closePanel);
  A11Y.focusPanel(box);
  return api;
}

/* ---------------- 通用小组件 ---------------- */

function gradeStamp(grade) {
  return `<span class="stamp grade-${grade}">${grade}</span>`;
}

function costTags(cost) {
  const tags = [];
  if (cost.money > 0) tags.push(`钱 ${cost.money}千`);
  if (cost.time > 0) tags.push(`时间 ${cost.time}`);
  if (cost.will > 0) tags.push(`毅力 ${cost.will === 2 ? "是" : "些"}`);
  return `<span class="costs">${tags.join(" · ") || "零成本"}</span>`;
}

function barName(bar) {
  return { health: "健康", money: "积蓄", energy: "精力", freedom: "自由" }[bar] || bar;
}

/* ---------------- 建筑面板 ---------------- */

/**
 * 建筑面板：NPC 头像和台词 + 听建议(1点)/看我的习惯/离开。
 * talk 之后由 updateOffers 刷新建议牌。
 */
export function showBuildingPanel(opts) {
  const { building, npc, line, offers, view, dispatch, onClose } = opts;
  const parts = partsFromSeed(hashStr(building.id + npc));
  const portrait = makePortrait(parts).toDataURL();
  const canTalk = view.ap >= 1 && offers === null;
  const p = mount(`
    <div class="panel-head"><button class="btn back" data-back aria-label="返回">←</button>
      <h2>${building.name}</h2></div>
    <div class="panel-body">
      <div class="npc-row">
        <img class="portrait" src="${portrait}" alt="${npc}">
        <div class="npc-text">
          <div class="npc-name">${npc}</div>
          <div class="npc-line">${line}</div>
        </div>
      </div>
      <div class="offer-list" id="offer-list">
        ${offers ? offers.map((c) => offerCard(c, view, dispatch)).join("") : `<div class="muted">这里能听到书里第 ${building.chapters.join("、")} 章的建议。</div>`}
      </div>
    </div>
    <div class="panel-actions">
      <button class="btn primary" id="do-talk" ${canTalk ? "" : "disabled"}>听建议（1点）</button>
      <button class="btn" id="do-habits">看我的习惯</button>
      <button class="btn" data-back>离开</button>
    </div>
  `, { label: building.name });
  p.el.querySelector("#do-talk").addEventListener("click", () => dispatch(["talk", building.id]));
  p.el.querySelector("#do-habits").addEventListener("click", () => showHabitsPanel({ view, dispatch }));
  const oldClose = p.close;
  p.close = () => {
    oldClose();
    if (onClose) onClose();
  };
  return p;
}

function offerCard(c, view, _dispatch) {
  const affordable = view.bars.money >= c.cost.money && (view.ap >= c.cost.time || view.flags.freeLearn);
  const adopted = view.habits.some((h) => h.id === c.id);
  return `
    <div class="card">
      <div class="card-title">${gradeStamp(c.grade)} ${c.title}</div>
      <div class="card-plain">${c.plain}</div>
      <div class="card-meta">${costTags(c.cost)} <span class="benefit">收益${c.benefit.level}·${{ h: "健康", m: "积蓄", e: "精力", f: "自由" }[c.benefit.domain]}</span> <span class="src">原文：第 ${c.id} 条</span></div>
      <button class="btn small learn ${affordable && !adopted ? "" : "disabled"}" data-learn="${c.id}" ${affordable && !adopted ? "" : "disabled"}>${adopted ? "已采纳" : "采纳习惯"}</button>
    </div>`;
}

/** 建筑面板里刷新建议牌（talk 事件后调用） */
export function updateOffers(view, dispatch) {
  void view;
  const list = document.getElementById("offer-list");
  if (!list) return;
  list.innerHTML = view.offers.map((c) => offerCard(c, view, dispatch)).join("");
  for (const btn of list.querySelectorAll("[data-learn]")) {
    btn.addEventListener("click", () => dispatch(["learn", btn.getAttribute("data-learn")]));
  }
  const talkBtn = document.getElementById("do-talk");
  if (talkBtn) {
    talkBtn.disabled = true;
    talkBtn.textContent = "今天听过了";
  }
}

/* ---------------- 习惯面板 ---------------- */

export function showHabitsPanel(opts) {
  const { view, dispatch, onClose } = opts;
  const rows = view.habits.length > 0
    ? view.habits.map((c) => `
      <div class="habit-row">
        <div class="habit-text"><b>${c.title}</b><br><span class="muted">${costTags(c.cost)} 收益${c.benefit.level}</span></div>
        <button class="btn small danger" data-drop="${c.id}">放弃</button>
      </div>`).join("")
    : '<div class="muted">还没有采纳任何习惯。走到建筑门口"听建议"，采纳它们变成你的装备。</div>';
  const p = mount(`
    <div class="panel-head"><button class="btn back" data-back aria-label="返回">←</button>
      <h2>我的习惯（毅力 ${view.willUsed}/${view.willCap}）</h2></div>
    <div class="panel-body">${rows}</div>
    <div class="panel-actions"><button class="btn" data-back>关闭</button></div>
  `, { label: "我的习惯" });
  for (const btn of p.el.querySelectorAll("[data-drop]")) {
    btn.addEventListener("click", () => {
      dispatch(["drop", btn.getAttribute("data-drop")]);
    });
  }
  if (onClose) {
    const oc = p.close;
    p.close = () => { oc(); onClose(); };
  }
  return p;
}

/* ---------------- 战斗面板（含急救题） ---------------- */

/**
 * 战斗逐回合演出：每选一个行动，界面按内核同款公式预演本回合；
 * 战斗结束（胜利/撤退/第 3 回合结束）后把全部动作作为一条 fight 命令提交，
 * 内核用同样的种子重演，结果必然一致。
 */
export function showBattlePanel(opts) {
  const { encId, state, commit, onClose } = opts;
  const tpl = content.encounters.find((e) => e.id === encId) || rescueTpl(encId);
  if (!tpl) return null;
  const icon = makeEncounterIcon(tpl.sprite);
  const actions = [];
  let round = 1;
  let threat = tpl.threat;
  let scene = tpl.quiz ? fightPreview(state, encId, []).scene : null;
  let quizAnswered = null;
  let finished = false;

  const p = mount(`
    <div class="panel-head"><button class="btn back" data-back aria-label="撤退并关闭">←</button>
      <h2>${tpl.name}</h2></div>
    <div class="panel-body battle">
      <div class="battle-top">
        <img class="enc-icon" src="${icon.toDataURL()}" alt="">
        <div class="battle-info">
          <div class="threat-line">威胁 <b id="threat-num">${tpl.threat}</b>/100</div>
          <div class="intent-line" id="intent-line"></div>
          <div class="enc-desc">${tpl.desc || ""}</div>
        </div>
      </div>
      <div id="battle-log" class="battle-log" aria-live="polite"></div>
      <div id="quiz-area"></div>
      <div class="battle-actions" id="battle-actions"></div>
    </div>
  `, { label: tpl.name });

  const log = (html) => {
    const el = p.el.querySelector("#battle-log");
    el.insertAdjacentHTML("beforeend", `<div class="log-line">${html}</div>`);
    el.scrollTop = el.scrollHeight;
  };

  function matchedHabits() {
    const prev = fightPreview(state, encId, actions);
    return prev.matched.filter((id) => state.habits.indexOf(id) >= 0);
  }

  function renderActions() {
    const area = p.el.querySelector("#battle-actions");
    if (finished) {
      area.innerHTML = '<button class="btn primary" id="battle-done">继续</button>';
      area.querySelector("#battle-done").addEventListener("click", () => commit(actions));
      return;
    }
    const matched = matchedHabits();
    const unused = matched.filter((id) => !actions.some((a) => a[0] === "habit" && a[1] === id));
    const html = [];
    for (const id of unused.slice(0, 4)) {
      const card = data.cardsById[id];
      html.push(`<button class="btn habit-act" data-act="habit" data-id="${id}">习惯：${card.title.slice(0, 14)}…</button>`);
    }
    const cost = tpl.help ? tpl.help.cost : 2;
    html.push(`<button class="btn" data-act="pay" ${state.bars.money >= cost ? "" : "disabled"}>花钱求助（${cost}千，威胁-25）</button>`);
    if (tpl.quiz) {
      html.push('<button class="btn primary" data-act="quiz">急救选择题</button>');
    }
    html.push('<button class="btn danger" data-act="retreat">撤退（本回合伤害×0.6，留下未解决）</button>');
    area.innerHTML = html.join("");
    for (const btn of area.querySelectorAll("[data-act]")) {
      btn.addEventListener("click", () => doAction(btn.getAttribute("data-act"), btn.getAttribute("data-id")));
    }
  }

  function renderIntent(k) {
    const line = p.el.querySelector("#intent-line");
    const parts = tpl.intent.map((it) => `${barName(it.bar)} 预计 ${Math.max(1, Math.floor(it.dmg * (k || 10000) / 10000))}`).join("，");
    line.textContent = `意图：${parts}（已按你的习惯减伤）`;
  }

  function renderQuiz() {
    const area = p.el.querySelector("#quiz-area");
    if (!scene || quizAnswered !== null) { area.innerHTML = ""; return; }
    area.innerHTML = scene.steps.map((step, si) => `
      <div class="quiz-step" data-step="${si}">
        <div class="quiz-q">${si + 1}. ${step.q}</div>
        <div class="quiz-options">
          ${step.options.map((o, oi) =>
            `<button class="btn quiz-opt ${scene.learned.length > 0 && step.excluded === oi ? "excluded" : ""}" data-si="${si}" data-oi="${oi}" ${step.excluded === oi ? "disabled" : ""}>${oi + 1}. ${o.t}${scene.learned.length > 0 && step.excluded === oi ? "（已排除）" : ""}</button>`).join("")}
        </div>
        <div class="quiz-why hidden" id="why-${si}"></div>
      </div>`).join("") + '<button class="btn primary" id="quiz-submit" disabled>提交答案</button>';
    const answers = new Array(scene.steps.length).fill(null);
    for (const btn of area.querySelectorAll(".quiz-opt")) {
      btn.addEventListener("click", () => {
        const si = Number(btn.getAttribute("data-si"));
        const oi = Number(btn.getAttribute("data-oi"));
        answers[si] = oi;
        for (const b2 of area.querySelectorAll(`[data-si="${si}"]`)) b2.classList.remove("picked");
        btn.classList.add("picked");
        area.querySelector("#quiz-submit").disabled = answers.some((a) => a === null);
      });
    }
    area.querySelector("#quiz-submit").addEventListener("click", () => {
      quizAnswered = answers;
      actions.push(["quiz", answers]);
      scene.steps.forEach((step, si) => {
        const why = area.querySelector("#why-" + si);
        const ok = step.options[answers[si]] && step.options[answers[si]].ok;
        why.classList.remove("hidden");
        why.innerHTML = `<span class="${ok ? "good" : "bad"}">${ok ? "✓" : "✗"}</span> 书里怎么说：${step.why}`;
      });
      area.querySelector("#quiz-submit").remove();
      for (const b2 of area.querySelectorAll(".quiz-opt")) b2.disabled = true;
      advanceRound();
    });
  }

  function doAction(kind, id) {
    if (finished) return;
    if (kind === "habit") {
      actions.push(["habit", id]);
      const card = data.cardsById[id];
      log(`你发动了「${card.title.slice(0, 18)}…」`);
      advanceRound();
    } else if (kind === "pay") {
      actions.push(["pay"]);
      log(`你花钱求助（${tpl.help.label}）`);
      advanceRound();
    } else if (kind === "quiz") {
      renderQuiz();
      p.el.querySelector("#battle-actions").innerHTML = "";
    } else if (kind === "retreat") {
      actions.push(["retreat"]);
      finished = true;
      log("你撤退了。这一遭遇没有解决，会留下未解决的标志。");
      renderActions();
      A11Y.say("战斗结束，撤退");
    }
  }

  function advanceRound() {
    const result = simulateRound();
    if (result.events && result.events.length) {
      for (const e of result.events) {
        if (e.t === "bar") log(`${barName(e.bar)} ${e.delta > 0 ? "+" : ""}${e.delta}（${e.reason}）`);
        else if (e.t === "round") { threat = e.threat; renderIntent(e.k); p.el.querySelector("#threat-num").textContent = e.threat; }
        else if (e.t === "action" && e.kind === "habit") log(`威胁 -${e.cut}`);
      }
    }
    if (result.finished) {
      finished = true;
      log(result.win ? "威胁清零，你挡住了这次意外。记住这一课。" : (result.unresolved ? "威胁没有清完，留下了未解决的标志。" : ""));
      A11Y.say(result.win ? "战斗胜利" : "战斗结束，留下来了未解决标志");
    } else {
      round += 1;
    }
    renderActions();
    renderQuiz();
  }

  /** 本地逐回合演算（与内核 resolveFight 同款公式；最终以提交 fight 命令后的内核事件为准） */
  function simulateRound() {
    const lastAct = actions[actions.length - 1];
    const events = [];
    if (lastAct[0] === "quiz") {
      const score = scene.steps.filter((step, si) => {
        const a = lastAct[1][si];
        return a !== null && step.options[a] && step.options[a].ok;
      }).length;
      if (score >= scene.steps.length) {
        threat = 0;
        log("全部答对！威胁压下去了。");
      } else if (score > 0) {
        threat = Math.ceil(threat / 2);
        log(`答对 ${score}/${scene.steps.length}，威胁减半。`);
      } else {
        log("全部答错……伤害会加重。");
      }
    } else if (lastAct[0] === "habit") {
      const card = data.cardsById[lastAct[1]];
      const ben = { 大: 10000, 中: 6500, 小: 3500 }[card.benefit.level];
      const ev = GRADE_EVIDENCE[card.grade];
      const comp = state.script && state.script.cards.personality.mods.habitCut ? state.script.cards.personality.mods.habitCut : 10000;
      const cut = Math.max(1, Math.floor((40 * ben * ev * comp) / 1000000000000));
      threat = Math.max(0, threat - cut);
      events.push({ t: "action", kind: "habit", cut });
    } else if (lastAct[0] === "pay") {
      threat = Math.max(0, threat - 25);
    } else if (lastAct[0] === "retreat") {
      return { finished: true, win: false, unresolved: true, events };
    }
    p.el.querySelector("#threat-num").textContent = threat;
    events.push({ t: "round", round, threat, k: 10000 });
    if (threat <= 0) return { finished: true, win: true, events };
    // 敌人出手（显示预估；真实数值由内核按种子重演）
    const prev = fightPreview(state, encId, actions);
    const kCoef = prev && prev.matched && prev.matched.length ? 0.65 : 1;
    for (const it of tpl.intent) {
      const dmg = Math.max(1, Math.floor(it.dmg * kCoef * (0.85 + 0.3 * ((round * 37 + it.dmg) % 10) / 20)));
      events.push({ t: "bar", bar: it.bar, delta: -dmg, reason: tpl.name });
    }
    if (round >= 3) return { finished: true, win: false, unresolved: true, events };
    return { finished: false, events };
  }

  renderIntent(10000);
  renderActions();
  const oc = p.close;
  p.close = () => {
    // 中途关闭＝放弃演出，未提交命令，状态不变，回战斗开头
    oc();
    if (onClose) onClose();
  };
  return p;
}

function rescueTpl(encId) {
  const quiz = content.quizzes.find((q) => "q-" + q.id === encId);
  if (!quiz) return null;
  return {
    id: encId, kind: "rescue", name: quiz.name, sprite: quiz.sprite,
    threat: 65, intent: [{ bar: "h", dmg: 15 }],
    help: { label: "呼叫专业急救（120）", cost: 2, cut: 25 },
    desc: "突然发生的紧急情况，先做对的那一步。",
  };
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) >>> 0;
  return h;
}

/* ---------------- 诱惑面板 ---------------- */

export function showTemptPanel(opts) {
  const { tempt, dispatch, onClose } = opts;
  const p = mount(`
    <div class="panel-head"><button class="btn back" data-back aria-label="返回">←</button>
      <h2>${tempt.name || "陌生人的搭话"}</h2></div>
    <div class="panel-body">
      <div class="tempt-pitch">“${tempt.pitch}”</div>
      <div id="tempt-result" class="muted"></div>
    </div>
    <div class="panel-actions">
      <button class="btn primary" id="tempt-accept">接受</button>
      <button class="btn" id="tempt-refuse">拒绝</button>
      <button class="btn" id="tempt-peek">查书（1点）</button>
    </div>
  `, { label: "诱惑" });
  p.el.querySelector("#tempt-accept").addEventListener("click", () => dispatch(["accept", tempt.id]));
  p.el.querySelector("#tempt-refuse").addEventListener("click", () => dispatch(["refuse", tempt.id]));
  p.el.querySelector("#tempt-peek").addEventListener("click", () => dispatch(["peek", tempt.id]));
  const oc = p.close;
  p.close = () => { oc(); if (onClose) onClose(); };
  return p;
}

/** 查书结果覆盖到诱惑面板 */
export function showTemptPeek(tempt, book) {
  const box = document.getElementById("tempt-result");
  if (box && book) {
    box.innerHTML = `<div class="peek-card"><b>${gradeStamp(book.grade)} 第 ${book.id} 条 ${book.title}</b><br>${book.plain}</div>`;
  }
}

export function showTemptOutcome(text) {
  const box = document.getElementById("tempt-result");
  if (box) box.innerHTML = `<div class="outcome">${text}</div>`;
}

/* ---------------- 章末结算 ---------------- */

export function showSettlePanel(opts) {
  const { events, view, onNext } = opts;
  const bars = events.filter((e) => e.t === "bar");
  const life = events.find((e) => e.t === "life");
  const town2 = events.find((e) => e.t === "town");
  const rows = bars.map((e) => `<div class="settle-row">${barName(e.bar)} <b class="${e.delta >= 0 ? "good" : "bad"}">${e.delta > 0 ? "+" : ""}${e.delta}</b> ${e.reason}</div>`).join("");
  const p = mount(`
    <div class="panel-head"><h2>五年过去</h2></div>
    <div class="panel-body">
      ${life ? `<div class="settle-life">【人生事件】${(content.events.find((e) => e.id === life.id) || {}).name || life.id}</div>` : ""}
      ${town2 ? `<div class="settle-town">【小镇】${(content.townEvents.events.find((e) => e.id === town2.id) || {}).text || ""}</div>` : ""}
      ${rows || '<div class="muted">这一章风平浪静。</div>'}
      <div class="settle-now">现在：健康 ${Math.round(view.bars.health)} · 积蓄 ${Math.round(view.bars.money)}千 · 精力 ${Math.round(view.bars.energy)} · 自由 ${Math.round(view.bars.freedom)}</div>
    </div>
    <div class="panel-actions"><button class="btn primary" id="settle-next">进入第 ${cn2(view.chapter)}章（${view.age} 岁）</button></div>
  `, { label: "章末结算", cls: "fullscreen" });
  p.el.querySelector("#settle-next").addEventListener("click", onNext);
  return p;
}

/* ---------------- 结局页 ---------------- */

export function showEndingPanel(opts) {
  const { view, ended, suggestions, seed, saveCode, onRestart } = opts;
  const kindText = { alive: "活到了 83 岁", death: "生命停在了这一年", freedom: "失去了自由", debt: "债务崩盘" }[ended.kind] || ended.kind;
  const top3 = view.habits.slice(0, 3);
  const p = mount(`
    <div class="panel-head"><h2>结局：${kindText}</h2></div>
    <div class="panel-body">
      <div class="ending-score">结算分数 <b>${ended.score}</b>（${ended.age} 岁 × 10${ended.kind === "alive" ? " + 状态项" : ""}）</div>
      ${ended.kind === "death" && ended.deathCause ? `<div class="ending-cause">死因：${ended.deathCause}</div>` : ""}
      <div class="ending-bars">健康 ${Math.round(view.bars.health)} · 积蓄 ${Math.round(view.bars.money)}千 · 精力 ${Math.round(view.bars.energy)} · 自由 ${Math.round(view.bars.freedom)}</div>
      ${top3.length ? `<div class="ending-habits">最有用的习惯：${top3.map((c) => `第 ${c.id} 条 ${c.title.slice(0, 16)}…`).join("、")}</div>` : ""}
      ${suggestions && suggestions.length ? `<div class="ending-tips"><b>书里这些条目本可以帮你：</b><ul>${suggestions.map((id) => {
        const c = data.cardsById[id];
        return c ? `<li>第 ${c.id} 条 ${c.title}（成本：钱${c.cost.money}/时间${c.cost.time}/毅力${c.cost.will}）</li>` : "";
      }).join("")}</ul></div>` : ""}
      <div class="ending-seed">种子 <code>${seed}</code> · 存档码 <code class="save-code" id="ending-save">${(saveCode || "").slice(0, 48)}…</code></div>
      <div class="attribution">改编自 <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noopener">eternity4719/HowToLiveBetter</a>《高性价比人生指南》，CC BY 4.0，已做游戏化改编与摘录。游戏是简化模型，不构成医疗或法律建议。</div>
    </div>
    <div class="panel-actions">
      <button class="btn" id="copy-save">复制存档码</button>
      <button class="btn primary" id="ending-restart">再来一局</button>
    </div>
  `, { label: "结局", cls: "fullscreen" });
  p.el.querySelector("#copy-save").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(saveCode || "");
      p.el.querySelector("#copy-save").textContent = "已复制";
    } catch {
      p.el.querySelector("#copy-save").textContent = "复制失败";
    }
  });
  p.el.querySelector("#ending-restart").addEventListener("click", onRestart);
  return p;
}

/* ---------------- 菜单 ---------------- */

export function showMenuPanel(opts) {
  const { view, dispatch, hotlines, onSaveCode, onAbandon, onSettings, onClose } = opts;
  const p = mount(`
    <div class="panel-head"><button class="btn back" data-back aria-label="返回">←</button>
      <h2>菜单</h2></div>
    <div class="panel-body">
      <div class="menu-section"><b>求助与热线</b>
        <div class="hotlines">${hotlines.map((h) => `<div class="hotline"><b>${h.num}</b> ${h.label}</div>`).join("")}</div>
        <div class="muted">游戏是简化模型，真实紧急情况请拨 120 / 110。</div>
      </div>
      <div class="menu-section"><b>我的习惯（毅力 ${view.willUsed}/${view.willCap}）</b>
        ${view.habits.map((c) => `<div class="habit-row"><div class="habit-text">${c.title}</div><button class="btn small danger" data-drop="${c.id}">放弃</button></div>`).join("") || '<div class="muted">还没有习惯。</div>'}
      </div>
      <div class="menu-actions-row">
        <button class="btn" id="menu-settings">设置</button>
        <button class="btn" id="menu-save">复制存档码</button>
        <button class="btn danger" id="menu-abandon">放弃本局</button>
      </div>
    </div>
  `, { label: "菜单" });
  for (const btn of p.el.querySelectorAll("[data-drop]")) {
    btn.addEventListener("click", () => dispatch(["drop", btn.getAttribute("data-drop")]));
  }
  p.el.querySelector("#menu-settings").addEventListener("click", () => onSettings());
  p.el.querySelector("#menu-save").addEventListener("click", async () => {
    const code = await onSaveCode();
    try {
      await navigator.clipboard.writeText(code);
      p.el.querySelector("#menu-save").textContent = "已复制存档码";
    } catch {
      p.el.querySelector("#menu-save").textContent = code.slice(0, 20) + "…";
    }
  });
  p.el.querySelector("#menu-abandon").addEventListener("click", () => {
    if (window.confirm("放弃本局？进度将清空。")) {
      closePanel();
      onAbandon();
    }
  });
  const oc = p.close;
  p.close = () => { oc(); if (onClose) onClose(); };
  return p;
}

function cn2(n) {
  const digits = "零一二三四五六七八九十";
  if (n <= 10) return digits[n] || n;
  if (n < 20) return "十" + digits[n - 10];
  return digits[Math.floor(n / 10)] + "十" + (n % 10 ? digits[n % 10] : "");
}
