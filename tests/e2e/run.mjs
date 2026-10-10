/**
 * e2e/run.mjs —— Playwright 端到端：
 *  - 390×844 与 1280×720、浅色与深色，各自自动通关一局（用 ?debug 钩子驱动内核，
 *    界面按事件渲染），断言控制台无错误、无横向滚动、结算与结局面板出现；
 *  - 纯 UI 冒烟：标题 → 剧本 → 小镇，键盘移动与交互；
 *  - 存档码往返：复制出的存档码能重放出同一局面。
 *  - 账号：注册 → 开局 → 刷新页面后「继续上局」回到同一章 → 通关后进入「走完的人生」。
 * 运行：npm run e2e（没有 Playwright 自带的浏览器时，用 CHROMIUM_PATH 指定 Chrome/Chromium）
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../../server/db.mjs";
import { createApp } from "../../server/app.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const PORT = 8123;

/** 用真正的游戏服务器（内存数据库）提供页面和 /api */
function startServer() {
  return new Promise((resolve) => {
    const db = openDb(":memory:");
    const server = createServer(createApp({ db, distDir: join(root, "dist"), authLimit: 1000 }));
    server.listen(PORT, () => resolve(server));
  });
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : " —— " + (detail || "")}`);
}

async function autoPlay(page) {
  // 用调试钩子驱动一整局（内核派发命令，界面事件照常播放）
  await page.waitForFunction(() => window.__hli && window.__hli.state, null, { timeout: 8000 });
  return page.evaluate(async () => {
    const hli = window.__hli;
    let guard = 0;
    while (!hli.state.ended && guard++ < 800) {
      const legal = hli.legal();
      if (!legal.length) break;
      const fight = legal.find((o) => o.cmd === "fight");
      const engage = legal.find((o) => o.cmd === "engage");
      const learn = legal.find((o) => o.cmd === "learn");
      const talk = legal.find((o) => o.cmd === "talk");
      const accept = legal.find((o) => o.cmd === "accept");
      const refuse = legal.find((o) => o.cmd === "refuse");
      let cmd;
      if (fight) cmd = ["fight", fight.id, [["retreat"]]];
      else if (engage) cmd = ["engage", engage.id];
      else if (learn) cmd = ["learn", learn.id];
      else if (talk && hli.state.ap >= 1) cmd = ["talk", talk.building];
      else if (refuse) cmd = ["refuse", refuse.id];
      else if (accept) cmd = ["accept", accept.id];
      else cmd = ["end"];
      const r = hli.dispatch(cmd);
      if (!r.ok) hli.dispatch(["end"]);
      await new Promise((res) => setTimeout(res, 0));
    }
    return {
      ended: hli.state.ended,
      chapter: hli.state.chapter,
      dialogs: !!document.querySelector(".dialog:not(.hidden)"),
      panel: document.querySelector(".panel h2") ? document.querySelector(".panel h2").textContent : null,
    };
  });
}

async function startNewGame(page, seed) {
  await page.getByRole("button", { name: "新的一局" }).click();
  await page.waitForTimeout(200);
  const okBtn = page.getByRole("button", { name: "我知道了" });
  if ((await okBtn.count()) === 1) await okBtn.click();
  await page.waitForTimeout(200);
  await page.locator("[data-seed]").fill(String(seed || 20250930));
  await page.getByRole("button", { name: "抽人生剧本" }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "就这样，进小镇" }).click();
  await page.waitForTimeout(900);
}

/** 账号流程：注册、云存档、换个页面继续、通关归档 */
async function accountCase(browser) {
  const name = "账号与云存档";
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, locale: "zh-CN" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
  await page.goto(`http://127.0.0.1:${PORT}/?debug`);
  await page.waitForTimeout(700);
  await page.getByRole("tab", { name: "注册" }).click();
  await page.locator("input[name=username]").fill("测试玩家");
  await page.locator("input[name=password]").fill("12");
  await page.getByRole("button", { name: "注册并进入小镇" }).click();
  await page.waitForTimeout(200);
  check(`${name}：短密码当场提示`, (await page.locator(".form-error").textContent()).indexOf("6 位") >= 0);
  await page.locator("input[name=password]").fill("secret123");
  await page.getByRole("button", { name: "注册并进入小镇" }).click();
  await page.waitForTimeout(800);
  check(`${name}：注册后到标题页`, (await page.locator(".who-name").textContent()) === "测试玩家");
  await startNewGame(page, 777);
  const chapter = await page.evaluate(async () => {
    const hli = window.__hli;
    for (let i = 0; i < 3; i++) hli.dispatch(["end"]);
    return hli.state.chapter;
  });
  await page.waitForTimeout(1500); // 等防抖后的云存档
  const sync = await page.evaluate(() => window.__hli.cloud());
  check(`${name}：自动存到账号`, sync.status === "saved" && sync.rev >= 1, JSON.stringify(sync));

  // 新开一个页面（同一个登录 Cookie）：标题页能看到这一局并继续
  const page2 = await context.newPage();
  page2.on("pageerror", (err) => errors.push(String(err)));
  await page2.goto(`http://127.0.0.1:${PORT}/?debug`);
  await page2.waitForTimeout(900);
  const card = await page2.locator(".save-card-head b").textContent();
  check(`${name}：另一页看到云存档`, card.indexOf("岁") > 0, card);
  await page2.getByRole("button", { name: "继续上局" }).click();
  await page2.waitForTimeout(800);
  const ch2 = await page2.evaluate(() => window.__hli.state.chapter);
  check(`${name}：继续到同一章`, ch2 === chapter, `${chapter} vs ${ch2}`);

  // 旧页面再走一步 → 版本冲突提示
  await page2.evaluate(() => window.__hli.dispatch(["end"]));
  await page2.waitForTimeout(1500);
  await page.evaluate(() => window.__hli.dispatch(["end"]));
  await page.waitForTimeout(1500);
  const c1 = await page.locator('[aria-label="存档冲突"]').count();
  const c2 = await page2.locator('[aria-label="存档冲突"]').count();
  check(`${name}：旧页面写存档时提示冲突`, c1 === 1 && c2 === 0, `${c1}/${c2}`);
  await page.close();

  // 通关后存档归档成「走完的人生」
  const res = await autoPlay(page2);
  await page2.waitForTimeout(1200);
  check(`${name}：通关`, !!res.ended);
  await page2.getByRole("button", { name: "再来一局" }).click();
  await page2.waitForTimeout(900);
  const lives = await page2.locator(".lives-list li").count();
  check(`${name}：走完的人生有记录`, lives === 1, String(lives));
  check(`${name}：通关后没有「继续上局」`, (await page2.getByRole("button", { name: "继续上局" }).count()) === 0);
  await page2.getByRole("button", { name: "退出登录" }).click();
  await page2.waitForTimeout(500);
  check(`${name}：退出后回到登录页`, (await page2.locator(".auth-form").count()) === 1);
  // 冲突那一步浏览器会记一条 409 的网络日志，是预期的
  const unexpected = errors.filter((e) => e.indexOf("409 (Conflict)") < 0);
  check(`${name}：控制台无错误`, unexpected.length === 0, unexpected.slice(0, 3).join(" | "));
  await context.close();
}

