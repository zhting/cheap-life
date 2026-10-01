/**
 * a11y.js —— aria-live 播报与焦点管理。
 * 对话和战斗结果写入 aria-live 区域；面板打开时焦点进面板、关闭时归还。
 */

let live = null;

export function initA11y(container) {
  live = document.createElement("div");
  live.className = "sr-only";
  live.setAttribute("aria-live", "polite");
  live.setAttribute("role", "status");
  container.appendChild(live);
}

export const A11Y = {
  say(text) {
    if (!live) return;
    live.textContent = "";
    window.setTimeout(() => { live.textContent = text; }, 30);
  },
  /** 打开面板时把焦点移进去，关闭时归还 */
  focusPanel(panelEl) {
    const target = panelEl.querySelector("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (target) target.focus();
  },
  trap(panelEl, e) {
    if (e.key !== "Tab") return;
    const items = panelEl.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])");
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  },
};
