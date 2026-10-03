/**
 * hud.js —— 顶部状态栏：第几章和年龄、季节与时段、四项状态条（图标+数字+条）、
 * 行动点 6 格、毅力槽已用/上限。手机竖屏两行（章节一行、四条一行），桌面横屏一行。
 */
import { SEG_NAMES, SEASONS } from "../world/palette.js";

const BAR_META = [
  { key: "health", icon: "♥", label: "健康" },
  { key: "money", icon: "¥", label: "积蓄", unit: "千" },
  { key: "energy", icon: "⚡", label: "精力" },
  { key: "freedom", icon: "⚖", label: "自由" },
];

export function renderHud(el, view) {
  if (!view) return;
  const season = SEASONS[(view.chapter - 1) % 4];
  const segName = SEG_NAMES[view.segment % 6] || "";
  const parts = [];
  parts.push(`<div class="hud-chapter">第${cn(view.chapter)}章 · ${view.age}岁<span class="hud-time">${season.name} · ${segName}</span></div>`);
  parts.push('<div class="hud-bars">');
  for (const m of BAR_META) {
    const v = view.bars[m.key];
    const warn = m.key === "money" ? v < 0 : v <= 25;
    const pct = m.key === "money"
      ? Math.max(0, Math.min(100, ((v + 100) / 400) * 100))
      : Math.max(0, Math.min(100, v));
    parts.push(
      `<div class="hud-bar hud-${m.key}${warn ? " warn" : ""}" title="${m.label} ${Math.round(v)}${m.unit || ""}">` +
      `<span class="hud-icon" aria-hidden="true">${m.icon}</span>` +
      `<span class="hud-num">${Math.round(v)}</span>` +
      `<span class="hud-track"><span class="hud-fill" style="width:${pct}%"></span></span>` +
      `</div>`
    );
  }
  parts.push("</div>");
  parts.push(`<div class="hud-aps" title="行动点 ${view.ap}/6">`);
  for (let i = 0; i < 6; i++) {
    parts.push(`<span class="hud-ap${i < view.ap ? " on" : ""}"></span>`);
  }
  parts.push("</div>");
  parts.push(`<div class="hud-will" title="毅力：已用/上限">毅力 ${view.willUsed}/${view.willCap}</div>`);
  el.innerHTML = parts.join("");
  el.setAttribute("aria-label", `第${cn(view.chapter)}章，${view.age}岁，${season.name}季${segName}，健康${Math.round(view.bars.health)}，积蓄${Math.round(view.bars.money)}千元，精力${Math.round(view.bars.energy)}，自由${Math.round(view.bars.freedom)}，行动点${view.ap}`);
}

function cn(n) {
  const digits = "零一二三四五六七八九十";
  if (n <= 10) return digits[n];
  if (n < 20) return "十" + digits[n - 10];
  return digits[Math.floor(n / 10)] + "十" + (n % 10 ? digits[n % 10] : "");
}
