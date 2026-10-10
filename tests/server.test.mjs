/**
 * server.test.mjs —— 后端：注册登录、会话、云存档的重放校验与乐观锁、走完一生归档。
 * 用内存数据库起一个真实 HTTP 服务器，按浏览器的方式带 Cookie 请求。
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../server/db.mjs";
import { createApp } from "../server/app.mjs";
import { create, apply, legal } from "../src/core/game.js";
import { RULES_VERSION } from "../src/core/params.js";

let server;
let base;

before(async () => {
  const dist = mkdtempSync(join(tmpdir(), "hli-dist-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>t</title>");
  const db = openDb(":memory:");
  server = http.createServer(createApp({ db, distDir: dist }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

/** 带 Cookie 罐的小客户端 */
function client() {
  let cookie = "";
  return async function call(method, path, body, headers) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}), ...(headers || {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON */ }
    return { status: res.status, json, headers: res.headers, text };
  };
}

/** 用内核走 n 条合法命令，得到一份真实存档 */
function playLog(seed, n, untilEnd) {
  const { state } = create(seed, { reroll: 0 });
  const log = [];
  let guard = 0;
  while (!state.ended && guard++ < 3000 && (untilEnd || log.length < n)) {
    const L = legal(state);
    if (!L.length) break;
    const f = L.find((o) => o.cmd === "fight");
    const r = L.find((o) => o.cmd === "refuse");
    const l = L.find((o) => o.cmd === "learn");
    const t = L.find((o) => o.cmd === "talk");
    const cmd = f ? ["fight", f.id, [["retreat"]]] : r ? ["refuse", r.id] : l ? ["learn", l.id] : t ? ["talk", t.id] : ["end"];
    if (apply(state, cmd).ok) log.push(cmd);
    else if (apply(state, ["end"]).ok) log.push(["end"]);
  }
  return { save: { v: RULES_VERSION, seed, opts: { reroll: 0 }, log }, state };
}

test("页面与健康检查", async () => {
  const call = client();
  const page = await call("GET", "/");
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type"), /text\/html/);
  assert.ok(page.headers.get("content-security-policy"));
  assert.equal((await call("GET", "/api/health")).json.ok, true);
  assert.equal((await call("GET", "/../package.json")).status, 404);
});

test("注册、查重、登录、退出", async () => {
  const a = client();
  const anon = await a("GET", "/api/me");
  assert.equal(anon.status, 200);
  assert.equal(anon.json.user, null);
  const reg = await a("POST", "/api/auth/register", { username: "小明", password: "secret123" });
  assert.equal(reg.status, 201);
  assert.equal(reg.json.user.username, "小明");
  assert.match(reg.headers.get("set-cookie"), /HttpOnly/);
  assert.match(reg.headers.get("set-cookie"), /SameSite=Lax/);
  assert.equal((await a("GET", "/api/me")).json.user.username, "小明");

  const b = client();
  const dup = await b("POST", "/api/auth/register", { username: "小明", password: "another1" });
  assert.equal(dup.status, 409);
  assert.equal(dup.json.field, "username");
  assert.equal((await b("POST", "/api/auth/register", { username: "x", password: "secret123" })).status, 400);
  assert.equal((await b("POST", "/api/auth/register", { username: "bob<script>", password: "secret123" })).status, 400);
  assert.equal((await b("POST", "/api/auth/register", { username: "bobby", password: "123" })).json.field, "password");

  assert.equal((await b("POST", "/api/auth/login", { username: "小明", password: "wrong-pass" })).status, 401);
  assert.equal((await b("POST", "/api/auth/login", { username: "nobody", password: "wrong-pass" })).status, 401);
  const ok = await b("POST", "/api/auth/login", { username: " 小明 ", password: "secret123" });
  assert.equal(ok.status, 200);
  assert.equal((await b("GET", "/api/me")).json.user.username, "小明");
  await b("POST", "/api/auth/logout", {});
  assert.equal((await b("GET", "/api/me")).json.user, null);
  assert.equal((await b("GET", "/api/save")).status, 401);
  // 另一端的会话不受影响
  assert.equal((await a("GET", "/api/me")).json.user.username, "小明");
});

