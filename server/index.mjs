/**
 * index.mjs —— 启动游戏服务器：node server/index.mjs
 *
 * 环境变量：
 *   PORT            监听端口，默认 8080
 *   HOST            监听地址，默认 0.0.0.0
 *   DB_PATH         SQLite 文件，默认 var/cheap-life.db
 *   COOKIE_SECURE   设为 1 时 Cookie 带 Secure（走 HTTPS 时打开）
 *   TRUST_PROXY     设为 1 时按 X-Forwarded-For 识别客户端 IP（在 Nginx 等反代后面时打开）
 */
import http from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { openDb } from "./db.mjs";
import { createApp } from "./app.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
if (!existsSync(join(distDir, "index.html"))) {
  console.error("找不到 dist/index.html，先运行 npm run build");
  process.exit(1);
}

const db = openDb(process.env.DB_PATH || join(root, "var", "cheap-life.db"));
const handler = createApp({
  db,
  distDir,
  secureCookies: process.env.COOKIE_SECURE === "1",
  trustProxy: process.env.TRUST_PROXY === "1",
});

const port = Number(process.env.PORT) || 8080;
const host = process.env.HOST || "0.0.0.0";
const server = http.createServer(handler);
server.listen(port, host, () => console.log(`cheap-life 服务器已启动：http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`));

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
