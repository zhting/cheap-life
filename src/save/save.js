/**
 * save.js —— 本地存档与存档码。
 * 存档 = 种子 + 选项 + 命令日志，没有状态本身；状态永远由重放得到。
 * 自动存档：每条成功命令后写 localStorage，try/catch 包裹；不可用时游戏照常进行。
 * 存档码：JSON 压缩（CompressionStream deflate-raw，不支持则不压缩）后 base64url，
 * 前缀 1（压缩）/0（原始）。只存当前一局，结局后清除，没有跨局数据。
 */
import { RULES_VERSION } from "../core/params.js";

const KEY = "hli-save-v1";

export function storageAvailable() {
  try {
    const k = "__hli_test__";
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

export function writeSave(save) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function readSave() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch { /* 存储不可用时忽略 */ }
}

function b64urlFromBytes(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(str) {
  const b64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deflate(text) {
  try {
    if (typeof CompressionStream === "undefined") return null;
    const cs = new CompressionStream("deflate-raw");
    const stream = new Blob([text]).stream().pipeThrough(cs);
    const buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  } catch {
    return null;
  }
}

async function inflate(bytes) {
  try {
    if (typeof DecompressionStream === "undefined") return null;
    const ds = new DecompressionStream("deflate-raw");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const text = await new Response(stream).text();
    return text;
  } catch {
    return null;
  }
}

/** 存档对象 → 存档码（异步） */
export async function encodeSave(save) {
  const json = JSON.stringify(save);
  const packed = await deflate(json);
  if (packed) return "1" + b64urlFromBytes(packed);
  return "0" + b64urlFromBytes(new TextEncoder().encode(json));
}

/** 存档码 → 存档对象（异步）；无效返回 null */
export async function decodeSave(code) {
  if (typeof code !== "string" || code.length < 2) return null;
  const flag = code[0];
  const body = code.slice(1);
  try {
    if (flag === "1") {
      const text = await inflate(bytesFromB64url(body));
      if (!text) return null;
      return JSON.parse(text);
    }
    if (flag === "0") {
      return JSON.parse(new TextDecoder().decode(bytesFromB64url(body)));
    }
  } catch {
    return null;
  }
  return null;
}

/** 读档校验：格式（版本、种子 32 位整数、命令名白名单） */
export function validateSaveShape(save, commandNames) {
  const names = commandNames || [];
  if (!save || typeof save !== "object") return false;
  if (save.v !== RULES_VERSION) return false;
  if (!Number.isInteger(save.seed) || save.seed < 0 || save.seed > 4294967295) return false;
  if (!save.opts || typeof save.opts !== "object") return false;
  if (!Array.isArray(save.log)) return false;
  for (const cmd of save.log) {
    if (!Array.isArray(cmd) || typeof cmd[0] !== "string") return false;
    if (names.indexOf(cmd[0]) < 0) return false;
  }
  return true;
}

export function makeSave(seed, opts, log) {
  return { v: RULES_VERSION, seed, opts, log };
}
