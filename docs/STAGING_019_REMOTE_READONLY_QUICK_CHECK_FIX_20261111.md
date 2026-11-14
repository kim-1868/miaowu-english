# 测试 D1 019 只读检查失败（2026-11-11）：改为 Cloudflare 支持的 quick_check

## 经真实受保护任务验证的事实
- 用户已两次审核受保护测试 D1 环境。第二次 `current-staging-baseline` 工作 [run #42984399791](https://github.com/kim-1868/miaowu-english/actions/runs/42984399791) 在 `Query only schema and anonymous counts` 阶段失败，安全错误：`STAGING_019_READONLY_INTEGRITY_READ_TOKEN_PERMISSION_DENIED`。
- 因诊断在每个查询失败处就退出，前面的 `COUNTS`（10表、5触发器、11,422词头、16,442词形、019尚未创建、0签核等）及 `FK` 查询**没有触发错误**。最后的 `PRAGMA integrity_check;` 被远程接口拒绝。无法仅凭固定错误分类断定是此 PRAGMA 的 allowlist 限制还是该操作额外权限限制，但这是具体失败点。
- Cloudflare D1 官方兼容 SQL 文档明确列出 `PRAGMA quick_check`，包括 `wrangler d1 execute --command='PRAGMA quick_check'` 用例；原 `integrity_check` 不在兼容列表。参见 <https://developers.cloudflare.com/d1/sql-api/sql-statements/>。
- 本 PR **只替换一个只读命令**：`PRAGMA integrity_check;` → `PRAGMA quick_check;`，严格确认返回字段 `quick_check = 'ok'`，保持已有失败分类、D1固定 UUID、只读Token、GitHub受保护人工审批及全部真实计数硬断言不变。没有 D1 迁移或用户数据修改。
- **不能把 quick_check 冒称完整 integrity_check。** 真正执行019远程增量迁移前，必须对已导入当前考试候选的**新鲜测试库**制作完整加密持久备份，恢复到隔离SQLite副本，再用 `PRAGMA integrity_check`、`PRAGMA foreign_key_check` 及源备份哈希/记录核验，获得独立人工批准。只有本 PR 的只读检查成功远远不够部署/迁移。
- 回归：新合成测试确保 workflow 使用 quick_check、拒绝旧命令、保留远程只读保护和备份后的完整校验要求；GitHub专项019离线回归与全站S1为准。
- 修复合入 Draft #206 开发分支后，使用最新新建的受保护只读run审批；**不要 rerun 旧 #42984399791**。

## 合规边界
没有任何 Publisher 签核教学义项，没有在 Cloudflare D1 中执行019，没有修改正式站。11,422候选词头与私有7,391考试目标范围口径不同，所有相关已有内容继续复用。
