# WordLetter V1.1 正式站统一｜只读核验与受控发布交接（2026-11-08）

> 本记录是用户明确要求“将预览站已优化内容同步到正式站”后进行的只读核验。**本文件提交不等于正式发布**。未经真实生产 D1 可恢复备份及迁移/权限核验，不可触发生产部署。本分支仅用于审计交接，不得直接部署。

## 当前冻结参考

- 第二批现有候选：`release/v11-wave2-bookshelf-onboarding-20261108`，本轮核验 HEAD `21de322c30a11dcfac7ad369bceb5a7712f591bd`。
- 第一批朗读热修：`release/v11-reader-voice-guard-20261108`，本轮核验 HEAD `3217c72ed38f3edf57807e6d24e5d3b0aeeba6aa`。
- 第一批与朗读热修的原始正式发布/测试依据：Actions 42482044024、42482983528。当前实际静态页面能访问；完整的生产 Worker SHA 仍需从 Cloudflare Deployments 核对。
- 第二批 staging Actions [42486385160](https://github.com/kim-1868/miaowu-english/actions/runs/42486385160) verified success，匿名要求 401；独立本地 Chromium Actions [42486385217](https://github.com/kim-1868/miaowu-english/actions/runs/42486385217) 25/25 success。**本地浏览器合格不是远程受保护预览操作合格**。
- `miaowu-english-test` 测试 D1：站长此前确认 `user_onboarding`、`user_bookmarks`、`supplemental_dictionary` 存在、补充词典 107 条；勿重复执行完整 test-only 初始化 SQL。
- `miaowu-english-prod` 生产 D1 绑定：数据库名 `miaowu-english-prod`，UUID 在私有 `deploy/production.wrangler.jsonc`。此前没有 009/010/012/013 已迁移的证据。**禁止推断其已迁移**。

## 代码差异与发布分类

1. 第一批已发布但必须回归：运营台公告页内预览、公告历史异常容错、点击单词附近弹出、移动端词卡、320–430px 样式、取消权益查询以及朗读只能主动启动。不得因第二批发布覆盖朗读 voice-guard。
2. 第二批等待正式同步：`public/onboarding.js`、`public/onboarding.css`、`public/v11-bookshelf.css`、`public/index.html` 与 `public/app.js` 适配、`src/onboarding.js`、`src/my-bookshelf.js`、`src/internal-dictionary.js`、`src/example-word-lookup.js`、`src/worker.js` 路由；本批依赖 `db/009_v11_onboarding.sql`、`db/010_v11_my_bookshelf.sql`、`db/012_v11_supplemental_dictionary.sql`、`db/013_v11_supplemental_starter.sql`。
3. 第二批候选与第一批热修 Git refs 当前为 diverged，不允许整分支覆盖。需对比第一批之后的最新实际正式 SHA，手工合并 voice-guard、第一批公告/词卡修复，并在最终代码中针对重合事件绑定做回归。
4. **不在本批发布**：P4 快速刷词和听音拼写的复习算法改写、`db/014_v11_reviewed_sense_aliases.sql` 人工义项映射、小说正文/词卡 ID 批量重写、订单/权益业务行为调整。需逐项单独审核，以免影响真实学习记录。
5. 公共仓库的 5 个新纯 UI 组件已通过合成测试，但并未全部接入私人真实 app，不能为“统一”而同时大规模替换线上可工作的组件。

## 本次外部只读检查

- 公开正式站 `https://miaowu-english-pages.pages.dev/` 页面可访问，旧功能书架、阅读和运营台页面结构可见；此前浏览器登录前交互查看通过，**不代表账号、发码或读写业务验证**。
- 正式站 `/onboarding.js` 与 `/v11-bookshelf.css` 经外部读取返回 HTTP 404，与第二批尚未发布相符。
- 匿名外部访问 `https://miaowu-english-staging.kim10086a.workers.dev/` 在当前浏览器环境失败；可能是受保护入口或网络/路由问题。既有 Actions 验证匿名 401，故不能判为 Worker 下线，亦不能取消预览访问保护。
- TinyFish 的浏览器 Profile 列表未显示已确认 Cloudflare 登录会话；本轮无法直接安全读取/导出正式 D1，**未对生产 D1 写入任何 SQL**。

## 发布前必须完成的门禁（均未在本次勾销）

- [ ] Cloudflare Deployments 核对生产 Worker + Pages 最新不可变 SHA，确认第一批声控热修确实在线。
- [ ] 受保护预览站使用授权会话完成真实 D1 新旧账户测试：确认密码、三步新手引导、想读/阅读中/已读完、退出再登录、手机桌面词卡、主动朗读、旧用户进度不丢。
- [ ] 独立、可恢复的 **生产** D1 备份及隔离恢复；记录备份方式、恢复书签及实际演练结果，不把“已有测试库”当作生产备份。
- [ ] 对生产库执行只读 PRAGMA/sqlite_schema 核对；仅在缺少对应表/索引和已有快照可恢复时审阅 009/010/012/013 的精确幂等操作，不在生产使用 `WAVE2_TEST_ONLY_SETUP_20261108.sql`。
- [ ] 第二批与最新生产 SHA 三方整合，不丢第一批公告、词卡、声控修复；对 50 静态资源包逐项核查及 manifest。
- [ ] 候选完整 Node/SQLite/Chromium + 真实权益/订单/书房/词卡/章节回归与生产 dry-run 通过，留完整 SHA、Actions URL。
- [ ] 在已批准的生产发布流程中执行，部署后核查网页静态资产、注册/登录/阅读/运营、生产 D1 表及数据完整性；失败则依回滚手册恢复。
- [ ] 下一独立发布批次审查 P4 复习与跨书身份兼容，不自动执行 reviewed 014 或改写已有词卡 ID。

## 本轮实际变更

- 本次仅新增该 **私有审计分支文档**；无前端、Worker、D1、Secrets、线上站点或生产发布操作。
- 对用户交付时严格区分：已由历史 Actions 证实、已由本轮只读核查证实、须授权登录/生产备份后才能完成。不得将第二批描述为已上线。
