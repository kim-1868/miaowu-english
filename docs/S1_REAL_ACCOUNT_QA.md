# 妙屋英语 · S1 真实账号联调使用说明

当前测试站：https://miaowu-english-staging.kim10086a.workers.dev

## 已验证基础设施
- 测试 Worker 和 D1 `miaowu-english-test` 连接已正常，账号 Secret 配置检查正常。
- `GET /api/categories` 已从真实 D1 返回 cet4、cet6、ielts、postgrad。
- 测试站用 `reviewer` + Cloudflare 私有 Secret 访问，**此访问密码与用户账号密码是不同的**。

## 真实账号联调页面
- 访问受保护的网址 `/account-test.html`。
- 页面中的注册、登录、兑换、退出全部调用现有 S1 Worker API，操作真实 D1 测试数据库。
- 先选择四级并生成一次性**测试激活码**，再设置一个全新测试用户名和测试密码完成注册。
- 刷新页面后再查看登录状态，测试服务器会话是否保持。
- 退出后重新登录，并生成六级测试码；在原账号兑换六级。
- 再使用已经兑换过的同一枚测试码，预期会被拒绝。
- 测试码由 `POST /api/staging/test-voucher` 在服务端随机生成，D1 只保存其 HMAC 指纹。只在 `APP_ENV=staging` 下可用，且受站点 reviewer 身份验证和同源限制保护，最多20枚。
- **测试账号和卡密不等于真实订单、正式权益或付款。** 请勿在此页面输入常用个人密码、真实支付信息或真实小红书订单。
- V0.3 首页依然是设计演示，其章节和生词数据仍为浏览器本地体验；此阶段联调页独立存在，避免误将本地 Demo 内容视为受保护的正式商品。

## 本阶段验收标准
1. `/api/health` 中 `authConfigured:true`。
2. `/api/categories` 能查到四个考试分类。
3. 联调页可生成测试码并用它创建账号，`/api/auth/me` 返回当前账号。
4. 退出、重新登录正常。
5. 第二枚测试码能在原账号增购其他分类；重复使用代码被拒绝。
6. 下阶段将现有注册/登录弹窗替换为真实 API，并把非试读章节从公开前端代码迁入服务端数据库后再进行实际付费权限验收。

保密要求：不要把 `STAGING_PREVIEW_PASSWORD`、`ACTIVATION_PEPPER` 或任意真实用户密码提交至 GitHub/聊天。
