# WordLetter V1.1 Wave2 · 正式站发布门禁与实测记录（2026-11-08）

> 目标：将已在预览站开发并在本地隔离 CI 验证的第二批（书架、新手引导、注册确认密码、补充词典）安全同步至正式站。此文档 **不代表已部署**，也不得用此文档作为跳过真实生产检查的批准。

## 1. 当前确定的证据

- 候选源分支 `release/v11-wave2-bookshelf-onboarding-20261108`，2026-11-08 参照固定 SHA `21de322c30a11dcfac7ad369bceb5a7712f591bd`；如并行开发有新提交，必须重新冻结。
- GitHub Actions #42486385217：隔离 Chromium 25/25 项真实交互通过；#42486385160：staging 回归 483 pass / 0 fail / 1 skipped；这 **不是**远程预览登录的实际验收。
- 用户现场截图确认正式 D1 `miaowu-english-prod`（UUID `649c71b3-340c-49bf-b806-3d39256851d3`）：
  - 时间点恢复 bookmark 已取得，**不得直接执行 Restore**；
  - `wrangler d1 export --remote` 导出迁移前约 20MB SQL；在电脑上 `chmod 600`、SHA256；本地恢复 `PRAGMA integrity_check` = `ok`，备份未上传 GitHub；
  - `user_onboarding`、`user_bookmarks`、`supplemental_dictionary` 三张新增表存在，补充词典 107/107 去重通过。
- Wave2 构建命令必须为 `node scripts/build-production-assets.mjs --approved-announcements`，并核验 50 项且含公告；禁止使用默认无公告构建。
- 生产站已发布 Wave1 公告后台内预览、点击词卡就近弹出、移动端适配和朗读主动触发 hotfix。候选包含历史修复，但必须再次对照当前线上资产，尤其检查 `public/app.js`、`public/index.html`、`public/site-updates.js`、`public/ops-updates.js`、`public/v11-responsive.css`。
- 生产 Worker 配置文件 `deploy/production.wrangler.jsonc` 的 `APP_ENV=production`、`workers_dev=false`、D1 名称/UUID必须保持不变。生产公告开关由现有 Worker 运行时变量显式授权，采用 `wrangler deploy --keep-vars` 保留当前 vars/secrets。**尚未实测确认现有公告两个变量的有效状态与部署前版本**。

## 2. 不得遗漏的发布前检查

- [ ] 用 Cloudflare Worker 部署记录固定当前生产部署 ID/版本；保留可回滚版本（不泄漏运营密钥）。
- [ ] 读取正式站当前静态资源并核对基线；如果任何关键文件内容与已知 Wave1+voice-guard 版本不一致，停止并重新整理差异，不能强制覆盖。
- [ ] 通过受保护预览站做新/旧真实测试账号登录与个人书架/引导/授权测试；如果无预览访问凭据，不可将隔离 CI 冒充线上验收。
- [ ] 再确认 `miaowu-english-prod` 为正式部署绑定的 D1，三张新表与 107 词存在；不得重新运行 009/010/012/013 或执行 014 义项映射。
- [ ] 固定第二批候选 40 位 SHA、复核 Wave1 朗读防误触修复、公告后台内预览功能及前端 CSS。
- [ ] `npm run check`、`npm test`、50 个公告版生产资源白名单审核、`npx wrangler deploy --dry-run --config deploy/production.wrangler.jsonc` 完整通过；干运行不使用 Cloudflare 生产写入凭据。
- [ ] 再次检验候选不会把 P4 快刷/听音拼写学习引擎、D1 014 reviewed 映射、演示数据和 staging 密钥引入正式站。
- [ ] 发布者对实际固定候选 SHA 与确认的生产部署版本签核；不得复用旧 Wave1 `push` 部署工作流，也不能部署整条混合 V1.1 总分支。

## 3. 受控上线及回滚要求

1. 首先记录 `wrangler deployments status --name miaowu-english-production --json --config deploy/production.wrangler.jsonc` 的现有正式部署信息，验证 Cloudflare 授权。
2. 将 **公告版** 50 项安全资源构建到 `dist-production/public`；确认 `index.html` 中 `myBookshelf`、`mwWelcomeDialog`、`siteUpdateBanner`，并保证语音误触 hotfix 仍在。
3. 审阅并保留生产公告运行时变量 `OPS_ANNOUNCEMENTS_ENABLED` 和 `V11_NOTICE_RELEASE_APPROVED`，不读取/复制任何 secrets。**绝不能使用没有审核公告开关的默认生产包覆盖当前正式站。**
4. 只在发布门禁全部通过后执行 Worker 发布；部署命令应保留现有变量并使用已冻结、已审核的生产 config，禁止发布到 staging 或写 D1。新版 Worker 应继续绑定现有正式 D1。
5. 发布后检查：正式首页、公告预览/发布权限、`/onboarding.js` 与 `/v11-bookshelf.css` HTTP200、登录/注册确认密码、书架收藏/取消、阅读中/已读完、历史账号无强制引导、新账号三步引导、移动词卡、主动朗读与停止按钮、权限/订单/复习路径。
6. 若任何核心 smoke 失败，优先回滚 Worker 到部署前固定版本，**不得**执行 D1 Time Travel Restore 来回滚这次只增量的数据库变化（会回滚后续用户写入）。保留新增表并关闭新功能比恢复整库安全。确认恢复后再记录根因。

## 4. 准确状态

截至本文创建时：**生产 D1 迁移与词典准备完成，第二批生产代码尚未发布。** Cloudflare 登录自动化会话无法使用；当前连接只可 GitHub 代码阅读/修改，不应声称已经获得 Workers 生产部署权限。第三批 P4 快刷、听拼、统一间隔复习与 014 词义映射仍是单独发布线。

追踪：#193。