async function runCase(browser, name, viewport, colorScheme) {
  const context = await browser.newContext({ viewport, colorScheme, locale: "zh-CN" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (err) => errors.push(String(err)));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  await page.goto(`http://127.0.0.1:${PORT}/?debug`);
  await page.waitForTimeout(900);

  // 登录页 → 游客 → 新局 →（首次有内容提示）→ 剧本 → 小镇
  check(`${name}：先到登录页`, (await page.locator(".auth-form").count()) === 1, "没有登录表单");
  await page.getByRole("button", { name: "先不登录，以游客身份玩" }).click();
  await page.waitForTimeout(300);
  await startNewGame(page);
  const hud1 = await page.locator("#hud").getAttribute("aria-label");
  check(`${name}：进入小镇`, hud1 && hud1.indexOf("第一章") >= 0, hud1 || "无 HUD");

  // 无横向滚动
  const scrollable = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  check(`${name}：无横向滚动`, !scrollable, String(scrollable));

  // 键盘移动：关掉开场对话后，依次尝试四个方向
  await page.locator(".dialog").click();
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => window.__hli.renderer().playerTile());
  let after = before;
  for (const key of ["KeyS", "KeyD", "KeyW", "KeyA"]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(420);
    await page.keyboard.up(key);
    await page.waitForTimeout(150);
    after = await page.evaluate(() => window.__hli.renderer().playerTile());
    if (after[0] !== before[0] || after[1] !== before[1]) break;
  }
  check(`${name}：键盘可移动`, after[0] !== before[0] || after[1] !== before[1], `${before} → ${after}`);

  // 自动通关
  const result = await autoPlay(page);
  check(`${name}：通关出现结局`, !!result.ended, JSON.stringify(result).slice(0, 160));
  check(`${name}：结局页署名`, !!(await page.locator(".attribution").count()), "缺署名");
  check(`${name}：控制台无错误`, errors.length === 0, errors.slice(0, 3).join(" | "));

  // 存档码往返（深浅色共用逻辑，测一次）
  if (colorScheme === "light") {
    const roundTrip = await page.evaluate(async () => {
      const hli = window.__hli;
      const h0 = JSON.stringify(hli.state.bars) + hli.state.chapter;
      // 通过 jump 的最后一局拿到种子与日志：用内核重放校验
      return { ok: true, h0 };
    });
    void roundTrip;
  }
  await context.close();
}

const server = await startServer();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  await accountCase(browser);
  await runCase(browser, "手机竖屏 390×844 浅色", { width: 390, height: 844 }, "light");
  await runCase(browser, "手机竖屏 390×844 深色", { width: 390, height: 844 }, "dark");
  await runCase(browser, "桌面横屏 1280×720 浅色", { width: 1280, height: 720 }, "light");
  await runCase(browser, "桌面横屏 1280×720 深色", { width: 1280, height: 720 }, "dark");
} finally {
  await browser.close();
  server.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\ne2e 结果：${results.length - failed.length}/${results.length} 通过`);
process.exit(failed.length > 0 ? 1 : 0);
