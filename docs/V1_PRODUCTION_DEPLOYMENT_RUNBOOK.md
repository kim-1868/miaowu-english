# 妙屋英语 V1.0｜独立生产 Pages + Worker + D1 执行手册

更新时间：2026-11-01。**本文件是部署准备与安全验收流程，不是可以直接公开收费的部署许可。** 即使 GitHub CI 通过，仍要满足首发内容审核、订单/售后/账号找回等商业条件。

## 已完成但尚未部署的源代码

- `pages-production/entry.mjs`：将所有应用 URL 转交给内部 `PRODUCTION_ORIGIN` Service Binding；绑定失效时返回503，绝不返回 Pages 静态后备内容。只有无用户数据的 `GET /__miaowu_prod_edge_probe` 探针无需生产 Worker。参照旧 `miaowu-english-access-check.pages.dev` 中国大陆无 VPN 可读写测试，但**新正式域名需重新测试**。
- `pages-production/build.mjs`：产出仅三份文件 `_worker.js`、`_routes.json`、无私密内容的 placeholder；**不复制 `public/`**，确保 Pages 上绝没有小说受限正文、账号联调文件和运营测试页面。真正的 HTML/CSS/JS 仍由 Worker 的 `ASSETS` 提供，所有访问经过生产 Worker 的路由拦截。
- `pages-production/wrangler.jsonc`：项目 `miaowu-english-web`，Service Binding `PRODUCTION_ORIGIN → miaowu-english-production`，**Pages 没有 D1/Secret**。
- `deploy/production.wrangler.jsonc.example`：生产 Worker 模板，`APP_ENV=production`，独立新的 `miaowu-english-prod` D1，`workers_dev:false` 且 `preview_urls:false`，禁止 Worker 通过公开域名暴露。D1 id 故意不是 UUID，**模板不能直接部署**。
- `scripts/check-production-config.mjs`：检查 Worker 名、生产 D1 新 UUID 和 DB 名、全站 Worker-first、公开 workers.dev/preview URL 已禁用、不得携带 staging 变量或密钥明文。通过仅代表配置形式检查。
- 离线兑换码脚本仍要求与生产 Worker 相同的仅存密文的 `ACTIVATION_PEPPER`；禁止将其提交到 GitHub、ChatGPT、Pages env、调试日志。

**重要：GitHub 目前 PR #29 仍为 Draft；不要将该分支无审查地配置成自动部署正式环境。**

## 生产 D1 已创建：现已进入“空库初始化”检查点（2026-11-01）

用户在 Cloudflare 控制台截图确认全新 `miaowu-english-prod`，数据库 UUID `649c71b3-340c-49bf-b806-3d39256851d3`，创建时显示0张业务表，后续截图已验证**22张业务表**。与原 QA 数据库 UUID `88a817cb-23bb-4ae4-bcb8-92286c4165d4` 完全不同。**D1 UUID 是资源标识符，不是访问密钥**。

已经在开发分支新增 `deploy/production.wrangler.jsonc` 并填入此新 UUID，同时关闭生产 Worker 的 workers.dev 与预览 URL；未给它配置真实秘密，也未部署 Worker。

已按以下顺序汇总10个 SQL 源文件，且有 CI 检查防止脚本与真实源文件内容漂移：

```
db/001_schema.sql
db/002_s1.sql
db/003_public_categories.sql
db/004_editorial_content.sql
db/005_editorial_revisions.sql
db/006_editorial_review_signoffs.sql
db/007_ops_identity_audit.sql
db/008_ops_release_workflow.sql
db/production/001_one_paid_order_one_code.sql
db/production/002_account_recovery_codes.sql
```

