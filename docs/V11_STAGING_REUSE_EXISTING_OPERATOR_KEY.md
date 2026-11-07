# 妙屋英语 V1.1：预览运营台复用正式运营密钥（2026-11-07）

## 用户确认的最终规则

- 操作者在正式运营台和受密码保护的预览运营台输入 **同一把已有的 `mwops_...` 发布者密钥**，不再另记第二把运营密钥。
- **只复用登录时输入的密钥，不复用生产 Worker 的 `OPS_TOKEN_PEPPER`，不复制生产数据库中的用户、订单或学习记录，也不共享写库接口。**
- 预览 Worker 始终绑定 `APP_ENV=staging`、`DB=miaowu-english-test`（ID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`）；公告的草稿、发布与下架全部只影响此测试 D1。
- 正式 Worker `APP_ENV=production` 及其数据库、运营凭证验证逻辑、销售/读者数据均不更改。正式站的公告接口继续保持原有发布门禁。
- 沿用同一把凭证会扩大该凭证暴露在预览环境中的风险；只允许给受密码保护的测试站使用，不向他人分享密钥。

## 为什么原密钥在预览端收到 HTTP 503

`src/ops-access.js` 验证 `X-Mw-Ops-Key` 时，首先检查本 Worker 是否有 D1 `DB` 绑定以及长度至少 32 字符的 `OPS_TOKEN_PEPPER` Secret。缺失时返回 `OPS_NOT_CONFIGURED`，**尚未判断输入密钥是否正确**。

随后，验证器需要当前 D1 中的 `ops_operators` 和 `ops_audit_events`（`db/007_ops_identity_audit.sql`），以及一条 `environment='staging'`、`role='publisher'` 且摘要匹配的有效运营记录。

## 首次配置的安全做法

1. 在使用者电脑上下载并**离线**打开聊天交付的 `wordletter_preview_reuse_existing_key.html`。仅在本机输入原有的 `mwops_...`；不要把原始密钥发送到聊天、公共仓库、终端日志或网页 URL。
2. 工具使用 Web Crypto 随机生成全新的 **预览环境专用** `OPS_TOKEN_PEPPER`（与正式环境 Pepper 不同），再使用 HMAC-SHA256 对 `miaowu:ops:v1:<原密钥>` 计算 staging 摘要。工具不会改变或输出原始 `mwops_...`。
3. 在 Cloudflare **仅对 Worker `miaowu-english-staging`** 的 Settings > Variables and Secrets 设置 `OPS_TOKEN_PEPPER` 为 **Secret**，Deploy 使之生效。若同名 Secret 已存在且被使用，不可盲目覆盖，应先核对预览环境的身份配置。
4. 在 D1 **仅对 `miaowu-english-test`** 核对名称及数据库 ID、检查恢复点，然后依次运行工具生成的 A（007 增量建表）和 B（登记 `wordletter_preview_publisher` 的 staging publisher 记录）。无需向 GitHub 提交 SQL 输出。
5. 回到 `https://miaowu-english-staging.kim10086a.workers.dev/ops.html`，输入**原有** `mwops_...` 验证身份。若公告功能首次提示启用，再点击 `启用公告管理（仅测试站）`，只创建独立 `site_announcements` 表。
6. 仅在预览站发布一条无敏感数据的测试公告，在预览首页查看。不得把测试公告或测试操作导向正式站。

## 排错

- `OPS_NOT_CONFIGURED (503)`：本 Worker 缺少 D1 或 `OPS_TOKEN_PEPPER`（当前是最可能的 Secret 缺失）。
- `OPS_SCHEMA_REQUIRED (503)`：测试 D1 缺少 `db/007_ops_identity_audit.sql` 要求的表/字段。
- `OPS_AUTH_REQUIRED (401)`：预览 Pepper 与 SQL 中摘要所用的 Pepper 不一致、原密钥不匹配或 staging publisher 行缺失/停用。
- `OPS_ROLE_FORBIDDEN (403)`：验证的角色不是 publisher。
- `ANNOUNCEMENTS_SCHEMA_REQUIRED (503)`：公告专用表未初始化，按预览运营台授权按钮启用。

**状态**：受密码保护的预览网站和运营台代码支持上述路径；Cloudflare Secret 与测试 D1 身份登记必须在持有人账号内完成，仓库不会包含任何原密钥、Pepper 或实际 SQL 摘要。
