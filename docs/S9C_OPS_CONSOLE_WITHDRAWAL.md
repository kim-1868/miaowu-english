# 妙屋英语 · S9-C 安全出版台 / 撤回（开发验收）

## 本轮交付

- `public/ops.html` + `public/ops-console.css` + `public/ops-console.js`：复古奶油/酒红配色的运营出版台；书目列表，自动技术报告，真实人工审核勾选与记录，输入书名二次上架确认，已发布内容的撤回预检/确认，最近30条审计事件。移动版与暗色模式适配。
- 页面只调用私有的运营 API。运营密钥仅留当前页 JS 内存，不保存 localStorage、sessionStorage、URL、Cookie，不在 HTML/CSS/仓库中。浏览器输入密钥不会自动建立运营用户会话。**生产前应额外配置 Cloudflare Access（例如强身份验证/MFA）；仅靠运营密钥不应被当作全部安全体系。**
- `src/ops-console.js`：仅有效 publisher 操作员访问的书目简表、撤回影响预检、最近审计记录，以及带二次确认的原子撤回接口；读者账户不能调用。
- 撤回仅修改 `books.status='draft'` 和关联章节 `published_at=NULL`，保留 `entitlements`、`activation_codes`、`reading_progress`、`user_words`、`review_events`。写操作和审计在一个 D1.batch 事务内，失败全部回滚。
- 服务端限定 `OPS_CONSOLE_ENABLED` 为字符串 `true` 才能访问页面和目录；`OPS_WITHDRAWAL_ENABLED` 为 `true` 才能撤回；S9-B `OPS_PUBLICATION_ENABLED` 仍是独立开关，**三个开关默认关闭**。
- `/ops.html` 页面及 JS/CSS 带 no-store、CSP（只允许本站脚本/样式/请求）、noindex、防 iframe、防 MIME 混淆。
- `tests/s9-console.test.mjs` 对操作员权限、开关、错误确认、原子回滚、审计和已购权益保留做自动化检查。

## 重要限制

1. **当前未部署，未经 Cloudflare 实机验收。** 开发 PR 保持 Draft。
2. 当前只有数据恢复/下架基础，没有退款、邮件通知、售后工单自动化。已购用户可能受到实质影响：必须按照用户已承诺的商品期限和售后政策处理，不能说“下架=退款”。
3. 下架后再上架须重新完成内容审核、二次确认；旧审批不应继续有效。
4. 现阶段的运营身份基于单独高强度 API key，适用于封闭测试。真实运营还需加 Cloudflare Access/MFA，限制入口、事故密钥轮换、访问监控及备份演练。
5. 编辑后台 `editor.html` 目前仍为 staging-only，不能把它伪装成生产内容编辑。生产安全的内容创建/编辑、支付/订单、激活码发货仍有独立上线任务。
6. 生产 D1 的 007/008 SQL 尚未迁移。对现有数据库不盲目使用自动 `migrations apply`，需先检查 `d1_migrations` 历史、备份并做恢复演练。

## Cloudflare 测试前必须完成的用户动作（暂不操作）

- Cloudflare 测试 Worker 部署分支指向经过检查的 S9 合并结果，确认 GitHub Actions success、Deployments Ready。
- 对 `miaowu-english-test` 进行备份与 SQL 迁移记录校对后，再由用户确认执行 007/008。**绝不在生产 D1 上试迁移**。
- 仅在测试环境配置独立测试用 `OPS_TOKEN_PEPPER`，独立运营测试身份，按需打开上述开关；生产 Secret 与测试 Secret 不能共用。
- staging 的 reviewer 入口保护继续保持；实际用真实浏览器执行：登录→目录→审核→上架（仅单独创建的非演示测试稿）→验证免费试读/付费权限→撤回→验证无法读/已购权益还在。**不能用真正售卖内容做破坏性测试。**

## 正式上线的余项

- 生产数据库/Worker/域名隔离与 D1 备份恢复；
- Cloudflare Access/MFA 和生产运营访问策略；
- 原创《雨夜档案》第一季内容：10–12章，免费第一章，逐章校对四级基础词（不要声称已经覆盖完整 CET4 大纲）；
- 小红书实际可售类目、付款或订单渠道、数字服务授权与售后政策、激活码安全发货；
- V0.3 视觉与夜间模式的真实浏览器验收及小范围试读测试。

## 上线策略

可以先独立灰度开放合规的**免费试读**，但不应在支付、权益期限与售后条款未明确时直接开启付费销售。测试站绝不直接等同生产。