test("用户名不分大小写查重", async () => {
  const a = client();
  assert.equal((await a("POST", "/api/auth/register", { username: "Alice", password: "secret123" })).status, 201);
  assert.equal((await client()("POST", "/api/auth/register", { username: "alice", password: "secret123" })).status, 409);
  assert.equal((await client()("POST", "/api/auth/login", { username: "ALICE", password: "secret123" })).status, 200);
});

test("改动类请求必须是 JSON（防跨站表单）", async () => {
  const res = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "username=a&password=b" });
  assert.equal(res.status, 415);
});

test("云存档：读写、重放校验、版本冲突、强制覆盖、放弃", async () => {
  const a = client();
  await a("POST", "/api/auth/register", { username: "存档测试", password: "secret123" });
  const empty = await a("GET", "/api/save");
  assert.equal(empty.json.save, null);
  assert.equal(empty.json.rev, 0);

  const { save, state } = playLog(4242, 12);
  const put = await a("PUT", "/api/save", { save, rev: 0 });
  assert.equal(put.status, 200, put.text);
  assert.equal(put.json.rev, 1);
  assert.equal(put.json.summary.chapter, state.chapter);
  assert.equal(put.json.summary.age, state.age);

  const got = await a("GET", "/api/save");
  assert.deepEqual(got.json.save, save);
  assert.equal(got.json.rev, 1);

  // 另一台设备拿着旧版本号写 → 409，带上服务器当前的摘要
  const stale = await a("PUT", "/api/save", { save, rev: 0 });
  assert.equal(stale.status, 409);
  assert.equal(stale.json.rev, 1);
  assert.ok(stale.json.summary);
  // 确认覆盖
  const forced = await a("PUT", "/api/save", { save, rev: 0, force: true });
  assert.equal(forced.json.rev, 2);

  // 重放不过的日志拒收
  const bad = { ...save, log: save.log.concat([["learn", "999.999"]]) };
  assert.equal((await a("PUT", "/api/save", { save: bad, rev: 2 })).status, 422);
  assert.equal((await a("PUT", "/api/save", { save: { ...save, v: RULES_VERSION + 1 }, rev: 2 })).status, 422);
  assert.equal((await a("PUT", "/api/save", { save: { ...save, log: [["rm", "-rf"]] }, rev: 2 })).status, 400);
  assert.equal((await a("GET", "/api/save")).json.rev, 2);

  // 别人读不到
  const b = client();
  await b("POST", "/api/auth/register", { username: "旁人", password: "secret123" });
  assert.equal((await b("GET", "/api/save")).json.save, null);

  assert.equal((await a("DELETE", "/api/save", { rev: 2 })).status, 200);
  assert.equal((await a("GET", "/api/save")).json.save, null);
});

test("未登录不能读写存档", async () => {
  const anon = client();
  assert.equal((await anon("GET", "/api/save")).status, 401);
  assert.equal((await anon("PUT", "/api/save", { save: {}, rev: 0 })).status, 401);
  assert.equal((await anon("GET", "/api/runs")).status, 401);
});

test("走完一生：存档归档成人生记录，重复提交不重复记", async () => {
  const a = client();
  await a("POST", "/api/auth/register", { username: "长寿", password: "secret123" });
  const mid = playLog(777, 6);
  const p1 = await a("PUT", "/api/save", { save: mid.save, rev: 0 });
  const full = playLog(777, 0, true);
  assert.ok(full.state.ended, "测试局应当走完");
  const fin = await a("PUT", "/api/save", { save: full.save, rev: p1.json.rev });
  assert.equal(fin.status, 200, fin.text);
  assert.equal(fin.json.ended, true);
  assert.equal(fin.json.run.score, full.state.ended.score);
  assert.equal((await a("GET", "/api/save")).json.save, null);
  // 网络重试再发一次：不新增记录
  const again = await a("PUT", "/api/save", { save: full.save, rev: 99 });
  assert.equal(again.json.run.id, fin.json.run.id);
  const runs = await a("GET", "/api/runs");
  assert.equal(runs.json.total, 1);
  assert.equal(runs.json.best, full.state.ended.score);
  assert.equal(runs.json.runs[0].age, full.state.ended.age);
});

test("登录限流", async () => {
  const c = client();
  const headers = {};
  let last = 0;
  for (let i = 0; i < 25; i++) {
    last = (await c("POST", "/api/auth/login", { username: "nobody", password: "whatever1" }, headers)).status;
  }
  assert.equal(last, 429);
});
