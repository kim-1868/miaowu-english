# S9-A · 独立运营身份与不可变审计（开发分支，未授权上线）

## 本轮真实交付

1. 新增仅供后续生产系统使用的独立运营身份表 `ops_operators`（editor / reviewer / publisher，一人一角色），以及仅追加写入、数据库触发器禁止 UPDATE/DELETE 的 `ops_audit_events`。
2. `src/ops-access.js` 提供基于**独立环境专用 HMAC pepper + 256-bit 随机操作员密钥**的校验与精确角色匹配。仅 `GET /api/ops/me` 暴露只读的角色/环境信息，严禁普通账号登录态或 S3 Editor Secret 冒充运营人员。
3. `appendOpsAudit` 为后续 S9-B/C 提供有约束的追加写入原语，数据库对同一事件+请求 ID 有唯一约束；**当前没有调用它的发布/撤回 API**。
4. `scripts/create-ops-operator.mjs` 是**开发者本地**的人工开通工具，不经过公网，不自动操作 D1。只输出私有目录 `private-output/` 下权限 0600 的临时文件，包含单次生成的密钥和待人工检查的 SQL。不得 commit。
5. `tests/s9-ops-foundation.test.mjs` 检查角色隔离、无密钥/错密钥/停用/跨环境拦截、缺迁移拒绝、staging 双层访问门禁、无发布 API、审计不可篡改与去重。GitHub CI 合并前必须成功。

## 架构边界

- 测试站仍以 `dev/s1-auth-and-entitlements` 为部署分支，本 S9-A 独立 feature 分支 **不会自动部署**；需要走 PR 审查与安全灰度。
- `db/007_ops_identity_audit.sql` **尚未在任何远程 D1 上执行**。在手工核对备份、远程 migration history 和目标数据库前不可执行。
- 没有配置或配置错误的 `OPS_TOKEN_PEPPER` 会让运营接口返回 `OPS_NOT_CONFIGURED`，不会降级使用其他凭证。
- 运营密钥仅能放在 `X-Mw-Ops-Key` 头中；不写 localStorage、不嵌入 HTML/JS，不传给读者，不记在日志/Issue/聊天。使用 HTTPS。
- 演示审核签字仍只是 S3 staging 的测试记录，**不会自动转换成生产审核批准**。
- 该阶段只有自报运营角色和只读身份验证；尚无用户界面的安全登录会话、多因素认证、生产人员身份验证流程、双人审批、生产发布和撤回权限。实际公开生产前仍需要完善这些安全措施。
- 将来 S9-B 发布审核必须由不同的 `ops_operators.id` 分别完成，不能只以 `role` 字段自称已复核。生产操作需使用可验证的人员身份与额外安全限制，不得仅将此 API key 直接暴露给浏览器端作为最终生产管理员登录方案。

## 开发测试

```bash
npm run check
npm test
```

本地临时开通测试身份的用法（**不得使用实际生产 pepper 做测试**）：

```bash
# 仅展示命令结构，OPS_TOKEN_PEPPER 必须通过安全的环境变量注入，不能提交到仓库
node scripts/create-ops-operator.mjs staging reviewer ops-reviewer1 "Review operator"
```

脚本要求环境变量 `OPS_TOKEN_PEPPER` 至少 32 字符，不满足就拒绝；执行前先自行设置。生成文件被 .gitignore 忽略，应尽快转存至密码管理器并安全擦除本地副本。需要由独立人员在对应环境的 D1 中人工执行其 SQL；**本阶段不需要用户现在创建真实运营密钥或配置任何 Secret**。

## S9-B 下一步

- 基于真实可识别的独立审核人与发布人、明确审批时效和版本指纹设计服务端审批流程；
- 事务化发布、撤回、重复请求/故障回滚、审核过期拒绝；
- `docs/S3D0_PUBLICATION_PREFLIGHT.md` 的只读报告不可直接视作生产许可；
- 不能发布任何 `qa-` / 示例 / 测试书或未审真实商品；
- 内容和售卖尚未验收前，PR 保持 Draft，不能合并 main。
