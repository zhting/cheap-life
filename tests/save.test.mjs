/**
 * save.test.mjs —— 存档与存档码：压缩往返、格式校验拒绝非法档。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeSave, decodeSave, validateSaveShape, makeSave } from "../src/save/save.js";
import { create, apply, legal, replay, hash } from "../src/core/game.js";
import { RULES_VERSION } from "../src/core/params.js";

test("存档码：编码 → 解码往返一致", async () => {
  const save = makeSave(12345, { reroll: 0 }, [["talk", "hospital"], ["learn", "1.7"], ["end"]]);
  const code = await encodeSave(save);
  assert.ok(code.length > 2);
  assert.ok(code[0] === "0" || code[0] === "1", "前缀必须是压缩标记");
  const back = await decodeSave(code);
  assert.deepEqual(back, save);
});

test("存档码：无效输入返回 null", async () => {
  assert.equal(await decodeSave(""), null);
  assert.equal(await decodeSave("xx"), null);
  assert.equal(await decodeSave("9!!!"), null);
});

test("读档校验：版本、种子、命令名白名单", async () => {
  const good = makeSave(12345, {}, [["end"]]);
  assert.equal(validateSaveShape(good, ["end"]), true);
  assert.equal(validateSaveShape({ ...good, v: RULES_VERSION + 1 }, ["end"]), false);
  assert.equal(validateSaveShape({ ...good, seed: -1 }, ["end"]), false);
  assert.equal(validateSaveShape({ ...good, log: [["hack"]] }), false);
  assert.equal(validateSaveShape({ ...good, log: "no" }), false);
});

test("存档重放：真实日志重放得到同一状态", () => {
  const seed = 777777;
  const { state } = create(seed, {});
  const log = [];
  for (let i = 0; i < 30 && !state.ended; i++) {
    const opts = legal(state);
    if (!opts.length) break;
    const pick = opts[i % opts.length];
    let cmd;
    if (pick.cmd === "talk") cmd = ["talk", pick.building];
    else if (pick.cmd === "learn") cmd = ["learn", pick.id];
    else if (pick.cmd === "fight") cmd = ["fight", pick.id, [["retreat"]]];
    else if (pick.cmd === "engage") cmd = ["engage", pick.id];
    else if (pick.cmd === "peek") cmd = ["peek", pick.id];
    else if (pick.cmd === "refuse") cmd = ["refuse", pick.id];
    else if (pick.cmd === "accept") cmd = ["accept", pick.id];
    else if (pick.cmd === "drop") cmd = ["drop", pick.id];
    else cmd = ["end"];
    const r = apply(state, cmd);
    if (!r.ok) break;
    log.push(cmd);
  }
  const again = replay(seed, {}, log);
  assert.ok(again.ok);
  assert.equal(hash(again.state), hash(state));
});
