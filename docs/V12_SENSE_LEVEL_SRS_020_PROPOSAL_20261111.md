# V1.2 统一词卡：一张卡显示多义项，学习状态按 sense_id 隔离

2026-11-11 · 代码级安全方案，**只适用于新开发分支，绝不直接部署**。

## 原因

- 019 中的 `user_headword_study(user_id, entry_id)` 将同一个英语词头所有词义放到一条复习计划中，与用户已经确定的“相同义项复用、不同义项独立记忆”冲突。
- 019 可以暂时作为未启用的基础表存在，但 **`GLOBAL_DICTIONARY_HEADWORD_SRS_ENABLED` 和 `GLOBAL_DICTIONARY_HEADWORD_SRS_WRITE_ENABLED` 必须维持关闭**；绝不根据一词头某一个义项已掌握而将全部义项视为掌握。
- **统一词卡 UI 身份**是 `entry_id`（一张词卡可显示多个获批准的释义）；**学习 SRS 身份**是 `(user_id,sense_id)`。同义项跨书只学一次；不同义项独立学习。

## 本次代码

1. `db/020_global_dictionary_sense_study.sql` 只新增两个**独立义项学习**表、两个索引、三个未审核写入阻断触发器。没有 `DELETE/UPDATE` 旧书、旧学习、收藏、订单数据。
2. `src/global-dictionary-sense-srs.js` 纯函数，复习间隔仍为 1/3/7/14/30 天；同日重复答对不无限增加间隔，忘记后提示本轮延迟约 5 张重现。
3. `scripts/rehearse-sense-020.mjs` 在内存 SQLite 中加载真实仓库 001+013–019 SQL，纯合成数据测试 `record` 的名词/动词不同义项：两个独立状态，同义项跨小说共享，可保留旧学习记录与权限。
4. `tests/v12-sense-020-srs-migration.test.mjs` 覆盖跨书复用、义项隔离、未审核拦截、历史数据不变以及增量 schema。

## 上线前硬门禁

- 020 **未执行测试库或正式库**。需要独立备份/审核/审批迁移，不随 019 工作流写入。
- 新服务必须使用对应 `sense_id` 的确认绑定，校验词源许可、词卡音标/例句/释义、章节购买权、审稿人的义项确认；拒绝从字符串相似度推断不同词义已掌握。
- 必须把现有 staging headword feedback API 转成 sense-level 或关闭旧路由，完成 A/B 小说同义项复用与异义项隔离的真实 E2E，先预览站验收再考虑正式站。
- 现有测试 D1 的 61,422 条 ECDICT 候选**仍未批准教学**，不可直接发售，必须经过合法来源和内容审稿。
