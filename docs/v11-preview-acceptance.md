# 妙屋英语 V1.1 · 受控预览验收环境

## 环境结构（已核对代码配置，运行状态仍须部署后验证）

- 正式 Pages \`miaowu-english-web\` → \`PRODUCTION_ORIGIN=miaowu-english-production\` → 生产 D1 \`miaowu-english-prod\`；**永不更改这一服务绑定来做预览**。
- V1.1 验收使用已有 \`miaowu-english-staging\` Worker → 独立 D1 \`miaowu-english-test\`。
- 测试 Worker 现有 \`STAGING_PREVIEW_PASSWORD\` 网关，访问用户名 \`reviewer\`，服务器签发短期 HttpOnly Cookie；禁止在聊天、代码或日志公开密码、Pepper、真实激活码。
- 预览可测试客户 UI 与真实请求逻辑，但只准使用测试账号、测试激活码与测试内容；**不克隆正式客户数据**。
- GitHub 自动化构建和 staging 部署成功不等于站长验收，也不授予正式发布权。

## V1.1 预览发布门禁

1. 从完整 V42 产品基线创建的独立分支开发，执行 \`npm run check && npm test\`。
2. \`node scripts/check-v11-preview-config.mjs\` 必须为 \`safe:true\`。严格检查 Worker 名、\`APP_ENV\`、测试库 ID、资源网关、密钥声明、生产 Pages 服务绑定。
3. 仅使用根目录 \`wrangler.jsonc\`。**禁止**引用 \`deploy/production.wrangler.jsonc\`，禁止远程 D1 migrations/seed/生产数据访问。
4. 部署前 Cloudflare 凭证存在，保留测试 Worker 上已有 secrets（\`--keep-vars\`）；如果凭证不存在则安全失败、**不降级到生产**。
5. 部署后无凭证访问测试入口必须得到 HTTP 401，不能未经保护显示阅读页面。检查返回内容仍是 staging challenge。
6. 交付访问地址时同时提供固定提交 SHA、功能清单、测试账号的取得方式，以及逐项验收说明（任何密码只通过安全渠道自行设置）。
7. 用户完成验收前持续在 **staging** 修复；**只有用户明确批准正式发布并通过生产基线对照、数据备份和完整回归后**，才允许单独触发生产发布流程。

## 使用方式

- 预览发布 GitHub Actions 只在 \`feature/v11-phase1-mobile-and-install-guide-20261106\` 分支指定 workflow 文件首次创建/修改时自动触发；其他代码改动不会自动部署。后续可在 Actions 手动触发（取决于该工作流是否出现在默认分支 UI）。
- 工作流会先完成全部测试和配置审计；运行中不得进行 D1 迁移。
- 首批验收：手机底部「首页」、桌面「探索故事」、我的书房「添加到手机桌面」入口、iPhone/Android 切换与统一文案。
- 预览发布后应确认生产网页、兑换、后台未发生版本变化。

## 本轮不包含

- 不重设计手机桌面猫咪图标。
- 不部署 V1.1 其余 P1～P4 未开发功能。
- 不修改生产数据、生产 Worker/Pages、用户权益或后台开关。
