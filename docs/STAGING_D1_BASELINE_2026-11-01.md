# 2026-11-01 测试 D1 的实际迁移基线（截图核对）

## 证据

用户提供 Cloudflare 控制台截图：Worker `miaowu-english-staging` 当前构建分支是 `dev/s1-auth-and-entitlements`，构建命令 `npm install && npm run check && npm test`，部署命令 `npx wrangler deploy`。Cloudflare 界面顶部「Production」是此 Worker 当前部署的 UI 标签，不能把这个 staging 项目误认作商业生产环境。

在 D1 数据库 `miaowu-english-test` 运行只读查询，仅命中 `editorial_revisions` 和 `word_categories`，未命中 `ops_operators`、`ops_publication_approvals`、`d1_migrations`。

**确定**：007、008 的目标对象尚不存在；005 和 004 中的关键表存在；该数据库缺少 Wrangler 的 `d1_migrations` 历史台账。**未确定**：006 审核表、001–006 全部列与真实约束是否匹配仓库 SQL；`books.last_release_request_id` 是否已出现；具体 Time Travel bookmark、D1 version、恢复能力和数据量。

## 为什么不能现在运行 `npm run db:migrate:remote`

Cloudflare Wrangler `d1 migrations apply` 通过 `d1_migrations` 追踪已执行文件。这里没有这个表，因此不能假定它知道 001–006 已经初始化过。仓库 `db/001_schema.sql` 含 `CREATE TABLE IF NOT EXISTS`，`db/003_public_categories.sql` 含种子数据，而 008 有非幂等的 `ALTER TABLE books ADD COLUMN`；盲目重放旧脚本可能造成基线不一致。此脚本在 `package.json` 中暂时换成明确拒绝执行的安全保护命令。

## 开始远程写入前必须核对

1. 明确 Cloudflare 账号/目标为 **仅测试** `miaowu-english-test`，DB 绑定 ID 与仓库一致。不要对任何生产 D1 操作。
2. 运行 `docs/STAGING_D1_READONLY_CHECK.sql`，记录只读的存在/缺失结果；不要查询密码哈希、个人数据或激活码。
3. 在 Cloudflare → D1 → miaowu-english-test → Time Travel 核实数据库支持点位恢复，**记录写入前准确的 UTC 时间/Bookmark**。Cloudflare 官方说明 D1 Time Travel 总是自动启用，但具体版本和状态必须以该数据库实际页面为准。**不要点击 Restore**。
4. 导出/备份数据库并验证可恢复性后，在一个完全隔离的本地/临时 D1 复制库核对 schema，再测试 007、008 的应用。保留真实线上用户状态的计数对比结果。
5. 只考虑有审查记录的精确增量 SQL；不要用 `wrangler d1 migrations apply --remote` 在无账本的库上重放全部历史。
6. 007/008 测试通过，才允许**单独在测试库**应用。之后验证运营表/触发器存在、现有账号+收藏+阅读仍然正常、S9 生产开关均关闭，再部署 `release/staging-rc-20261101` 的已审候选代码。
7. `main` 与生产 Worker/D1 不能受这次测试迁移影响；不要把 staging 账号、密钥、数据搬到生产。

## 安全判定

只读检查通过 ≠ 数据库备份就绪；GitHub CI 通过 ≠ Cloudflare Deployments Ready；数据库新表存在 ≠ 发布条件具备。对外收费需另行完成真实内容、用户权益、收款、平台类目与售后核验。

## 参考官方文档

- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [D1 export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
