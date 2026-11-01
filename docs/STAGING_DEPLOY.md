# 妙屋英语 — Cloudflare 测试环境部署操作手册（2026-10）

> 这是测试环境。V0.3 的页面仍是演示账号，不可用于真实付费。
> 不要将密码、API Token、`ACTIVATION_PEPPER` 或激活码发到聊天，也不要提交到 GitHub。

## 0. GitHub 已完成
- 仓库：`kim-1868/miaowu-english`
- 使用分支：`dev/s1-auth-and-entitlements`，**不是 `main`**
- GitHub PR #2 保留草稿，不合并。
- Wrangler Worker 名称：`miaowu-english-staging`
- D1 Binding：`DB` -> `miaowu-english-test` -> ID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`
- `APP_ENV=staging`，静态资源 `run_worker_first=true`。

## 1. 初始化 D1 数据库（只在刚创建的测试数据库操作）
Cloudflare Dashboard -> Storage & Databases -> D1 SQL Database -> `miaowu-english-test` -> Console。

核对数据库名称和 ID，打开 GitHub 分支文件 `db/STAGING_PASTE_NO_COMMENTS.sql`，点击复制文件内容，全选粘贴到 D1 Console，点 Execute。此文件移除了 SQL 注释，避免复制时换行丢失造成整个脚本被当作注释；包含 13 个表和四个分类的初始化数据，支持重复执行。执行成功后使用 `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;` 检查表名。若出现 `No SQL statements detected.`，表示建表没有完成，先不要继续部署。**切勿选中其他 D1 数据库，尤其不要在生产数据库操作。**

返回 Tables，应该至少能看到 `users`、`categories`、`activation_codes`、`entitlements`、`sessions`、`request_throttle`。
新增时没有真实用户、没有真实激活码，这是正确状态。

## 2. 从 GitHub 创建 Cloudflare Worker（测试用途）
Dashboard -> Workers & Pages -> Create application -> GitHub -> 连接 `kim-1868/miaowu-english`。

在创建面板中选择：
- **Worker name**：`miaowu-english-staging`（必须与 wrangler.jsonc 中 name 一样）
- **Production branch / Git branch**：`dev/s1-auth-and-entitlements`（绝对不要选 main）
- **Root directory**：`/`（仓库根目录）
- **Build command**：`npm install && npm run check && npm test`
- **Deploy command**：`npx wrangler deploy`

如果创建页面无法选择此 Git 分支，**停止**并请求帮助，切勿以 `main` 或其他分支代替。保存并部署初次版本。未设置预览密钥前，显示 503 为预期的安全防护，不是网站损坏。

## 3. 在 Cloudflare 设置两个 Secret
Worker -> Settings -> Variables and Secrets -> Add -> Type 选择 **Secret**。分别新增：

1. **`STAGING_PREVIEW_PASSWORD`**：自行在密码管理器生成长度至少 20 的独立随机密码，保存好。它只用于私有测试站的浏览器预览，访问用户名固定为 `reviewer`。
2. **`ACTIVATION_PEPPER`**：另外生成一个完全不同、至少 32 字符的随机值，保存在密码管理器。它用于激活码摘要验证；丢失后无法验证既有卡密。

保存在 Cloudflare Worker Secrets（不是普通 Variable、不是 GitHub 代码、不是 Build variables）。Cloudflare UI 可能要求 Deploy 才生效。

## 4. 确认 DB 绑定与访问保护
Worker -> Settings -> Bindings，确认存在 **`DB`** 且数据库名称为 `miaowu-english-test`。这已在 Wrangler 配置中声明，正常部署后应自动出现，不要重复添加同名绑定。

打开 Cloudflare 给你的 `https://...workers.dev` 地址，浏览器应要求输入：
- Username: `reviewer`
- Password: 你自行设置的 `STAGING_PREVIEW_PASSWORD`

输入后页面应呈现已经确认的 V0.3 设计；它的注册和激活按钮仍是演示功能，不代表真实账号连接成功。

再访问 `<workers.dev 地址>/api/health`，应返回 `"ok":true`、`"authConfigured":true`；访问 `/api/categories`，应返回 CET4/CET6/考研/雅思的分类列表。

如果看不到密码弹窗、页面无密码直接公开呈现 V0.3，**立即停止并禁用测试 Worker**，不能继续。请先核对最新分支及 `run_worker_first=true`。

## 5. 不应执行的操作
- 不合并 PR、不配置正式域名、不公开卖货；
- 不录入真实顾客、真实支付订单和正式兑换码；
- 不将浏览器弹窗密码及 ACTIVATION_PEPPER 发给任何人；
- 不把 S1 API 当作已通过 Cloudflare 真实并发与安全审计。

## 6. 完成后告诉开发方
只需要提供 **Workers 测试网址** 和 **/api/health、/api/categories 的访问结果**。不要提供密码或 Secret。

**后续工作**：将 V0.3 演示注册和增购表单连接服务器；接入 D1 数据查询；做真实多设备、并发激活、授权访问、退款撤销等测试。

## 7. 首次连接 Cloudflare 如果默认使用 main 分支

当 Cloudflare 创建 Worker 时没有提供分支选项，会默认从仓库 main 拉取代码；因为 main 未合并 S0/S1，会出现 `Could not read package.json`。这不是 D1 故障。

在 Worker -> Settings -> Builds -> Production branch 将 `main` 改为 `dev/s1-auth-and-entitlements` 并保存后，下一次推送到此分支就会触发新构建。不要把以前失败的 main 构建误认为新分支失败；应确认 Deployments 中最新一行显示 `dev/s1-auth-and-entitlements`。

测试站代码在设置 STAGING_PREVIEW_PASSWORD 前会返回 503，直到设置至少 16 字符的 Secret 并部署。不要把这个状态误判为登录或数据库错误。
