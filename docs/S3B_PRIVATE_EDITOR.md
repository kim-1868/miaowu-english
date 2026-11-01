# 妙屋英语 S3-B · 私有内容工作台（第一版）

## 当前状态

已开发并通过 GitHub 自动化测试，Cloudflare 远程浏览器操作尚待验收。仅用于 **miaowu-english-staging** / **miaowu-english-test**。

已实现：
- `/editor.html`：受测试站 reviewer 门禁保护的草稿管理页面。
- **独立编辑密钥**：即使拥有普通付费读者账号、或者知道测试站的 reviewer 密码，也无法调用编辑 API。
- 查看草稿书目列表、私有草稿章节正文和已标注词汇。
- 选择本地 JSON 或粘贴 JSON，查看本地概要，再经管理员明确确认导入为**未发布**新书目。
- D1 绑定参数 + 事务批处理，发生冲突全部回滚；新内容永远 `books.status='draft'`、`chapters.published_at=NULL`。
- 现有已购分类、测试账号、订单码不会变；本阶段没有正式发布、删除、覆盖既有草稿的按钮。

**本阶段尚未实现：** 直接在网页中逐字段修改章节/词汇、版本修订历史、回滚、审核发布、撤销上线、上传封面、媒体库、支付或跨设备学习同步。页面的「导入为新草稿」是实际 D1 写入，但其他项目仍在后续开发中。

## 唯一需要的 Cloudflare 设置（新 Secret）

1. Cloudflare → Workers & Pages → `miaowu-english-staging` → Settings → **Variables and secrets** / **Runtime variables and secrets**。
2. 确认选择 **Production**（这里是 Worker 部署环境标签，应用实际 `APP_ENV=staging`）。
3. 点击 **Add variable**，填写：
   - **Key**：`S3_EDITOR_SECRET`
   - **Type**：勾选 **Secret**，不能使用普通明文 Variable。
   - **Value**：使用密码管理器独立生成的 48–64 位随机值，至少32个字符。
   - 不要复用 `STAGING_PREVIEW_PASSWORD`、`ACTIVATION_PEPPER`、或妙屋英语测试用户密码。
4. 保存并让新 Secret 部署生效。
5. 不要把值提交 GitHub、截图发到聊天、保存浏览器 localStorage 或写进 README。

**注意：** 现在 Wrangler 的 `secrets.required` 未强制该新项，所以没设置 `S3_EDITOR_SECRET` 时旧的正常阅读和登录不受影响；管理 API 会返回 `EDITOR_NOT_CONFIGURED`，不会开放管理权限。

## 管理后台使用流程

网址：`https://miaowu-english-staging.kim10086a.workers.dev/editor.html`

1. 新无痕窗口首次打开测试站首页，输入现有 `reviewer` 访问密码（原来的测试站保护）。
2. 同窗口进入 `/editor.html`，在「编辑权限」中输入刚设置的 **S3_EDITOR_SECRET**，点击「验证编辑权限 / 读取书库」。密钥仅保留在本页面内存中，刷新页面需重新输入。
3. 需要试运行导入时，打开仓库 `content/examples/cet4-sample-draft.json`，保存为本地 JSON 文件，再在网页中选择该文件（示例是两章虚构内容，不属于正式商品）。
4. 点击「检查 JSON / 查看摘要」；确认书名、章节、单词数，点击「导入为新草稿」，再次确认。
5. 「草稿书库」点击「预览章节与词汇」，检查段落、英文标注和词义是否准确。
6. 再去 `/api/books?category=cet4` 或普通书架确认新草稿**未公开**。
7. 同一个样例再次导入应提示 `DRAFT_ID_EXISTS`；这是预期保护，说明不会覆盖原稿。

目前浏览器后台一次导入上限：15章 / 180词 / 450处单词标注 / 约350KB JSON。完整书籍25–35章需后续实现“向同一本草稿追加章节”和版本审核，**现在不要试图拆成多个相同 book ID 的包导入**，否则会按安全规则拒绝。

## 独立授权接口（仅 staging）

- `GET /api/staging/editor/drafts`：草稿列表（标题、分类、章节数）
- `GET /api/staging/editor/drafts/:bookId`：草稿全文与关联词汇私有预览
- `POST /api/staging/editor/drafts`：JSON 请求体 `{"package": <valid S3 content package>}`，原子写入新草稿

必须同时满足：原测试站 reviewer 访问门禁、`APP_ENV=staging`、有效独立 `X-Mw-Editor-Key` 请求头；POST 还需同源 Origin。禁止把密钥放在查询参数或 URL 路径里。

## 数据安全注意事项

- 原项目的 GitHub 仓库可能被别人访问。未发表的实际商业小说、词表与订单资料应保留在本地，不应提交到 GitHub 仓库。示例 JSON 是可公开的测试片段。
- 本编辑后台没有开通用户注册或正式上线能力，不能把 reviewer 站点访问保护当作生产级管理员后台。
- 若编辑密码泄漏，应在 Cloudflare 中轮换 `S3_EDITOR_SECRET`；不会改变用户登录/激活码权限。不要因为编辑密钥泄漏而轮换 `ACTIVATION_PEPPER`。
- 已建立的 `content_packages` 与 `word_categories` 两张表无需再次执行 SQL。
- D1 导入会在一个 batch 中完成，但仍应定期使用 Cloudflare D1 Time Travel/备份机制保存关键恢复点。
- 今后实现正式发布前需加独立管理员会话、访问限流、草稿历史版本、发布二次确认、撤回管理及完整审计日志。

## 修复记录：编辑权限验证出现 `Unexpected end of JSON input`

用户截图表明 `/editor.html` 页面正常加载，但点击「验证编辑权限/读取书库」出现 `Unexpected end of JSON input`，草稿列表未显示。该截图本身无法判定是密钥错误、D1 读取失败、HTTP 响应为空或 CDN/部署层响应异常。

本次补充：
- `GET /api/staging/editor/check`：必须已有 `reviewer` 测试站授权，且正确提供 `X-Mw-Editor-Key`。验证独立管理员 Secret 与 D1 关键表是否存在，只返回状态/缺表名，不返回密钥或草稿正文。
- 草稿列表、预览中的未预期数据库错误统一返回 JSON：`{"error":"EDITOR_BACKEND_ERROR","diagnosticStage":"drafts.list"}` 或 `drafts.preview`；Cloudflare 日志只记录静态阶段标签。
- 浏览器后台改为先判断 HTTP 状态、Content-Type 和响应是否为空，再尝试解析 JSON；只显示错误码、响应类型、字节长度与固定阶段标签，不在页面展示可能含敏感信息的 HTML 或密钥。
- 新的验证流程：`/api/staging/editor/check` 成功之后再请求 `/api/staging/editor/drafts`；避免把数据读取异常误报为管理员密码不正确。
- CI 增加表结构缺失、密钥错误、数据库查询失败返回 JSON 的回归测试。

**用户验收**：先在 Cloudflare Deployments 确认 GitHub 最新提交 Ready，刷新 `/editor.html`（必要时强制刷新缓存），重新输入独立编辑密钥并点击验证。成功时应显示「编辑密钥验证成功，D1 表结构正常，草稿列表已加载。」及「暂无草稿」。如果失败只反馈后台页面显示的错误提示、HTTP 状态与诊断阶段，**不要发送 Secret、密码或任何未发表正文**。

现阶段 Cloudflare 生产环境中的 staging 部署是否运行最新构建，必须由 Cloudflare 控制台确认；GitHub CI 成功不等于 Worker 实际上线已完成。
