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

## 第1阶段：只有操作者可以在 Cloudflare 账号完成的步骤（暂不要执行）

下面这些是以后确实需要**账号所有者操作**的项，不能由 GitHub 上传文件替代：

1. 在同一个 Cloudflare 账号新建 D1：**`miaowu-english-prod`**；记录新的 database UUID，确保不等于测试库 `88a817cb-23bb-4ae4-bcb8-92286c4165d4`。保留旧的 `miaowu-english-test` 不动。
2. 先独立审核 `db/001_schema.sql`、`db/002_s1.sql`、`db/003_public_categories.sql`、`db/production/001_one_paid_order_one_code.sql`、**`db/production/002_account_recovery_codes.sql`** 及其他需要的初始化/内容管理变更，**只对这个空白新 D1**初始化表/类别；导入前记录新库备份点。不要复制 staging 用户、验证码、匿名测试发码或测试小说。**不要**直接批量运行已在旧测试库执行过的 007、008 迁移文件。
3. 将 `deploy/production.wrangler.jsonc.example` 复制为**单独未公开追踪**的 `deploy/production.wrangler.jsonc`，填写新的 UUID，保持 `workers_dev:false`、`preview_urls:false`。运行 `node scripts/check-production-config.mjs deploy/production.wrangler.jsonc` 做只读核验。Worker 的 `ACTIVATION_PEPPER` **必须通过 Cloudflare Workers 的 `wrangler secret put ACTIVATION_PEPPER` 安全设置**（不得复用测试 Pepper）；在终端交互输入，不在配置、命令参数、聊天或截图中公开。生产配置文件内不允许声明明文或伪 `secrets` 属性。
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