**初始化 SQL：** `db/production/BOOTSTRAP_NEW_EMPTY_D1.sql` 是带审计注释的原始版本；**在 Cloudflare D1 Console 粘贴应优先用 `db/production/BOOTSTRAP_CONSOLE_PASTE.sql`（去掉全部 `--` 注释）**。用户曾在 Console 看到 `No SQL statements detected.`，随后只读查询发现 `sqlite_master` 里**唯一的一张表是 `_cf_KV`**。Cloudflare 官方说明 `_cf_KV` 是 D1 **底层存储的保留内部表**，因此这代表当前 **0张应用业务表**，不是部分执行失败；绝对不能删除 `_cf_KV`。若最新查询仍只有 `_cf_KV`，可以在这个空业务库执行**无注释版**一次。任何业务表已存在时立即停止，不可重放整个初始化脚本。对应只读查询：`SELECT COUNT(*) AS application_table_count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_cf_KV';`。官方依据：https://developers.cloudflare.com/d1/best-practices/import-export-data/ 。无注释版内容与10份审计源 SQL 一致，CI 还验证其换行被浏览器压平为单行时，内存 SQLite 仍能创建**22张表、4个分类、0条用户/订单/书籍数据**。

**已完成的历史操作（不要重复）**：先前 Cloudflare D1 只有内置 `_cf_KV`，随后用户使用无注释版 SQL 成功创建22张业务表。可确认当前仍选中 `miaowu-english-prod` 和 UUID `649c71b3-340c-49bf-b806-3d39256851d3` 后，复制 `BOOTSTRAP_CONSOLE_PASTE.sql` **无注释版**的 GitHub Raw 全文，在 Console 底部输入框执行**一次**。成功后可执行 `db/production/VERIFY_FRESH_D1_READONLY.sql` 只读查询，应看到**应用表22张**（加 `_cf_KV` 共23张，在界面统计数字可能不同）、四级/六级/雅思/考研四种 slug、用户/码/书/恢复码/运营员记录为0、账号恢复及订单唯一索引存在。**任何报错立即停下，不要再运行同一整份 SQL**。

**发生任何 Cloudflare SQL 错误时立即停止并记录错误，不可直接把整段脚本再跑一遍**：第008部分的 `ALTER TABLE books ADD COLUMN` 不支持重复执行，失败后可能已经留下先前步骤创建的表。先由开发者对照远程结构做差异检查，再决定如何安全续跑；绝不在旧 `miaowu-english-test` 执行。

上述 D1 初始化只解决服务端数据表。**独立 Worker、生产 Secret、Pages 服务绑定和付款/首发内容仍未就绪，不能称为正式网站已经上线。**

## S22 当前完成进度：正式D1已验收 + 真实 Wrangler 编译预检

2026-11-01：用户提供的 D1 Console 实际返回 `application_table_count = 22`，对应**22张业务表建表成功**。这是在 Cloudflare 真实生产库中的只读查询结果；旧测试数据库没有更改。截图**只确认业务表数量**，后续接入 Worker 前仍需只读核验四类 `categories.slug`、关键表/触发器和用户、小说、激活码初始数量。不要再执行初始化 SQL。

2026-11-01：新建生产专用资源白名单：
- `scripts/build-production-assets.mjs` 从仓库 `public/` **仅复制11个已审查的正式站点必要资源**到 `dist-production/public`；包含面向运营人员的既有受保护 `ops.html`，但**不上传** `account-test*`、`reading-test*`、`editor*` 和大体积设计参考 `design-reference-v03.html`。保留 staging 的原 `public/` 完全不变。
- `deploy/production.wrangler.jsonc` 已改为绑定 `../dist-production/public`，生产 D1 UUID 仍为 `649c71b3-340c-49bf-b806-3d39256851d3`，生产 Worker `workers_dev:false`、`preview_urls:false`。
- GitHub Actions `Production dry-run (no Cloudflare deployment)` 已在 **无Cloudflare token、无账号秘密** 条件下使用真实 Wrangler 4执行 `npx wrangler deploy --dry-run --config deploy/production.wrangler.jsonc --outdir .wrangler/dryrun-production`，成功打包，发现11个静态资源和正确的 D1 `DB (miaowu-english-prod)` 绑定；没有调用部署 API，没有实际访问 D1。
- 对应 Pages 代理 `npm run pages:production:build` 也在此 CI 中通过，Pages 包仍只有代理 `_worker.js`、路由配置和无内容占位符，不含用户数据及私有正文。

