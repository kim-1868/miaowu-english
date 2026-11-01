# S9 · 从完整 D1 备份进行精确的离线升级演练

## 已实测的操作前提

- 用户已自行保存 `miaowu-english-test` 的 Time Travel bookmark（可用窗口 7 天内，不能替代独立备份）。
- Wrangler `d1 info` 确认数据库 UUID 为 `88a817cb-23bb-4ae4-bcb8-92286c4165d4`，17 表、数据量 221KB。
- 用户已成功执行 `d1 export --remote` 到本机私有路径 `$HOME/Documents/MiaowuPrivateBackups/miaowu-english-test-2026-11-01.sql`。
- 用户已运行离线备份校验，得到 `verified:true`、`integrity:ok`、`foreignKeys:ok`；包含 3 本书、7 章、1 用户、2 个授权、4 条阅读进度、5 条词汇记录、5 条复习记录。
- 云端尚未执行 007/008；旧库无 `d1_migrations`。不要运行 `wrangler d1 migrations apply --remote`。

## 为什么要做这一步

已有的 GitHub 自动化测试采用模拟历史 schema，但用户的备份才代表真实 staging 当前状态；需**先用原样完整备份离线恢复，实际执行 007/008**，验证与历史结构的兼容性。

`scripts/rehearse-s9-migration.mjs` 会：
1. 将完整 SQL 私有备份装入**本机内存数据库**，不会上传或修改原始备份；
2. 验证历史17表齐全、旧版运营表/迁移台账不存在；
3. 记录所有17张原有应用表的每行内容指纹（不打印出来）；
4. 在该临时内存库中执行 `db/007_ops_identity_audit.sql` 和 `db/008_ops_release_workflow.sql`；
5. 确认4张运营新增表、1列版本请求字段及旧书版本记录已产生，审计/审批表没有虚构数据；
6. 校验 17 张旧表的行数据指纹完全不变，测试书籍修改自动增加版本号并撤销测试；
7. 再做数据库完整性检查与外键检查。
8. **输出只包含统计数字**，不包含明文用户身份、激活码、密码哈希或正文。无任何 Cloudflare 远程调用。

## 本机执行方法

从 GitHub 下载包含此工具的 `dev/s9-migration-dryrun` 分支 ZIP，解压，在终端 `cd` 到这个新目录，然后执行：

```bash
npm install
npm run db:dry-run-s9 -- "$HOME/Documents/MiaowuPrivateBackups/miaowu-english-test-2026-11-01.sql"
```

验收通过必须出现 `"dryRunPassed": true`、`"oldRowsPreserved": true`、`"integrity": "ok"`、`"foreignKeys": "ok"` 与 `"remoteDatabaseModified": false`。如果失败，**停止**，只反馈出错代码。

旧项目文件夹（`release/staging-rc-20261101-backup-ready`）没有这个新工具，不能直接运行此命令；不要在其中单独猜文件或执行危险迁移。

## 演练成功后，下一步仍非自动升级

1. Cloudflare 登录与 DB UUID 再核对；
2. 在真实测试库上运行**只读** schema/记录计数比对；
3. 显式确认该数据库仍为 staging 的测试库，且备份与状态接近；
4. 如满足上述要求，仅使用 **`wrangler d1 execute miaowu-english-test --remote --file=db/007_ops_identity_audit.sql`** 和随后 **008** 的文件命令（两步分别检查，严格禁止重复执行）。如任一步出错，停止并保留原始备份；
5. 再验证新表结构、旧记录计数/学习功能、发布开关关闭；
6. 最后才调整 Cloudflare staging Worker 构建分支与实机验收。

**数据库写入不能由本离线演练脚本自动触发。** 生产库或正式售卖功能更不在本步骤范围内。
