/**
 * dialog.js —— 对话框与内容提示。
 * 对话贴底占三分之一到一半屏幕；首次进入必点"我知道了"的内容提示。
 */
import { A11Y } from "./a11y.js";

let el = null;
let queue = [];
let onDone = null;
let typing = null; // { timer, full } 逐字显示进行中

export function initDialog(container) {
  el = document.createElement("div");
  el.className = "dialog hidden";
  el.setAttribute("role", "dialog");
  container.appendChild(el);
  el.addEventListener("click", advance);
}

/** 显示一段对话（数组或单条）。完成后回调 */
export function showDialog(lines, done) {
  queue = Array.isArray(lines) ? lines.slice() : [lines];
  onDone = done || null;
  el.classList.remove("hidden");
  render();
}

/** 键盘翻页（空格/回车/E），与点击对话框相同 */
export function advanceDialog() {
  if (dialogVisible()) advance();
}

function advance() {
  // 逐字显示中点击：先把这一句补全
  if (typing) {
    finishTyping();
    return;
  }
  if (queue.length > 1) {
    queue.shift();
    render();
  } else {
    hideDialog();
    if (onDone) {
      const cb = onDone;
      onDone = null;
      cb();
    }
  }
}

function render() {
  const text = queue[0];
  const how = document.documentElement.dataset.controls === "touch" ? "点击" : "点击或按空格";
  el.innerHTML = `<div class="dialog-text"></div><div class="dialog-hint">${queue.length > 1 ? how + "继续（还有 " + (queue.length - 1) + " 段）▸" : how + "关闭 ▸"}</div>`;
  const box = el.querySelector(".dialog-text");
  stopTyping();
  A11Y.say(text);
  if (!typewriterOn() || /[<&]/.test(text)) {
    box.innerHTML = text;
    return;
  }
  // 逐字显示：每 28ms 一个字，点击可直接补全
  const chars = Array.from(text);
  let i = 0;
  box.setAttribute("aria-hidden", "true");
  typing = {
    full: text,
    box,
    timer: window.setInterval(() => {
      i += 1;
      box.textContent = chars.slice(0, i).join("");
      if (i >= chars.length) finishTyping();
    }, 28),
  };
}

function typewriterOn() {
  const d = document.documentElement.dataset;
  const reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return d.typewriter !== "off" && d.motion !== "off" && !reduced;
}

function finishTyping() {
  if (!typing) return;
  typing.box.textContent = typing.full;
  typing.box.removeAttribute("aria-hidden");
  stopTyping();
}

function stopTyping() {
  if (typing) window.clearInterval(typing.timer);
  typing = null;
}

export function hideDialog() {
  stopTyping();
  queue = [];
  onDone = null;
  el.classList.add("hidden");
}

export function dialogVisible() {
  return el && !el.classList.contains("hidden");
}

/** 内容提示（首次进入）：涉及话题与建议年龄、求助入口 */
export function showNotice(onOk) {
  const overlay = document.getElementById("overlay");
  const box = document.createElement("div");
  box.className = "panel notice";
  box.setAttribute("role", "alertdialog");
  box.setAttribute("aria-label", "内容提示");
  box.innerHTML = `
    <div class="panel-head"><h2>开始之前</h2></div>
    <div class="panel-body">
      <p>这是一款把《高性价比人生指南》640 条建议做成行走小镇的 RPG。书里的建议原文照收，涉及 <b>意外与急救、慢性病、金钱与诈骗、法律红线、生育与养育、自杀预防</b> 等话题；数值是游戏设定，界面会标注。</p>
      <p>游戏是简化模型，<b>不构成医疗或法律建议</b>；真实紧急情况请拨 <b>120</b>（急救）或 <b>110</b>（报警）。心理援助热线 <b>12356</b>，反诈专线 <b>96110</b>。</p>
      <p>建议阅读年龄：<b>18 岁以上</b>。菜单里常驻"求助与热线"。</p>
    </div>
    <div class="panel-actions"><button class="btn primary" id="notice-ok">我知道了</button></div>
  `;
  overlay.appendChild(box);
  box.querySelector("#notice-ok").focus();
  box.querySelector("#notice-ok").addEventListener("click", () => {
    box.remove();
    onOk();
  });
}
