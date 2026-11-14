# 妙屋英语测试 D1 019 只读检查：61,422 词头的真实来源核实

## 问题原因已经通过真实 GitHub 运行日志确定

- 2026-11-11 的受保护只读 [run #42986081236](https://github.com/kim-1868/miaowu-english/actions/runs/42986081236) 已执行 Cloudflare SELECT、foreign_key_check 和 quick_check。真实匿名汇总为：`candidate_heads=61422,upstream_heads=61422,other_heads=0,candidate_forms=16442,upstream_forms=16442,other_forms=0,original_import_source_intact=1`。**失败仅由于旧脚本写死 candidate_heads=11422**。
- 2026-11-10 的 [原考试词表导入 run #42847388782](https://github.com/kim-1868/miaowu-english/actions/runs/42847388782) success，导入结束已验证 `entries=11422,forms=16442,source_enabled=0,old_books=4,old_words=59,old_user_words=9,old_chapter_words=262`。
- **随后**同一天 16:13–16:18 UTC 有经人工触发的 [全量词典单批导入 run #42852308915](https://github.com/kim-1868/miaowu-english/actions/runs/42852308915)，其命名 `Manual guarded STAGING full dictionary candidate cohort`，逐文件校验固定工件、备份安全要求、一次只导入 50,000 条候选，成功日志精确给出 `STAGING_COHORT_VERIFIED {"number":1,"entries":61422,"forms":16442}`，同时 `STAGING_COHORT_NO_TEACHING_APPROVAL_NO_HISTORICAL_STUDY_WRITES`。
- 此次新增的 50,000 是**计划内、当时已通过后置验证的候选批次**，不是当前 D1 意外多写，也不是 API 配额不足。原 `global_dictionary_sources.imported_entries=11422` 元数据刻意记录初始 ECDICT 考试导入的原始数量；后续候选使用同样源标记，其元数据仍为 11422，不能为了“对齐”把它偷偷改为 61422。

## 修订和严格安全门禁

在只读 workflow 中将以下两项断言从 **11422** 精确更新为已验证的 **61422**：`candidate_heads`, `upstream_heads`。其余**绝不改变**：`candidate_forms=16442`, `upstream_forms=16442`, `other_heads=0`,`other_forms=0`,`original_import_source_intact=1`,10张词典表、5审计触发器、4旧核心表、019两表仍为0、0已批准sense、0已开源许可和教学ready、foreign_key_check无错误、`quick_check='ok'`、固定测试 D1 UUID / read-only Token / 受保护环境人工批准。

新增测试将这两条精确更正与上述 run #42852308915 绑定，同时保留审批和不得泄露用户数据等安全断言。

## 未完成

即使只读检查成功，也**不代表019已经在 Cloudflare D1 执行**，更不代表词卡可以商业发布。后续必须先在已包含61,422词头的现有测试D1上建立新鲜、持久、加密的完整备份，独立恢复检查完整 SQLite integrity_check/FK、旧学习及订单、再独立审批019增量迁移，最后才可执行真实小说/多端一词一卡 E2E。正式站没有改动。
