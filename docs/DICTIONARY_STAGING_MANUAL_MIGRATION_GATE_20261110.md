# 妙屋英语 · 真实 staging D1 013–018 安全迁移门禁（2026-11-10）

> **执行状态：仅代码准备、离线模拟、预览只读检查通过。绝无线上 D1 写入、正式部署、词卡上架。**

## 已实证的基础
- 测试 D1 为 `miaowu-english-test`，ID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`。read-only Actions [#42812504129](https://github.com/kim-1868/miaowu-english/actions/runs/42812504129) 实际查到全部 `global_dictionary_%` 表 **0/10**，且 Time Travel bookmark 能读取。不会把 `miaowu-english-prod` 作为操作对象。
- [离线增量迁移 #42810343222](https://github.com/kim-1868/miaowu-english/actions/runs/42810343222) 通过：013–018 建 10 表，审阅触发器，用户购买/收藏/进度原行不变且可重复应用。
- [本地回滚演练 #42810658651](https://github.com/kim-1868/miaowu-english/actions/runs/42810658651) 通过：中途失败/全部执行后均能恢复一次性SQLite基线；**不等于已经进行真实 D1 Time Travel restore**。
- 公共仓库持续自动回归已通过；原始私有词卡数据只存在 ChatGPT 私人 Library，不写公有仓库。

## 安全工具

`scripts/execute-staging-dictionary-schema.mjs`：
- 默认执行时只有本地模拟，不连接 Cloudflare；必须额外传入 `--execute-test-only` 并匹配 GitHub 真实 Actor、仓库、Git ref、目标名称和 UUID、完整手动审批短语与 D1 写权限才能执行远程 SQL。
- 再查询实际测试库字典表必须为 0，保存 Time Travel 当前恢复点可用性并公开不含书签值的 UTC 恢复参考时间；只执行白名单六份 SQL 文件，最后检验 **10 张表与 5 个关键拦截 Trigger**。
- 避免使用 `wrangler d1 migrations apply --remote`（已有测试库历史无完整 ledger，重放 001–012 有风险），不修改 `words` / `user_words` / `chapter_words` / `review_events` / `entitlements`，不导入词头、不迁移用户掌握状态，也不进行自动 Time Travel restore。
- 如任意步骤失败，仅报状态，停机等待人工评估。真正 Time Travel restore 是覆盖式恢复，会抹除恢复点后写入的数据，需单独评估及批准。
- 本次使用的 D1 只读 Secret `CLOUDFLARE_STAGING_D1_READ_TOKEN` 保持只读。

`.github/workflows/global-dictionary-staging-migrate-manual.yml`：
- **只有 `workflow_dispatch`，没有 push / PR 自动触发。**
- 固定 `github.actor == kim-1868`、固定开发分支 `feature/v11-smart-vocab-preflight-20261109`；要求操作人输入 `miaowu-english-test`、`88a817cb-23bb-4ae4-bcb8-92286c4165d4`、`STAGING_013_018_ADD_ONLY`。
- 配置 `environment: staging-d1-schema-approval`，需在 GitHub Settings → Environments 中**人工创建 Environment 并设 required reviewers**；该环境中独立配置 **`CLOUDFLARE_STAGING_D1_WRITE_TOKEN`**（只对相应 Cloudflare 帐号授予 D1 Write，尽量短有效期）。此 Token 往往具有该账号下其他 D1 的潜在权限，不能声称其自身只绑定单库；代码层硬锁测试名称和 UUID。
- **当前该 workflow 仅在开发分支**，GitHub 要求手动触发工作流在默认分支也存在。为了不让 main 的任何 CI/CD 误触发真实网站，我们没有向 main 推送代码；需要后续单独安全批准将“手动工作流文件”置于默认分支，再选定 feature 分支执行。
- Secret 不应发送到聊天、工单、公开 Actions 日志或 URL。

## 真正迁移前站长需要操作什么（仅在工作流审查通过后）
1. 打开 GitHub 仓库 Settings → Environments → New environment，名称必须是 `staging-d1-schema-approval`，配置 required reviewers（站长自己或指定第二审核人，是否允许自审依 GitHub 实际 UI）。
2. 从 Cloudflare API Tokens 创建**另一枚**短有效期 `Account / D1 / Write` Token。它仅选中包含测试库的 Cloudflare 账号，牢记账号范围不代表数据库范围。复制到该 GitHub Environment 的 secret `CLOUDFLARE_STAGING_D1_WRITE_TOKEN`，**不要覆盖原有只读 Token 和生产部署 Token**。
3. 等仅手动工作流安全地存在于 GitHub 默认分支，站长明确发起并审核；预检通过后由环境审核人放行。流程会先记录恢复参考时间，才创建测试库新表。
4. 完成后再次使用只读 Token 验证 **10/10 + 5 Trigger**，并核对原有账号、权益、书籍、复习、订单等匿名一致性与真实回滚方案。

## 用户三个最终上线目标仍未完成
- 当前私人 Library `/开发英语单词学习网站/统一词卡_待审工作区/` 已实际生成 920 个主词卡**草稿**/1150 个严格义项候选，保留旧 2206 词卡 ID；**正式独立审核课程义项仍 0**。不能把 40 万未审来源词头或 920 草稿等同于可售卡。
- 2026-11-06 旧档中六级《末班车前请回信》111/111、考研《第十三张底片》122/122 为同源文本匹配；现在正式 CET4 23 本、CET6 5 本的受保护最新正文仍待 publisher 导出及真实全量审校。
- 新 V2 小说无 `words[]` 转换与词义级预检代码已经通过模拟测试，但必须在真实 staging D1 导入**已审**教学卡，验证同义项共享/异义项独立、收藏/复习/权限/409 修订/移动端后再上生产。
