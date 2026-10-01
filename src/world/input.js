/**
 * input.js —— 键盘、点击、十字键输入。
 * 桌面：WASD/方向键移动，空格/回车/E 交互，Esc/M 菜单。
 * 手机：点击地面自动寻路；点击 NPC/门/标记交互；可选十字键。
 */

import { TILE } from "./palette.js";

export function makeInput(canvas, _opts) {
  const held = { up: false, down: false, left: false, right: false };
  const KEYMAP = {
    ArrowUp: "up", KeyW: "up",
    ArrowDown: "down", KeyS: "down",
    ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right",
  };
  const listeners = { key: [], tap: [], interact: [], menu: [] };
  const state = { held, enabled: true };

  function emit(kind, arg) {
    for (const fn of listeners[kind]) fn(arg);
  }

  window.addEventListener("keydown", (e) => {
    if (!state.enabled) return;
    const k = KEYMAP[e.code];
    if (k) {
      held[k] = true;
      e.preventDefault();
      return;
    }
    if (e.code === "Space" || e.code === "Enter" || e.code === "KeyE") {
      emit("interact", null);
      e.preventDefault();
    } else if (e.code === "Escape" || e.code === "KeyM") {
      emit("menu", null);
      e.preventDefault();
    } else if (e.code.indexOf("Digit") === 0) {
      emit("key", Number(e.code.slice(5)));
    } else {
      emit("key", e.code);
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = KEYMAP[e.code];
    if (k) held[k] = false;
  });
  window.addEventListener("blur", () => {
    held.up = held.down = held.left = held.right = false;
  });

  /** 画布点击 → 逻辑格坐标（乘缩放前先换算 CSS 像素） */
  function toGrid(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const cy = (e.clientY - rect.top) * (canvas.height / rect.height);
    return { cx, cy };
  }
  canvas.addEventListener("pointerdown", (e) => {
    if (!state.enabled) return;
    const { cx, cy } = toGrid(e);
    emit("tap", { cx, cy, gridX: Math.floor(cx / TILE), gridY: Math.floor(cy / TILE) });
    e.preventDefault();
  });

  /** 十字键（DOM 按钮）长按 */
  function bindDpad(el) {
    if (!el) return;
    const press = (k, on) => (e) => {
      held[k] = on;
      e.preventDefault();
    };
    for (const k of ["up", "down", "left", "right"]) {
      const btn = el.querySelector("[data-dir='" + k + "']");
      if (!btn) continue;
      btn.addEventListener("pointerdown", press(k, true));
      btn.addEventListener("pointerup", press(k, false));
      btn.addEventListener("pointerleave", press(k, false));
      btn.addEventListener("pointercancel", press(k, false));
    }
    const act = el.querySelector("[data-act='interact']");
    if (act) act.addEventListener("pointerdown", (e) => { emit("interact", null); e.preventDefault(); });
  }

  return {
    state,
    held,
    on(kind, fn) { listeners[kind].push(fn); },
    bindDpad,
  };
}
