# cheap-life · 高性价比人生

把《高性价比人生指南》的建议做成一座像素小镇：13 章、一局一辈子，走进建筑听建议、采纳习惯、应付意外和诈骗。

## 运行

需要 Node.js 22.13 或更新（后端用 Node 自带的 SQLite，不装额外依赖）。

```bash
npm ci
npm run build      # 生成 dist/index.html
npm start          # 启动服务器，默认 http://127.0.0.1:8080
```

打开页面先到登录页：

- **登录 / 注册**：进度存在服务器的数据库里，换设备登录接着玩；走完的一局会记进「走完的人生」。
- **游客**：进度只存在这台设备的浏览器里（和以前一样）。直接双击打开 `dist/index.html`、或者服务器连不上时，只能用游客模式。
- 登录后如果这台设备上还有游客进度，标题页会提示「存进账号」。

### 服务器配置（环境变量）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8080` | 监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DB_PATH` | `var/cheap-life.db` | SQLite 数据库文件；备份就是复制这个文件（连同 `-wal` 文件） |
| `COOKIE_SECURE` | 关 | 设为 `1` 时登录 Cookie 只走 HTTPS。正式上线走 HTTPS 时务必打开 |
| `TRUST_PROXY` | 关 | 设为 `1` 时按 `X-Forwarded-For` 识别客户端 IP（放在 Nginx 等反向代理后面时打开，登录限流才按真实 IP 计） |

## 云存档怎么工作

- 存档和以前一样只是「种子 + 选项 + 命令日志」。服务器收到存档会用同一个游戏内核重放一遍，重放不通过的一律拒收；章节、年龄等摘要也由服务器算。
- 每条命令后自动保存（停手 0.7 秒合并成一次请求）；断网时自动重试，关页面时用 keepalive 补发。
- 每份存档带版本号。同一个账号在两处同时玩，后写的一方会收到冲突提示，由玩家选「读取账号里的进度」或「用这里的覆盖账号」。
- 密码用 scrypt 加盐哈希；会话令牌放在 HttpOnly、SameSite=Lax 的 Cookie 里，数据库只存令牌的哈希，30 天有效。登录和注册按 IP 限流（15 分钟 20 次）。

### 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/register` | `{ username, password }`，注册并登录 |
| `POST` | `/api/auth/login` | `{ username, password }` |
| `POST` | `/api/auth/logout` | 退出 |
| `GET` | `/api/me` | 当前账号，未登录时 `user` 为 `null` |
| `GET` | `/api/save` | 进行中的存档 `{ rev, save, summary, updatedAt }` |
| `PUT` | `/api/save` | `{ save, rev, force? }`；版本号对不上回 409；已经结束的一局会归档 |
| `DELETE` | `/api/save` | 放弃这一局 |
| `GET` | `/api/runs` | 走完的人生（最近 10 局、局数、最高分） |

改动类请求必须是 `Content-Type: application/json`。

## 开发与测试

```bash
npm test           # lint + 单元测试（含后端接口测试）
npm run validate   # 内容校验
npm run sim        # 平衡模拟
npm run e2e        # 浏览器端到端（起一个内存数据库的真服务器）
```

`npm run e2e` 用 Playwright 自带的 Chromium；装不了时用 `CHROMIUM_PATH=/path/to/chrome npm run e2e` 指定本机浏览器。

目录：

- `src/core` 纯游戏内核（无 DOM、无随机、无时间），浏览器和服务器共用
- `src/town`、`src/world` 小镇生成与像素渲染
- `src/ui` 界面；`src/ui/front.js` 是登录页和标题页
- `src/save` 存档码与云存档客户端（`cloud.js`）
- `server` 后端：`db.mjs` 表结构、`auth.mjs` 账号会话、`saves.mjs` 云存档、`app.mjs` 路由
- `tools/styles.mjs` 全部样式（像素窗口框由字符画生成）

## 署名

改编自 [eternity4719/HowToLiveBetter](https://github.com/eternity4719/HowToLiveBetter)《高性价比人生指南》，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 许可，已做游戏化改编与摘录。游戏是简化模型，不构成医疗或法律建议。
