/**
 * rng.js —— sfc32 随机流。每个用途一条独立流，由 "seed:用途名:序号" 经 FNV-1a
 * 派生 4 个 32 位初值，预热 12 次。流的状态不存进游戏状态，多抽一次不影响别处。
 * 用途名只用 ASCII（避免编码差异）。内核里禁止 Math.random / Date（lint 强制）。
 */

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** FNV-1a 32 位：字符串 → 32 位整数 */
export function fnv1a(str) {
  let h = FNV_OFFSET >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h >>> 0;
}

function sfc32(a, b, c, d) {
  return function next() {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
}

/** 由 "seed:purpose:ordinal" 派生一条独立流 */
export function stream(seed, purpose, ordinal = 0) {
  const base = fnv1a(`${seed}:${purpose}:${ordinal}`);
  const a = fnv1a(`a${base}`);
  const b = fnv1a(`b${base}`);
  const c = fnv1a(`c${base}`);
  const d = fnv1a(`d${base}`);
  const next = sfc32(a, b, c, d);
  for (let i = 0; i < 12; i++) next(); // 预热
  return next;
}

/** [0,1) 随机数 */
export function unit(next) {
  return next();
}

/** [lo, hi) 区间随机整数：随机数 × n ÷ 2^32 向下取整；n 小于 2^31，乘积在双精度里精确 */
export function int(next, lo, hi) {
  const n = hi - lo;
  if (n <= 0) return lo;
  return lo + Math.floor(next() * 4294967296 % n);
}

/** 千分比概率命中 */
export function permille(next, p) {
  return int(next, 0, 1000) < p;
}

/** 万分比概率命中 */
export function basisPoint(next, p) {
  return int(next, 0, 10000) < p;
}

/** 按权重抽一个下标（累计权重加一次随机数，不用对数和幂函数） */
export function weightedIndex(next, weights) {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return 0;
  let r = Math.floor(next() * 4294967296 % total);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Fisher-Yates 洗牌（用给定的流） */
export function shuffle(next, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = int(next, 0, i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** 从候选里无放回抽 k 个（洗牌袋） */
export function sample(next, arr, k) {
  const copy = arr.slice();
  shuffle(next, copy);
  return copy.slice(0, Math.min(k, copy.length));
}