**以下是 GitHub 自动编译检查，不代表真实 Worker 或 Pages 已创建、公开可用。**

### 下一项账号所有者操作：准备连接 GitHub 到 Cloudflare Workers

按官方 Cloudflare Workers Builds 指引：Cloudflare > **Workers & Pages** > **Create application** > **GitHub**，选择 `kim-1868/miaowu-english` 并在需要时完成 GitHub 授权。**在看到根目录/构建命令/部署命令/分支设置时先截图核对，不要直接接受默认 `wrangler.jsonc` 并点击 Deploy。** 仓库根目录的 `wrangler.jsonc` 指向旧 `miaowu-english-staging` 和旧测试 D1，绝不能作为生产 Worker 配置。生产必须明确使用 `deploy/production.wrangler.jsonc` 和构建命令 `npm run assets:production:build`，部署命令 `npx wrangler deploy --config deploy/production.wrangler.jsonc`，Worker 名须为 `miaowu-english-production`。Cloudflare Build 分支建议先用专用审核发布分支，不能默认将 Draft/所有分支推送自动部署至生产；可在人工核验配置后继续。

正式部署后才在**Worker 的 Variables & Secrets** 设置 `ACTIVATION_PEPPER`，使用生产独立的高强度随机密钥（**不得在聊天、GitHub仓库、截图公开，也不得复用旧测试Secret**）。Worker 生产站点不公开 workers.dev/Preview URL；初次部署后必须复核。注意 `wrangler secret put` 可能会创建并直接部署新版本，不能在未核对时操作。

Cloudflare 官方文档：
- GitHub连接：https://developers.cloudflare.com/workers/ci-cd/builds/
- 生产 Worker `workers_dev:false`：https://developers.cloudflare.com/workers/configuration/routing/workers-dev/
- 静态资源绑定：https://developers.cloudflare.com/workers/static-assets/binding/

## 第1阶段：只有操作者可以在 Cloudflare 账号完成的步骤（D1 建表操作现已可在复核后执行，其余阶段继续待验收）

下面这些是以后确实需要**账号所有者操作**的项，不能由 GitHub 上传文件替代：

1. **已完成**：Cloudflare 新建独立 D1 `miaowu-english-prod`（UUID：`649c71b3-340c-49bf-b806-3d39256851d3`，最后截图只显示内置 `_cf_KV`，业务表0张）。不更改原测试 D1。
2. **已完成，绝不重复**：10份 SQL 的无注释版 `db/production/BOOTSTRAP_CONSOLE_PASTE.sql` 已在真实新生产 D1 执行，用户控制台只读查询已验证 **22张业务表**。`db/007`、`db/008` 已经包含在初始化包内。后续只做只读复核，不得再次运行整份 Bootstrap。
3. **生产 Worker 配置与真实编译预检已完成**：`deploy/production.wrangler.jsonc` 指向本次创建的生产 D1、新的 `dist-production/public` 白名单资源目录，禁用 workers.dev/预览 URL；GitHub CI 已用 Wrangler --dry-run 实际打包验证，但仍未部署。Worker 的 `ACTIVATION_PEPPER` **必须通过 Cloudflare Workers 的 `wrangler secret put ACTIVATION_PEPPER` 安全设置**（不得复用测试 Pepper）；在终端交互输入，不在配置、命令参数、聊天或截图中公开。生产配置文件内不允许声明明文或伪 `secrets` 属性。
4. 创建独立 Worker `miaowu-english-production`，配置绑定 `DB` 指向正式 D1、`ASSETS` 指向正式静态文件；在隔离的联调部署中验证路由和 schema，再配置最小权限及日志策略。**确保 Worker 未公开 workers.dev 和 Preview/Version URL**。Service Binding 可调用无公开 URL 的 Worker。
5. 新建 Cloudflare Pages 项目 `miaowu-english-web`：Git分支为审查通过的独立发布分支，Root directory `pages-production`、Build command `npm run build`、Build output `dist`，与 `pages-production/wrangler.jsonc` 中的 `PRODUCTION_ORIGIN` service 绑定完全一致。此 Pages 项目不得加 D1、`ACTIVATION_PEPPER` 或来自旧站的 reviewer 密钥。
6. 首先在正式环境部署一个**没有可售商品、真实用户/真实销售关闭**的内部验收版本，并在新 Pages URL 上核查：网络可达、生产 Worker绑定、全站路由、身份注册/登录/修改密码、跨账号隔离、未登录/未购买付费章节 401/403、退出失效、重复码拒绝、数据库备份恢复。
7. 完成首发内容、词库、音标和题库审核，确定合法合规的支付/人工发码渠道、售后/隐私/账号找回后，才能人工发布经审核书籍并开放真实付费入口；不能删去旧测试站 reviewer 密码直接出售。

