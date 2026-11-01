# 2026-11-01 · S9 真实 Cloudflare 测试库增量升级值守操作清单

> **严格仅限 Cloudflare D1 `miaowu-english-test`，UUID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`。不得对任何生产库执行。**
>
> 这是一份分阶段的人工值守步骤，不是自动部署脚本。执行 007/008 属于真正的远程写入，每一步必须看到成功结果再继续，不允许无条件批量连续执行。

## 基线已确认

- 用户保存了当前 D1 Time Travel bookmark，Cloudflare 页面显示 7 天可恢复窗口；
- 用户在 Mac 上将完整远程数据库导出为 `$HOME/Documents/MiaowuPrivateBackups/miaowu-english-test-2026-11-01.sql`；
- 经本地真实 SQL 备份恢复校验：`verified=true`、`integrity=ok`、`foreignKeys=ok`；
- 真实 SQL 备份的**修复版**离线迁移演练报告：`dryRunPassed=true`、`oldRowsPreserved=true`、`oldTablesChecked=17`、`newTablesCreated=4`、`remoteDatabaseModified=false`；
- 基线数据：books=3、chapters=7、users=1、entitlements=2、reading_progress=4、user_words=5、review_events=5；
- 旧库没有 `d1_migrations`，没有任何 S9 运营表或 008 新列；审核记录表存在；
- 007/008 数据库 SQL 在本地真实数据副本上模拟执行已通过。**这不代表远程迁移已执行。**

## 0. 前提（必须确保）

- 当前终端位于 `release/staging-rc-20261101-dryrun-fixed` 项目根目录，含有匹配已演练的 `db/007_ops_identity_audit.sql` 和 `db/008_ops_release_workflow.sql`。
- 在真实测试库开始写入前保持现有 staging Worker 的构建分支 `dev/s1-auth-and-entitlements` 不变，`main` 不变。
- 用户仍然能访问自己的原始私有备份且备份未放入 GitHub，书签已保管。
- 只读远程预检结果与之前基线吻合。如出现不同的库名/UUID/计数、S9 表或新列已存在、任何 SQL 错误，立即停止。

## 1. 真实远程库只读预检

先核对 DB ID：

```sh
npx wrangler d1 info miaowu-english-test
```

然后读取现有数据量（不返回任何私人内容）：

```sh
npx wrangler d1 execute miaowu-english-test --remote --command="SELECT (SELECT COUNT(*) FROM books) AS books, (SELECT COUNT(*) FROM chapters) AS chapters, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM entitlements) AS entitlements, (SELECT COUNT(*) FROM reading_progress) AS reading_progress, (SELECT COUNT(*) FROM user_words) AS user_words, (SELECT COUNT(*) FROM review_events) AS review_events;"
```

**预期：3, 7, 1, 2, 4, 5, 5。** 如果任何计数变化，不能使用旧备份继续假定数据库未变化，应先重新评估并更新备份，再考虑升级。

再读 schema 是否仍没有 S9：

```sh
npx wrangler d1 execute miaowu-english-test --remote --command="SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_operators') AS ops_operators, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_book_content_versions') AS ops_book_content_versions, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_publication_approvals') AS ops_publication_approvals, (SELECT COUNT(*) FROM pragma_table_info('books') WHERE name='last_release_request_id') AS release_column;"
```

**预期四项全部 0**。任何一项不为 0，说明已部分升级，**不要重放脚本**。

## 2. 007（真正的远程写入，必须独立执行并验收）

如果并且仅如果以上预检通过，在测试库执行：

```sh
npx wrangler d1 execute miaowu-english-test --remote --file=db/007_ops_identity_audit.sql
```

若 Wrangler 显示目标 UUID，须与上文完全一致。若工具提示本次写入可能导致数据库暂时不可用，需在测试环境可接受的时间操作。

**007 成功后单独验收：**

```sh
npx wrangler d1 execute miaowu-english-test --remote --command="SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_operators') AS ops_operators, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_audit_events') AS ops_audit_events, (SELECT COUNT(*) FROM ops_operators) AS operators_created, (SELECT COUNT(*) FROM ops_audit_events) AS audit_events;"
```

期望 1,1,0,0。若失败或结果不符，**不要执行 008**，保持 Cloudflare staging Worker 旧代码运行，反馈错误并用已保存备份评估恢复。

## 3. 008（第二次真正写入，必须 007 验收合格后才允许）

```sh
npx wrangler d1 execute miaowu-english-test --remote --file=db/008_ops_release_workflow.sql
```

**008 完成后单独验收：**

```sh
npx wrangler d1 execute miaowu-english-test --remote --command="SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_book_content_versions') AS version_table, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_publication_approvals') AS approval_table, (SELECT COUNT(*) FROM pragma_table_info('books') WHERE name='last_release_request_id') AS release_column, (SELECT COUNT(*) FROM ops_book_content_versions) AS version_rows, (SELECT COUNT(*) FROM ops_publication_approvals) AS approval_rows;"
```

期望 1,1,1,3,0。再次执行第 1 步原始计数查询，期望旧记录数量不变。异常时 **停止**，不要尝试盲目重新执行 008（含非幂等 ALTER TABLE）。

## 4. 远程测试库升级完成 ≠ Worker 部署完成

- 数据库脚本执行后，运行中的 Worker 仍使用原来的 `dev/s1-auth-and-entitlements`，不应改变；新表没有任何用户或真实运营权限会被自动开通。
- 此候选分支的 `OPS_CONSOLE_ENABLED`、`OPS_PUBLICATION_ENABLED`、`OPS_WITHDRAWAL_ENABLED` 必须保持未配置/false。
- 在严格的代码 review、所有 CI 通过以及 D1 schema 验收之后，才考虑将 Cloudflare Worker 的 GitHub 构建分支切到稳定验收候选版本。
- 不合并 `main`、不设置支付/真实销售、不发布任何 QA/测试文章。

## 5. 发生错误如何处理

- **只读查询错误**：停下，纠正命令或核实数据库目标，不尝试执行迁移。
- **007 或 008 执行错误**：停止其余步骤；禁止随意 `DROP TABLE` / `DELETE` / `RESTORE`。
- 先保存完整报错/结果，检查当时已创建的表及列，与原始备份和 Time Travel bookmark 比对，再决定修复或恢复。
- 点 Time Travel **Restore** 会覆盖此数据库当前状态，不能当成“查看恢复点”，也不能未经完整影响评估就执行。
- Cloudflare 官方命令依据：https://developers.cloudflare.com/d1/wrangler-commands/；`d1 execute` 的 `--remote --file` 与 `--remote --command` 为官方支持方式；**不要用 `d1 migrations apply --remote`，旧库没有 `d1_migrations`**。

## 当前用户下一步

**仅执行第 1 步的两条只读预检查询，回传终端结果**。确认无误后再单独执行 007、审核，再执行 008。
