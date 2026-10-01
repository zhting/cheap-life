/**
 * sfx.js —— WebAudio 合成音：脚步、确认、受击、答对、答错、章末。
 * 方波与噪声，无音频文件；默认静音，开启后播放。
 */

let ctx = null;
let enabled = false;

export function setSound(on) {
  enabled = on;
  if (on && !ctx) {
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      ctx = null;
    }
  }
}

function blip(freq, dur, type, vol) {
  if (!enabled || !ctx) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.value = vol || 0.04;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + dur);
  } catch { /* 忽略 */ }
}

function noise(dur, vol) {
  if (!enabled || !ctx) return;
  try {
    const n = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol || 0.05;
    n.connect(g);
    g.connect(ctx.destination);
    n.start();
  } catch { /* 忽略 */ }
}

export const sfx = {
  step() { blip(180, 0.03, "square", 0.015); },
  confirm() { blip(660, 0.08); },
  hit() { noise(0.12, 0.06); },
  correct() { blip(880, 0.1); blip(1174, 0.12); },
  wrong() { blip(220, 0.18, "sawtooth", 0.05); },
  chapter() { blip(523, 0.15); blip(659, 0.15); blip(784, 0.2); },
  coin() { blip(988, 0.06); blip(1319, 0.1); },
};
