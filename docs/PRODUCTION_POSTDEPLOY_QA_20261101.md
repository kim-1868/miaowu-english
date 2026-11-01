# 妙屋英语 · S23 正式环境上线验收记录

日期：2026-11-01。**本文件是人工确认项目，不能代替 Cloudflare 实际结果或授权出售商品。**

## 已由用户浏览器实际确认

- 正式 Pages：`https://miaowu-english-pages.pages.dev` 可以打开首页，顶部文案现为“网站上线准备中”。
- `GET /__miaowu_prod_edge_probe` 返回 `productionBindingPresent: true`。
- `GET /api/health` 返回 `dbBound: true`、`activationSecretReady: true`、`authConfigured: true`，支付状态 `false`。
- `GET /api/categories` 返回 CET4、CET6、IELTS、postgrad 四个分类；这是生产 D1 真实读取。
- 未登录 `GET /api/auth/me` 返回 `LOGIN_REQUIRED`。
- `GET /api/books?category=cet4` 尚无已发布正式小说；不要因此对外出售四级权益。
- 首页“私有测试环境”已通过独立生产 Worker 的发布分支改为“网站上线准备中”并由用户刷新验证。

## 自动回归（S23）

`tests/s23-production-smoke.test.mjs` 使用 Node 22 的**本地内存 SQLite** 与真实 Worker fetch 路由，检查正常分类查询、无会话拒绝、生产环境不开放 staging 测试接口和测试文件、跨站 POST 拒绝以及健康检查不泄露密钥。没有访问生产 D1，也没有制造正式账户或激活码。这些测试与已有 S12 分类授权/重复兑换/跨账号隔离测试共同组成代码层面的基本回归。

建议在正式部署分支增加 CI 必过门槛，且 Cloudflare 的实际发布应以通过测试的 SHA 为准。**GitHub 检查成功 ≠ Cloudflare 生产部署成功 ≠ 真人浏览器验证成功。**

## 生产 D1 只读确认（下一位拥有 Cloudflare 权限者执行）

只在 D1 `miaowu-english-prod`，确认与测试库 `miaowu-english-test` 不是同一个，再执行**这一条只读 SQL**：

```sql
SELECT
  (SELECT COUNT(*) FROM users) AS users_count,
  (SELECT COUNT(*) FROM activation_codes) AS codes_count,
  (SELECT COUNT(*) FROM books) AS books_count,
  (SELECT COUNT(*) FROM account_recovery) AS recovery_count,
  (SELECT COUNT(*) FROM ops_operators) AS operators_count;
```

只报告计数，不提供任何用户名、密码、激活码、Cookie、密钥或账号恢复码。**22 张业务表已经建好，不再执行 BOOTSTRAP 或 ALTER。**

## 真人验收前的必备条件

1. 一枚仅供内部 QA 的 CET4 测试兑换码，必须由持有**相同生产 ACTIVATION_PEPPER**的授权人员离线生成，并且其 HMAC 指纹安全写入生产 D1。不能从 Cloudflare 读回现有 Secret，也不能在聊天、截图或 GitHub 中公开明文代码。
2. 拿到测试码后，在独立测试浏览器中使用全新、不复用的测试用户名与密码进行注册，验证恢复码只展示一次并离线保管。
3. 对账号 A：登录、退出、重登、修改密码、旧 Session 作废；在另一浏览器使用账号 B 验证账号之间数据隔离。
4. 对兑换：同码二次使用必须失败；同类别多发不应消耗备用码；跨类别付费章节需要对应权益。为验证章节 403，需要**经审核的私有/安全测试章节**，不能用未发布的书籍臆测鉴权成功。
5. 首发内容完整通过人工质量复核、合同/隐私/退款/授权政策和真实支付/发码流程确认前，**不能向公众售卖**。

如果没有离线保存的生产 Pepper，**停止生成和导入兑换码**，先查清现有库存和已兑换情况，再单独规划 Secret 轮换；不要把新 Pepper 直接覆盖原值而使已有兑换码失效。
