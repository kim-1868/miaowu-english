# P0 #265 · 一个真实共有义项的 TEST 写前清单（2026-11-13）

> **阶段：仅列清单，不写数据库、不授予新身份、不部署正式站。** 用户已经成功打开加密审核包，不代表内容或版权逐项获批。
> 唯一目标：真实 2 本已发布小说的 **2 张原卡 → 1 个统一义项**，在独立 TEST D1 端到端学习反馈。输入证据限定密封 Artifact [#14039227233](https://github.com/kim-1868/miaowu-english/actions/runs/43430107050/artifacts/14039227233)，不扩词库。

## 0. 已有远程事实、缺口和不重复事项

- TEST D1 UUID 固定 `88a817cb-23bb-4ae4-bcb8-92286c4165d4`，数据库 `miaowu-english-test`。021 实际受保护迁移已在 [#43397904258](https://github.com/kim-1868/miaowu-english/actions/runs/43397904258) 成功；**不能重新执行**。
- 真实 Publisher 公钥在预览站登记成功，64位指纹存于 OPS；受保护开关于 [#43423899319](https://github.com/kim-1868/miaowu-english/actions/runs/43423899319) Success。密钥/令牌/原文禁止写入 Issue 或仓库。
- 真正双书私密审核包 [#14039227233](https://github.com/kim-1868/miaowu-english/actions/runs/43430107050/artifacts/14039227233) 已在真实受保护 runner 解密源文件、原段落与旧卡 SHA 校验、再 AES-256 加密并解密核验。审核表**7 类 rights 全 HOLD、10 类内容检查全 HOLD，实际 OPS 词义收据 0**。用户本地能打开只表示可以开始审阅，不代表完成。
- `v12-real-two-book-test-import-preflight.mjs` 和 `v12-real-two-book-test-readonly-collision-check.mjs` 目前仅**离线生成/验证隐藏 draft 概念资料**；最近 [#43430117729](https://github.com/kim-1868/miaowu-english/actions/runs/43430117729) 和 [#43430117629](https://github.com/kim-1868/miaowu-english/actions/runs/43430117629) 只成功执行**synthetic** job，**绝不代表已运行远程 D1 冲突扫描**。
- `v12-owner-release-two-book-staging-pilot-apply.yml` 是内部 QA 示例数据（`mw-v12-pilot-*` / `choice`），**不能当作这两张真实商业旧卡的入库器**。
- `v12-signed-first-published-test-link-plan.mjs` 旧脚本要求 `wordletter-ops-published-sense-batch-v1` 收据，**与现在实际注册的 `wordletter-ops-publisher-clearance-receipt-v1` 不兼容**；不能跳过审签或把另一收据重命名后导入。真正入库器的接口适配/服务端 `ops_dictionary_publisher_receipts` 实时核对尚未完成。
- 现有阅读器只读 overlay 优先读取**实际 published+有权访问**的 book/chapter；预检 manifest 默认 `books.status='draft'`、`chapters.published_at=NULL`、`is_preview=0`、分类隐藏，因此仅把草稿导入 TEST **不能证明**“有权限账号 A 书点词反馈 → B 书复用”。必须单独设计受限 TEST 可见性/权益，严禁在公开预览露出原收费正文。
- `GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED=false` 当前是保护性默认，真实 A/B 点击写反馈之前需要在 TEST-only 独立审批和精确范围的写功能控制后启用；**不能作为一般生产开关**。

## 1. 先满足的真实内容门禁

审核人必须在私密文件中逐项确认：双书两个原段落的词头、词性、具体含义；中文义项和句子含义；英文例句自然度；中文例句译法；UK/US 重音和音标候选；每项例句/释义/音标/搭配/正文的商业使用权源证。任何一个上下文为不同具体语义 => `REFUSE_MERGE`，严格分为两个 sense，**本 P0 合并路线停止**。

审核文件为解密包的 `p0-private-one-sense-review.md`、`p0-private-one-sense-review.json`、`p0-unapproved-human-review-attestation.json` 和 `p0-original-real-two-book-packet.json`。审稿人须亲自检查原文，不得把机器 QA、勾选或 GitHub `Review deployments` 作为语言/法律终审证据。身份、证据 SHA256、判定理由和实际 UTC 审稿时间留在私密受控位置；维持原书/旧卡原 SHA。

实际前置流程：`scripts/v12-ops-publisher-local-onboarding.mjs sign-reviewed` **只接受**真实7项 rights 与10项内容全部核查过的模板；经真实 OPS `publisher-review/authorize` 审计后使用**用户本机 Ed25519 私钥**签发，预览 Worker `publisher-receipt/verify` 验签并登记摘要。成功标志 `REAL_OPS_PUBLISHER_RECEIPT_VERIFIED_NO_CONTENT_IMPORT` 仅表示**可进行 TEST 写前验收**，不是已入库。

## 2. 真实 TEST 的精确写入清单与上限（需全流程独立批准）

| 对象 | 预期最大新增 | 不可覆盖的对象及限制 |
|---|---:|---|
| `categories` | 0–2（若缺且分类安全隐藏） | 不更新现有公开分类 |
| `books` | 2（隔离 TEST 原真书身份副本） | 不能更新已存在 ID；权限可见性须先验收 |
| `chapters` | 2（各 1 段/受控单章） | 不复制额外付费全文，不开启公开预览 |
| `words` | 2（历史词卡原字段保留） | 旧卡 SHA 必须逐一一致；绝不修改已有行 |
| `chapter_words` | 2 个真实锚点 | 依原 `chapter_id, word_id, anchor` 完全一致 |
| `global_dictionary_sources` | 0–1 | 已存在来源只可验证权利，不能虚构 license_reviewed |
| `global_dictionary_entries` | 0–1 | 词头 UNIQUE，存在则先核义项/许可冲突；不得盲改教学状态 |
| `global_dictionary_lessons` | 1 | 新统一教学例句/中译/UK US 音标必须真实已审 |
| `global_dictionary_senses` | 1 | 一个真实 `gds_...` sense_id，义项 approved/active 必须有实际签名收据 |
| `global_dictionary_legacy_sense_links` | 2 | 精确原2旧词卡 → 同1 sense；guard 需独立校验 source/lesson/review |
| `ops_dictionary_publisher_receipts` | **已有签核收据** | 不代替真实授权或凭空补收据 |
| `users` / `entitlements` / `user_dictionary_sense_study` / `user_dictionary_sense_review_events` | **不在商业入库批次新增** | 后续单独创建隔离测试用户和最小可阅读权益；用户学习事件仅在真实UI反馈阶段产生，并独立清理 |

数据库事务不得复制、重置或删除 `user_words`、`review_events`、`reading_progress`、`activation_codes`、`orders`、现有 `entitlements`。所有真实记录 ID 只能来自私密包，禁止在公共 SQL/PR/日志写付费上下文或旧卡 ID。重复执行应因预检碰撞被拒绝，而非更新/重复计数。

## 3. 远程只读 CHECK → 全量加密备份 → 单一受保护 TEST write

1. **READ ONLY** 在真实 `miaowu-english-test` 检查上表、TEST UUID、两本/两章/两旧卡 ID 不碰撞、`headword`、来源 `source_key`、`entry_id` 和现有 `sense` 与 links，查询并保存下述旧数据计数：`users,user_words,review_events,reading_progress,entitlements,activation_codes,books,chapters,words,chapter_words,global_dictionary_sources,global_dictionary_entries,global_dictionary_lessons,global_dictionary_senses,global_dictionary_legacy_sense_links,user_dictionary_sense_study,user_dictionary_sense_review_events`，外键、完整性校验。仅加密保存具体私密 ID。若有碰撞停止，不能重用未经确权来源。
2. 确认 `ops_dictionary_publisher_receipts` 有通过真实服务端验签的签核，且 `reviewer_id/ops_audit_id/source_proof_sha256/candidate_sha256/target_database_id` 与私密包逐字匹配。重新核对 7+10 项独立真实审稿证据和 lesson 内容、所选语音源许可。**现有旧版 signed-batch SQL planner 不兼容新的 OPS 收据，须采用正确的适配器，不得直接使用。**
3. 使用既有 Cloudflare TEST 专用受保护环境 **先**生成 Cloudflare D1 Time Travel bookmark；完整远程 `d1 export`，AES-256 加密；独立解密恢复 SQLite 后 `PRAGMA integrity_check=ok`、`foreign_key_check` 零错误；**先上传私有加密备份 artifact 并核对文件可下载**，随后才允许任何 DML。
4. 独立 `staging-d1-schema-approval` 用户授权（必须给出**本次实际具体 SQL 摘要/旧数据基线/删除回退清单**）；执行唯一批次事务，必须 fail closed；每个数值变化与第2节上限精确匹配，所有旧用户/学习/购买权益表的行数和关键hash都不变。不能把 QA workflow approval 当本次内容审核。
5. **权限隔离后**将 TEST 两个保密章节以仅授权测试账号可访问的方式准备阅读页；任何未授权访问必须 401/403，未通过不能修改公开状态。与 TEST 用户授权一起验证本地/刷新/第二本同义项共享和不同义项隔离、重复反馈事件幂等与独立SRS持久化；老卡点击仍可正常展示。
6. 删除**仅该次新增的**临时用户的学习/阅读/授权记录并二次核验；实际人工签名与已审课程/来源记录是新系统受保护账目，**不能把它们当临时数据全清掉**。

## 4. 失败回退与审计

- 在 **未发生阅读器用户反馈写入时**，如果导入阶段任意检查失败：在具备备份且无第三方并发写入条件下，可回滚本次新增的 `legacy_sense_links → senses → lessons → entries → sources → chapter_words → words → chapters → books → 独立新增 categories`；仅删除专属清单 ID，若任何对象已被其他数据引用则停止，绝不 `DELETE FROM user_*` 全表操作。
- 如发生新数据被用户访问/关联或旧数据已并发更改，不能简单回放整库备份覆盖其他人的新学习；优先按 Time Travel 的恢复点和审计清单执行隔离核对或人工恢复。保留不可变 Publisher 审计与权利证据。
- 验收报告至少包含工作流 URL、实际 TEST D1 前后记录摘要、全量备份 Artifact ID、离线恢复凭证、每项真实UI操作和网络返回、同词异义/刷新/幂等/鉴权/清理以及恢复后计数，**不能拿 CI/匿名401 代替实际用户 A→B**。

## 5. 当前结论与最短关键路径

**当前未得到用户逐项语言/权利审签记录。** 有权用户能够打开私密包≠已确认语义/版权。当前没有一个可安全执行并通过上述全部门禁的“真实非 QA 一键 TEST 写库工作流”。因此现在禁止写；工程下一步是把**已登记 OPS 收据 V1 与真实仅两本书的私密 packet**接到受限 TEST 应用器，同时验证有权阅读的隔离会话和反馈开关。要严格在此唯一范围开发，不能扩词库或再做021。

本清单在 Issue #265 汇总。任何生产部署/PROD D1操作需新的独立许可，本 P0 不包括。
