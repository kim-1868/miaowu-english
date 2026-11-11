# 妙屋英语 V1.2 — 019 TEST D1 手工结构迁移交接（2026-11-11）

## 已核实的前置事实

- 受保护完整加密备份 GitHub Actions [#42989518440](https://github.com/kim-1868/miaowu-english/actions/runs/42989518440) 已成功：加密、解密、独立 SQLite 恢复、`integrity_check`、FK 检查均通过。
- 加密文件 Artifact **13841626193**，名称 `v12-staging-019-encrypted-full-backup`，截至核对时 `expired=false`，GitHub 到期时间 **2026-12-11 08:48 UTC**。**还没有得到用户已将这个加密备份保存在 GitHub 之外的确认。**
- 测试 D1 有 61,422 个**未审核词头**、16,442 条**未审核词形**，现有 013–018 共 10 张词典表；019 仍未执行；批准教学义项为 0，教学就绪为 0，已启用词源为 0。
- 数据库为 `miaowu-english-test`，只允许 `wrangler.jsonc` 的 staging UUID：`88a817cb-23bb-4ae4-bcb8-92286c4165d4`。

## 新的迁移工作流（没有自动触发）

`.github/workflows/v12-headword-staging-019-manual-migrate.yml`

- **只可在** `feature/v11-smart-vocab-preflight-20261109` 分支通过 `workflow_dispatch` 手动触发，并要求 `staging-d1-schema-approval` 受保护环境独立人工审批。
- 必须填写测试库名、UUID、确认短语、**真实成功的备份 Run ID 和 Artifact ID**、已经离线保存加密备份的确认短语、学习义项隔离政策确认短语。
- 验证固定 Run SHA `8bfed1f0c21227008f3f42d9be5540bdbeea5b06`、备份工作流名称、是否成功、加密 artifact 是否存在且未过期、备份完成时间必须在**最近 24 小时内**。如果超过 24 小时，**请重新执行受保护完整加密备份并先升级备份 run SHA 门禁（经过评审后）**；不要修改自动校验结果绕过旧备份过期。
- 执行合成/离线 019 安全测试，确保 019 严格只创建两表两索引且旧学习/订单不修改。
- 在任何远端写入之前检查：原数据库 10 词典表、5 触发器、4 核心表、019 表/索引都未存在、61,422/16,442 数量、未审来源未启用、`quick_check` 与 `foreign_key_check` 完整。
- 先核对 Cloudflare time travel bookmark，再**仅执行** `db/019_global_dictionary_headword_study.sql` 到 **测试 D1**。
- 成功后以只读汇总比对迁移前后旧 `books,chapters,words,user_words,review_events,entitlements,activation_codes,chapter_words,reading_progress` 的**记录数量**，并复核词典基线、019 两表两索引与 FK/quick_check。只可宣称**汇总记录数量未变化**，不能仅根据 COUNT 断言字节级内容完全未变。
- 不应用旧用户状态迁移、不为任何候选词授予许可或教学审核、不打开任何学习写入开关、不发布 Worker、**不触碰正式 D1**。
- 新增离线测试 `tests/v12-staging-019-guarded-manual.test.mjs`；在 019 既有离线工作流内运行。

## 必须保留的义项规则（上线前阻断）

**发现设计不一致：** 现有 `019` 的 `user_headword_study` 主键是 `(user_id,entry_id)`，`global-dictionary-headword-srs.js` 也按整个英文词头共享状态。项目实际要求是：

- 相同 **reviewed sense_id** 在小说 A 与 B 中共享同一已学/复习状态；
- 一个词头的**新词义**必须独立学习，不能因为 A 书中的词义已掌握就自动把 B 书的不同词义标为 mastered；
- 点击词卡界面可以仍只显示一张带多词义的词卡，但内部分义项状态必须独立。
- 当前 019 只允许作为**尚未启用的结构预埋**，API 现有 `GLOBAL_DICTIONARY_HEADWORD_SRS_ENABLED` 和 `GLOBAL_DICTIONARY_HEADWORD_SRS_WRITE_ENABLED` 必须维持关闭；后续需改为按 `sense_id` 的学习状态与复习事件，完成真实词卡审核及双小说/多端测试后才能开启。
- **不要把本阶段的数据库结构准备说成全量词卡完成、小说已自动配卡或学习逻辑已上线。**

## 当前需要用户操作

1. 从 [Backup #42989518440](https://github.com/kim-1868/miaowu-english/actions/runs/42989518440) 页面底部 Artifacts 下载 `v12-staging-019-encrypted-full-backup`，解压后把加密 `.gpg` 文件另外保存到**私密的、GitHub 之外**位置；把加密口令单独安全保存，不要发送到聊天。
2. 保存完成后，可以核对新的手工 019 工作流的所有确认项，执行 **测试库仅加结构** 迁移；**24 小时备份新鲜度限制**适用。若想跳过这一步，先暂缓执行，不会影响当前正常阅读。
3. 迁移完成之后，继续推进义项级状态代码修正、已上架小说配卡验证、全量考试词库审核和后续发布。
