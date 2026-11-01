# S9-B｜单人双步骤审核 + 原子发布（代码开发，默认关闭）

## 为什么不采用两名员工签字

妙屋英语目前由一个人运营，不强制不同自然人审批；**这不是“双人审核”**。版本冻结由两次独立、明确的动作实现：

1. **内容审核确认**：站长完成原创性、版权、英语和词汇、试看/付费范围的真实人工复核，提交三项完整的确认和备注，存入不可更新/删除的 `ops_publication_approvals`。仅确认，不上架。
2. **发布确认**：再次提交当前书名、精确 fingerprint 和 approval ID；服务端重新审核并检查 `ops_book_content_versions` 是否变化。通过后才更新书和章的公开状态，并在同一事务写入审计事件。

## 新增后端

- `db/008_ops_release_workflow.sql`：为 `books` 新增 `last_release_request_id`；内容版本表及编辑相关触发器；不可篡改的 `ops_publication_approvals`。**此 SQL 尚未在 Cloudflare 执行**。
- `src/ops-publication.js`：三种仅限有效 publisher 运营身份的 API：
  - `GET /api/ops/books/:bookId/readiness`：仅只读，返回结构检查结果、内容版本、最新有效审批。
  - `POST /api/ops/books/:bookId/approve`：要求 `requestId`、`expectedFingerprint`、三项真实勾选、审核备注；保存版本绑定审批及操作审计，不发布。
  - `POST /api/ops/books/:bookId/publish`：要求 `requestId`、`expectedFingerprint`、`approvalId`、手动再次输入完整的 `confirmTitle`；服务端重新审核；对版本号采用 SQL 乐观锁，单次 D1.batch 原子写入书/章节状态和审计事件。失败回滚所有写入。
- 有效审批须绑定当前运营人员 ID；当前单人模式不要求第二人，但不同角色不得擅自冒充 publisher。
- 作品 ID 或标题包含 `qa-` / 示例 / 测试 / sample / demo / test 的内容一律拒绝审批、发布。
- 旧审核在章节、共享词库、章节词锚点、分类词关系、编辑历史等变动后因版本号变化而自动失效，包括改回原文字。
- 付费正文仍走原有服务端分类授权鉴权。旧用户权益、学习进度、激活码在此流程中均不变。
- 强制 `OPS_PUBLICATION_ENABLED === "true"` 才允许审批或发布。默认未配置时为拒绝，不使用 S3_EDITOR_SECRET、reviewer、普通用户 cookie 提权。
- `tests/s9-publication.test.mjs` 测试角色隔离、禁止测试书、审稿过期、并发修改失败、支付内容不可绕过、重复请求、审计写入失败全部回滚。

## 仍不能认为正式售卖已具备

- S9-B 当前仅有 API，不提供管理员网页 UI；**尚未上线，没有迁移或生产密钥**。
- 尚未实现主动撤回/恢复、运营身份前端安全登录、多因素认证、生产安全检查、恢复演练和用户权益/售后规则。
- `OPS_PUBLICATION_ENABLED` 不应在生产环境中自行打开，直到 S9-C 完成和生产审查确认；其余商用前置条件仍按 `docs/LAUNCH_HANDOFF_2026-11-01.md`。
- API 目前采用高强度运营 bearer token，只适合作为受控开发和服务器端调用基础；在设计浏览器运营后台前，不要把它放到网页源代码、浏览器 localStorage 或公开日志。
- 当前 S9-B 分支以 S9-A 分支为基础，S9-A 与 S9-B 都必须通过 CI 和代码安全检查后才能推进合并；测试站继续沿用既有分支。
- 数据库 008 迁移含触发器和表结构变更，需核对 D1 已有 001–007 的部署/迁移历史、备份、恢复方案、并发写压力后再操作，尤其不能手工盲改生产 D1。

## 后续 S9-C

- 正式可操作后台与稳定登录/身份核验（必要时独立二次认证），展示内容审核报告、人工确认、版本变化、上架及撤回状态；
- 业务撤回与已购用户权益、退款、订单状态政策；
- Cloudflare staging 实际浏览器验收、D1 备份恢复演练，再考虑公开部署。
