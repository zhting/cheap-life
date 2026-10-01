// 开发用静态服务器：serve dist/，node tools/serve.mjs [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const port = Number(process.argv[2]) || 8019;

http.createServer(async (req, res) => {
  let urlPath = req.url.split("?")[0];
  if (urlPath === "/" || urlPath === "\\") urlPath = "/index.html";
  const file = join(root, normalize(urlPath).replace(/^([.][.][/\\])+/, ""));
  try {
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("not found");
  }
}).listen(port, () => console.log(`serving dist on http://127.0.0.1:${port}`));
