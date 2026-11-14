# D1 统一词典 013–018 增量迁移：离线验收与真正测试库实施条件

更新于 2026-11-10。

## 已经确认的真实环境
- Cloudflare 测试 D1：`miaowu-english-test`，UUID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`，正式 D1 不在本迁移范围。
- [只读检验 Run #42806429653 Attempt 2](https://github.com/kim-1868/miaowu-english/actions/runs/42806429653)：基础表在，统一词典相关表 0/7，稳定 sense_id 表未创建。
- [Time Travel 只读校验 Run #42809350007](https://github.com/kim-1868/miaowu-english/actions/runs/42809350007)：书签读取成功，但 **尚未留存实际迁移专属书签/执行完整备份或还原**。
- 测试库历史上未记录 Wrangler 全量迁移 ledger：不得直接使用 `wrangler d1 migrations apply --remote`，可能误重放 001–012。

## 本轮已写成可跑的离线门禁
`scripts/rehearse-dictionary-staging-migration.mjs` 只做下列事情：
1. 精确校验 013–018 的 SQL 文件顺序、SHA256、明确的 10 张新表名单。
2. 检测旧表 DELETE/UPDATE/ALTER、未受控 CREATE、DROP、BEGIN/COMMIT 等不合适修改。
3. 使用一次性内存 SQLite，先填充测试账号、书、章节、旧词卡、已购买级别、阅读进度、收藏及复习状态。
4. 只执行 013–018 并重复执行检查幂等；验证 foreign_key_check 和 integrity_check，旧表记录及已学/权限内容字节级等值。
5. 输出仅含文件哈希与匿名 PASS 指标，不包含真实用户数据，不使用 Cloudflare 密钥。
6. GitHub `.github/workflows/global-dictionary-staging-migration-dryrun.yml` 可以在当前开发分支 push 后跑通；也不会真正迁移测试库或生产库。

## 下一阶段真实 staging D1 迁移的硬门禁
1. 站长持有独立的 D1 Read Token，**继续保持只读**。需要实际写入表结构时，另建 `CLOUDFLARE_STAGING_D1_WRITE_TOKEN`，权限 D1 Write、只选对应 Cloudflare 测试账号，并限制有效期；GitHub Actions 流程自身强锁 test 数据库名称和 UUID。注意 Cloudflare Token 权限通常是账户级别，而不是单库隔离。
2. 在操作前即时获取 **测试库专用** Time Travel bookmark 和 UTC 时间，以秘密或其他受控方式保存，验明 7/30 天保留窗口；制定恢复方案。Time Travel 并非长期 SQL 导出；`wrangler d1 export --remote` 会锁库并要求 **D1 Write**。实际数据库变更前必须决定是否需要单独可验证的 SQL 备份。
3. 真正的远程迁移不能自动随分支 push 触发；必须显式审批。需要一个独立的受审批 `workflow_dispatch` 门禁、DB UUID 双重校验、执行前快照、只对 test D1 执行白名单 SQL `db/013` ... `db/018`，不得运行 Wrangler 对 001–012 的全量迁移。
4. 迁移后用 D1 Read Token 复查所有 10 张新增表、触发器和既有账号/章节/学习表的匿名行数及 schema hash；失败后人工评估恢复点，**禁止自动执行破坏性 Time Travel restore** 以免覆盖期间的新测试数据。
5. 词典来源索引导入、教学习题审核、已有书籍映射、未来 V2 自动匹配都在此安全基础之上进行，**未审 ECDICT 40 万词头不可直接设为可售教学卡**。

文档与 GitHub [Issue #208](https://github.com/kim-1868/miaowu-english/issues/208) 同步。