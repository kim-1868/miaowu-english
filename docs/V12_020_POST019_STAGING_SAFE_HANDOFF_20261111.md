# 妙屋英语 V1.2 · 019 后的 020 安全准备（2026-11-11）

019 测试数据库迁移已成功：GitHub Actions https://github.com/kim-1868/miaowu-english/actions/runs/43050271102 。日志显示新增两表两索引，旧数据保护、FK 和 quick_check 均通过。

本批实现的是 020 **迁移前准备**，并不代表 020 远程已执行。

1. .github/workflows/v12-sense-020-post019-readonly.yml：仅受保护的 TEST D1，校验019两表及索引存在且空、020两表两索引三触发器不存在、词库61422候选/16442词形、未审核词义0、外键及完整性；不读个人行。
2. scripts/verify-staging-020-post019-baseline.mjs：严格核对聚合 JSON 与旧学习/订单总数的非负有效性；异常立即拒绝。
3. .github/workflows/v12-sense-020-post019-encrypted-backup.yml：全量导出019迁移后的新测试快照，AES256-GPG加密、独立SQLite解密恢复、FK和integrity_check，上传仅加密artifact；用户必须再自行保存离线加密备份与密码。
4. tests/v12-staging-020-post019-preflight.test.mjs：合成QA校验拒绝019缺失、020已执行、意外用户写入或错误候选来源。

执行顺序：先审核并合并本 PR → 授权只读状态检查 → 授权020新备份并保存离线 → 另外审核020 ADD-ONLY受保护迁移，要求24小时以内的新备份、明确数据库UUID、同一独立环境授权、迁移前后精确计数和time-travel书签 → 再由用户单独批准真正的020迁移。

IMPORTANT：020 仍需要额外人工审查后的独立迁移工作流；不可直接在Cloudflare运行SQL。019的词头级学习表目前只是一份空的过渡结构，不得启用词头级掌握。最终学习身份是 user_id+sense_id；不修改旧user_words、购买/订单或正式站。