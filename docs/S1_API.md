# S1: 账号、激活码与付费章节 API（开发版）

**状态：Cloudflare 测试环境已绑定 D1 并通过健康检查与分类读取；V0.3 首页仍是模拟账号，单独的 `/account-test.html` 使用真实 D1 测试账号。注册、登录及兑换正在联调，未经实际环境验收不得用于真实交易。**

## 必需环境
- Cloudflare Worker binding `DB`：D1 数据库。
- Worker secret `ACTIVATION_PEPPER`：至少32字符，使用密码管理器生成并仅存于 Cloudflare Secret；绝不上传 GitHub。
- 只能通过 HTTPS 访问线上 API，`localhost` 开发例外。
- 所有 POST 都需同源 `Origin` 和 `Content-Type: application/json`，限制 8KB。

## 路由
| 路由 | 登录要求 | 行为 |
|---|---|---|
| `GET /api/health` | 否 | 检查开发环境是否配置 |
| `POST /api/auth/register` | 否 | `{username,password,activationCode}`，原子创建用户、单次兑换、分类权益、会话 |
| `POST /api/auth/login` | 否 | `{username,password}`，返回 HttpOnly Cookie |
| `POST /api/auth/logout` | 是/否 | 撤销 Cookie 对应会话 |
| `GET /api/auth/me` | 是 | 返回当前用户名和已购分类 |
| `POST /api/activate` | 是 | `{activationCode}`，增购并原子开通对应分类 |
| `GET /api/categories` | 否 | 公开考试分类目录 |
| `GET /api/books?category=cet4` | 否 | 公开已发布小说简介，不返回付费正文 |
| `GET /api/chapters/:id` | 试读无需登录，付费需 | 服务端校验小说已发布、章节发布日期及分类购买权益 |

## 技术要点
- 用户名支持3–24位文字、数字、下划线、连字符，统一小写规范化；密码10–128位。
- Cloudflare Workers WebCrypto 实际存在 PBKDF2 迭代上限（2026年报告超过 100000 会失败）；测试阶段采用 **HMAC-SHA256 服务器密钥预处理 + PBKDF2-SHA256 100000 次 + 每用户16字节随机盐**，以版本化哈希标识写库，绝不保存密码明文。测试库目前 `users=0`，无需迁移存量密码。正式上线前需重新评估密码派生强度、CPU 限制和身份服务方案。由于此测试实现重用了现有 `ACTIVATION_PEPPER` 进行不同域的 HMAC，后续生产应使用独立的密码 pepper，并制定密钥轮换方案。
- 激活码先规范化再用服务端 HMAC-SHA256 签名保存；必须随机独立生成，且**不得将演示码用于发货**。
- 兑换使用 D1 的 `batch` 事务，避免并发重兑与账号未建成却消耗激活码。
- 会话是随机32字节 Token 的 SHA-256 摘要，使用仅服务器可读的 HttpOnly、SameSite=Lax Cookie；线上还包含 Secure。
- 账号、激活失败尝试按服务端可得 IP/账号维度限速。部署前仍需 Cloudflare WAF/Rate Limiting 及压测。
- 返回的词汇和章节只限可访问的分类；本文档尚未涵盖带权限保护的音频。
- 真实系统还需补充找回密码、客服退款/撤销、运营后台、备份、隐私与服务期限说明。

## 本地建表（绑定数据库后）
依次执行 `db/001_schema.sql`、`db/002_s1.sql`、`db/003_public_categories.sql`。

为了避免误发货，本阶段没有任何在线管理端生成可售激活码；后续需加入带审计日志的运营侧批量制码与导出工具。

## 运营侧独立激活码（暂不用于真实售卖）

`scripts/generate-activation-codes.mjs` 是离线运营工具。在可信的本地环境设置 `ACTIVATION_PEPPER`（必须与 Worker 密钥相同）、`CATEGORY_ID=cet4`、`COUNT=10`，再运行 `node scripts/generate-activation-codes.mjs`。程序在被 Git 忽略的 `private-output/` 目录中生成：

- `inventory-*.csv`：仅用于获准的小红书自动发货工具导入，含一次性明文激活码；严禁上传到代码仓库或发送到聊天。
- `import-*.sql`：不含明文码的 D1 导入语句；在确认数据库和分类数据后由运营人员执行。

**真实注册尚处于测试联调阶段，先不要生成和发放正式激活码。** 正式操作需补充发货库存对账、退款撤销、重发审计及秘密轮换方案。此脚本不会直接访问小红书或 Cloudflare。

## 2026-10-31 注册测试故障排查

- 用户实测：`databaseSchemaReady:true`，`users:0`，`vouchersUnused:2`，`vouchersRedeemed:0`。
- 对照 Cloudflare Workers 上限后，识别旧版 `PBKDF2 310000` 很可能在执行前被拒绝（根因仍需 Cloudflare staging 实机验证）。
- 修复方案在 `src/security.js` 实现 Workers 兼容的预处理版本并保留盐和单向存储。
- 修复部署后可重用现有未兑换测试码尝试一次；若失败，查看 `diagnosticStage`，并参考 `/api/staging/diagnostics`；勿传真实密码或测试码到聊天。