## 命令（本地只读构建，不操作 Cloudflare）

```bash
npm run check
npm test
npm run pages:production:build
node scripts/check-production-config.mjs deploy/production.wrangler.jsonc.example
```

最后一条**必须失败**：示例中的 D1 占位符不是 UUID。如果它通过，说明检查器失效。上述命令中的 `npm run check` 及 Pages 构建会写入 gitignored 的 `pages-production/dist/`，没有任何真实用户内容。

## 第2阶段：上线验收红线

- **课程内容**：《雨夜档案》12章现为草稿，188个候选词、220次标注；需完成剧情长度、词义、CET4来源、IPA/发音、跨章复现及原创性审核。Rose 2章仅为演示，不可作为付费完整小说。
- **分类商品**：四级、六级、考研、雅思是权限**类别**，没有通过审核的正式小说时不要出售空书架。未来高中/专升本分类继续禁用离线发码。
- **账号恢复**：S18 已在开发分支实现**正式环境一次性恢复码**：注册时显示一次、数据库只存 HMAC 摘要；重设密码后旧码/旧会话失效，并颁发新码。仍未在 Cloudflare 实机验收，必须验证生产 D1 已执行恢复码迁移、不同浏览器兼容、错误码限流和真实用户能正确保存恢复码。若密码与恢复码都丢失，仍须提供经过核验的人工售后流程，不能保证自动找回。
- **支付与发货**：只有人工核对确认到账的真实订单才能走离线兑换码库存；一单一码必须在生产 D1 的订单唯一约束下核验。不能把网银/支付截图直接当服务端确定到账证明。
- **合规**：隐私/用户条款、数字内容和退款说明、适用网络经营要求、用户数据最小收集、备份和合法教材内容授权。
- **网络**：用户曾在单一中国大陆网络实测旧 Pages host 无 VPN 可用；新正式 Pages 主机必须按移动、联通、电信和不同时段分别复测，不可保证全国均可访问。

参考Cloudflare官方资料：
- https://developers.cloudflare.com/pages/functions/advanced-mode/
- https://developers.cloudflare.com/pages/functions/bindings/#service-bindings
- https://developers.cloudflare.com/workers/configuration/routing/workers-dev/

## 当前真实状态

**代码阶段**：整合 S12–S16 与私有内容稿；生产 Pages 独立代理已经编写并可本地检查。**实际线上**：用户已验证的 QA Pages+staging Worker+D1 仍保留，不是未来公开收费站；尚未创建/部署新正式资源。不要在未得到真实验收前将其描述为“正式上线”。
