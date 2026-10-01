/**
 * hash.js —— 规范化序列化与 FNV-1a。hash(state) 用于确定性检查：
 * 键按字典序、数组保持顺序，对规范化字符串做 FNV-1a。
 * 测试里把同一份命令日志在 Node 和 Chromium 各重放一次，哈希必须相同。
 */

export function normalize(value) {
  const t = typeof value;
  if (value === null) return "null";
  if (t === "number") {
    // 整数与有限小数都按最短表示；-0 归一为 0
    if (Object.is(value, -0)) return "0";
    return String(value);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (i) out += ",";
      out += normalize(value[i]);
    }
    return out + "]";
  }
  if (t === "object") {
    const keys = Object.keys(value).sort();
    let out = "{";
    for (let i = 0; i < keys.length; i++) {
      if (i) out += ",";
      out += JSON.stringify(keys[i]) + ":" + normalize(value[keys[i]]);
    }
    return out + "}";
  }
  // undefined / 函数等不该出现在状态里
  return "undefined";
}

export function hashState(state) {
  return normalize(state);
}

export function hash32(state) {
  let h = 0x811c9dc5;
  const s = normalize(state);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
