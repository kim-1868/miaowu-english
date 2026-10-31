# S2 · 服务端付费章节权限测试（非正式商品）

当前部署：Cloudflare `miaowu-english-staging`，D1 `miaowu-english-test`。
独立测试页面：`/reading-test.html`，在受 `reviewer` 保护的测试站内。

## 范围

- `GET /api/books?category=cet4|cet6`：已发布书目公开展示，不包含正文。
- `GET /api/books/:bookId/chapters`：已发布章节标题、试看标记、`canRead`（按当前登录账号计算），不包含正文。
- `GET /api/chapters/:chapterId`：免费试读公开；付费章节必须登录并拥有匹配分类权益后才返回 D1 `content_json`。
- `POST /api/staging/seed-chapter-fixtures`：**只在 staging**，且必须先通过全站 reviewer 门禁和同源 POST，创建固定测试书目和三个测试章节。采用 `INSERT OR IGNORE`，重复调用不会覆盖原数据。
- 未登录付费正文返回 401，已登录但缺少分类权益返回 403，不存在或未发布的章节返回 404。
- 所有测试正文只存在于 Worker 服务端种子和 D1 数据库，**不放入 public/app.js，也不是真实小说产品**。

## 用户测试步骤

1. 确认 Cloudflare Deployments 最新 GitHub Build 为 Ready。
2. 打开 `https://miaowu-english-staging.kim10086a.workers.dev/reading-test.html`（预览密码还是之前的 reviewer 密码，不需要改）。
3. 点击「创建测试书目」，再确认书架出现两本测试书和三个章节。
4. 已有测试账号拥有四级和六级时，三章都能请求到正文。
5. 点击「账号联调实验室」退出**用户账号**（不会退出 reviewer 门禁）；回到此页面刷新账号，再测试：免费试读可读，四级/六级付费章都应返回 401。
6. 可使用只有四级权益的另一测试账号验证：四级付费章可读，六级付费章应返回 403。若尚无四级独立账号，这项可暂缓或留给自动化测试。
7. 任何失败提供返回文本或浏览器截图，不需要发送密码、卡密或账号个人信息。

## 安全与限制

- 现有 V0.3 中硬编码的两个章节、词汇与练习数据仍属于本地公开演示，不是生产付费正文，无法靠前端锁保护。
- 此次测试确保后端 API 的权限检查，但不能单凭它证明浏览器内所有阅读入口已改为安全调用；后续还需把 V0.3 章节入口接入服务器、删除将来要收费的正文静态数据。
- 当前只部署 staging，不要开启真实售卖、真实订单和真人客户注册。
- 密码恢复、用户数据同步、变更/撤销授权、运营后台与日志审计需另行实现。
