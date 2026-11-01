# S53｜正式 Pages 公开接口最小只读验收探针

日期：2026-11-02。目标是在**不提供任何账号凭证、Cloudflare API Token、测试码或 D1 写权限**的前提下，从真正联网的 GitHub Actions Runner 访问正式 Pages 站点，确认其核心生产路由能工作，并且不会泄露 staging 测试资源。

`node scripts/probe-production-readonly.mjs --readonly` 只调用写死的 `https://miaowu-english-pages.pages.dev`，不允许替换成测试站/其他域名，且全程 **GET**，不会注册、登录、激活、下单或修改任何数据。它依次验证：

1. Pages 无权限边缘探针存在且内部 Worker Service Binding 连接；
2. Worker 只读健康状态：D1 已绑定、认证已配置、Pepper 存在但隐藏，支付状态为明确布尔值；
3. 四类权限目录可读（CET4、CET6、雅思、考研）；
4. 匿名 `/api/auth/me` 必须返回401且不泄漏登录态；
5. CET4 书架接口返回数组，不允许出现 `draft-`/`qa-` 或带“测试/示例/demo”标签的未审核故事；
6. 生产首页存在并包含妙屋英语标识；
7. 7条 staging、编辑测试和 QA 章节路径必须返回404，API错误码固定 `NOT_FOUND`。

**与纯本地单测区别：** `tests/s53-production-public-readonly.test.mjs` 同时提供严格模拟响应测试和联网测试。仅 PR 分支 `qa/s53-production-readonly-acceptance-probe-20261102` 的 GitHub Actions 会自动执行真实联网测试（或者本地显式设置 `MIAOWU_PUBLIC_READONLY_PROBE=1`），不增加其他 PR 的网络依赖。

如果外网 DNS/Cloudflare 访问失败，CI 就会失败——这代表从该执行环境无法验证，并不证明用户所在地不可访问。该探针**无法**代表真实账户登录注册、兑换码、学习记录、付费权限、手机端浏览器及内容质量；这些仍须另行完成人工验收。所有请求都不带账号密码、Cookie、Header Token；不输出实际 API 响应正文或任何敏感信息。

代码合并不等于部署完成，最终应确保 Cloudflare 运行版本 SHA 对应已验收代码，而不只依赖 GitHub 测试绿色标记。