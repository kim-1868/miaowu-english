# S1: 账号、激活码与付费章节 API（开发版）

**状态：服务端代码已实现，尚未绑定 Cloudflare D1 或完成线上部署。V0.3 前端仍是浏览器内的模拟账号/演示内容，不能用于真实交易。**

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
- PBKDF2-SHA256 310000次 + 用户独立16字节盐；哈希而非明文保存密码。
- 激活码先规范化再用服务端 HMAC-SHA256 签名保存；必须随机独立生成，且**不得将演示码用于发货**。
- 兑换使用 D1 的 `batch` 事务，避免并发重兑与账号未建成却消耗激活码。
- 会话是随机32字节 Token 的 SHA-256 摘要，使用仅服务器可读的 HttpOnly、SameSite=Lax Cookie；线上还包含 Secure。
- 账号、激活失败尝试按服务端可得 IP/账号维度限速。部署前仍需 Cloudflare WAF/Rate Limiting 及压测。
- 返回的词汇和章节只限可访问的分类；本文档尚未涵盖带权限保护的音频。
- 真实系统还需补充找回密码、客服退款/撤销、运营后台、备份、隐私与服务期限说明。

## 本地建表（绑定数据库后）
依次执行 `db/001_schema.sql`、`db/002_s1.sql`、`db/003_public_categories.sql`。

为了避免误发货，本阶段没有任何在线管理端生成可售激活码；后续需加入带审计日志的运营侧批量制码与导出工具。
