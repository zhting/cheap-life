/**
 * settings.js —— 设置面板：音效、字号、十字键、减少动效、逐字显示、主题、
 * 求助与热线、关于与署名。设置存 localStorage（不可用时仅本局生效）。
 */
import { closePanel, panelOpen } from "./panels.js";

const KEY = "hli-settings";
const DEFAULTS = { sound: false, font: "m", dpad: "auto", motion: true, typewriter: true, theme: "auto" };

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULTS };
}

export function saveSettings(s) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

export function applySettings(s) {
  document.documentElement.dataset.theme = s.theme;
  document.documentElement.dataset.font = s.font;
  document.documentElement.dataset.dpad = s.dpad;
  document.documentElement.dataset.motion = s.motion ? "on" : "off";
  document.documentElement.dataset.typewriter = s.typewriter ? "on" : "off";
  const wrap = document.getElementById("dpad-wrap");
  if (wrap) {
    const portrait = window.matchMedia("(pointer: coarse)").matches;
    wrap.style.display = s.dpad === "on" || (s.dpad === "auto" && portrait) ? "" : "none";
  }
}

export function showSettingsPanel(current, onChange) {
  const p0 = current;
  const s = { ...p0 };
  const box = document.createElement("div");
  box.className = "panel settings";
  box.innerHTML = `
    <div class="panel-head"><button class="btn back" data-back aria-label="返回">←</button><h2>设置</h2></div>
    <div class="panel-body">
      <label class="set-row"><input type="checkbox" id="set-sound" ${s.sound ? "checked" : ""}> 音效（默认静音，开启后播放合成音）</label>
      <label class="set-row">字号
        <select id="set-font">
          <option value="s" ${s.font === "s" ? "selected" : ""}>小</option>
          <option value="m" ${s.font === "m" ? "selected" : ""}>中</option>
          <option value="l" ${s.font === "l" ? "selected" : ""}>大</option>
        </select>
      </label>
      <label class="set-row">十字键
        <select id="set-dpad">
          <option value="auto" ${s.dpad === "auto" ? "selected" : ""}>自动</option>
          <option value="on" ${s.dpad === "on" ? "selected" : ""}>显示</option>
          <option value="off" ${s.dpad === "off" ? "selected" : ""}>隐藏（用点击寻路）</option>
        </select>
      </label>
      <label class="set-row"><input type="checkbox" id="set-motion" ${s.motion ? "checked" : ""}> 动效（受击抖动、数字飘字、章节淡入）</label>
      <label class="set-row"><input type="checkbox" id="set-tw" ${s.typewriter ? "checked" : ""}> 逐字显示</label>
      <label class="set-row">主题
        <select id="set-theme">
          <option value="auto" ${s.theme === "auto" ? "selected" : ""}>跟随系统</option>
          <option value="light" ${s.theme === "light" ? "selected" : ""}>浅色</option>
          <option value="dark" ${s.theme === "dark" ? "selected" : ""}>深色</option>
        </select>
      </label>
      <div class="menu-section"><b>求助与热线</b>
        <div class="hotlines">
          <div class="hotline"><b>120</b> 急救</div>
          <div class="hotline"><b>110</b> 报警</div>
          <div class="hotline"><b>96110</b> 反诈专线</div>
          <div class="hotline"><b>12356</b> 心理援助热线</div>
        </div>
      </div>
      <div class="menu-section about">
        <b>关于与署名</b>
        <p>《高性价比人生》像素小镇 RPG。改编自 <a href="https://github.com/eternity4719/HowToLiveBetter" target="_blank" rel="noopener">eternity4719/HowToLiveBetter</a>《高性价比人生指南》，CC BY 4.0，已做游戏化改编与摘录。游戏代码全部新写。</p>
        <p>游戏是简化模型，不构成医疗或法律建议；真实紧急情况请拨 120 或 110。</p>
        <p>不收集数据：没有账号、统计和外部请求（Google Fonts 字体除外，加载失败回退系统字体）。</p>
      </div>
    </div>
    <div class="panel-actions"><button class="btn primary" data-back>完成</button></div>
  `;
  if (panelOpen()) closePanel();
  document.getElementById("overlay").appendChild(box);
  box.querySelector("#set-sound").addEventListener("change", (e) => { s.sound = e.target.checked; onChange(s); });
  box.querySelector("#set-font").addEventListener("change", (e) => { s.font = e.target.value; onChange(s); });
  box.querySelector("#set-dpad").addEventListener("change", (e) => { s.dpad = e.target.value; onChange(s); });
  box.querySelector("#set-motion").addEventListener("change", (e) => { s.motion = e.target.checked; onChange(s); });
  box.querySelector("#set-tw").addEventListener("change", (e) => { s.typewriter = e.target.checked; onChange(s); });
  box.querySelector("#set-theme").addEventListener("change", (e) => { s.theme = e.target.value; onChange(s); });
  box.querySelector("[data-back]").addEventListener("click", () => box.remove());
  return box;
}
