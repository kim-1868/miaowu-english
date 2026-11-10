# 妙屋英语 · 全量统一词典与既有词卡工作交接（2026-11-10）

> **项目跨窗口唯一现状入口（截至本次提交）**。读取仓库 `kim-1868/miaowu-english` 的 `feature/v11-smart-vocab-preflight-20261109` 分支，而非可能滞后的默认 `main`。关联 [Draft PR #206](https://github.com/kim-1868/miaowu-english/pull/206) / [Issue #208](https://github.com/kim-1868/miaowu-english/issues/208)。

**2026-11-10 最新操作入口：** 用户 Cloudflare D1 Token 授权步骤、GitHub Secret 名称、既有只读工作流重跑链接、后续 A–K 交付验收表，见 [统一词典授权与后续执行清单](UNIFIED_WORDCARD_AUTH_AND_DELIVERY_RUNBOOK_20261110.md)。该执行清单也已保存到私人 Library：`/开发英语单词学习网站/妙屋英语_统一词典_授权与后续执行清单_20261110.md`，供其他聊天直接读取。**修订：Cloudflare D1 Read Secret 已保存且真实只读检查通过；测试库统一词典表 0/10，Time Travel 恢复点可读。真实建表仍需独立写权限、备份与人工放行。**

## 2026-11-11 · 最新验证：真实测试 D1 词典候选独立只读审计已通过

- [GitHub Actions 42848827545](https://github.com/kim-1868/miaowu-english/actions/runs/42848827545) 已在受保护环境审批后完成，原始日志：`STAGING_POSTINDEX_11422_ENTRIES_16442_FORMS_ONE_DISABLED_SOURCE_VERIFIED`、`STAGING_POSTINDEX_ZERO_APPROVED_SENSES_AND_ZERO_STUDY_BINDINGS`、`STAGING_POSTINDEX_HISTORICAL_BASELINE_4_59_9_262_VERIFIED`、`STAGING_POSTINDEX_READ_ONLY_NO_D1_MUTATION_NO_PRODUCTION_ACCESS`。**原先记为等待审批的只读门禁现已结束并通过。**
- 测试 D1 当前 11,422 候选词头+16,442 词形仍禁用、正式批准 sense=0、历史书籍/学习行数仅验收计数一致。全量剩余 9 批离线回放已验证；**还未手动审批/执行第一批 50,000 行**。
- 可进入独立人工批准的受控 staging 全量候选第 1 批，工作流 `.github/workflows/global-dictionary-staging-remainder-cohort-manual.yml`。必须由主人选择 feature 分支、批准 Environment，并遵守 D1 当日写入额度；已完成任务请勿重复运行。登录 GitHub 的浏览器执行权限尚不能由当前工具链代替用户授权，其他窗口不得虚构云端导入结果。
- 详情见 `docs/GLOBAL_DICTIONARY_FULL_SOURCE_ROLLOUT_20261110.md`。**用户最终三大目标（全量已审教学卡、旧小说自动义项匹配、新上传自动配卡）尚未完成**；离线索引与数据库表通过不等于可以售卖。

## 2026-11-10 · 全量词头离线分片完成，真实云端仍只有考试候选（优先读此段）

- **新增可复现程序及真实 CI 验收**：完整 400,183 词头 + 56,898 词形候选均通过临时 SQLite 全量回放，但 staging D1 目前只真实写入 11,422 考试词头 + 16,442 词形；剩余 388,761 + 40,456 在 GitHub Actions 生成 9 个**未执行**批次，绝不把离线成功算成线上完成。
- [全量离线验收 run 42850583900](https://github.com/kim-1868/miaowu-english/actions/runs/42850583900) 通过（6 项生成器测试、4 项安全工作流测试、九批哈希和行数校验）；更近期回归 [run 42850847556](https://github.com/kim-1868/miaowu-english/actions/runs/42850847556) 同样通过。已生成的候选 SQL 归档 artifact `13781435146`，没有用户、付费小说、商业例句等私有内容。
- 为剩余九批新增 `.github/workflows/global-dictionary-staging-remainder-cohort-manual.yml`：仅 feature 分支/测试 D1，经 `staging-d1-schema-approval` 人工批准，逐批要求原表状态不变、文件哈希、每批全量加密备份先持久保存、再导入 ≤50,000 行。main 只注册 fail-closed 入口；**尚未启动任何一批真实余量导入**。
- 独立只读验收 [run 42848827545](https://github.com/kim-1868/miaowu-english/actions/runs/42848827545) 已创建，但 GitHub 环境仍等待负责人审批，不能称该任务已验证成功。
- 所有词头仍是 `teaching_ready=0` 的候选索引；**正式审核批准的教学义项 = 0**。1150 历史义项审核和当前四级23本/六级5本实际最新版本全文匹配、复习去重、V2 线上端到端都尚未完成。为避免旧文档误导，详细分批执行与阻断请参阅 [全量上线计划](GLOBAL_DICTIONARY_FULL_SOURCE_ROLLOUT_20261110.md)。
- 后续若测试库出现异常，不能重跑已部分写入批次或直接删表，须先核实行数与加密备份。新书“无需 `words[]`”的技术方向成立，但只有词义、例句和许可真实审核通过后才可自动教学匹配；不同义项不能共用记忆状态。

## 2026-11-10 23:46（北京时间）· 真实测试 D1 考试词头候选导入成功（最新）

- **刚完成** GitHub Actions 手动审批运行 [42847388782](https://github.com/kim-1868/miaowu-english/actions/runs/42847388782)，job `129938463140` `Success`。37/37 SQL 导入批次成功：**11,422 个考试标签候选词头、16,442 条候选词形关联、1 个禁用来源**。
- 源数据为此前已审计 ECDICT 全量索引的考试标记子集，并非 400,183 词头已经全部写入 Cloudflare；所有候选没有教学/商业审核，`teaching_ready=0`、`reviewed=0`、`source.enabled=0`、已批准稳定义项 **0**。
- 本次导入前重新完成全量测试 D1 加密备份、离线 SQLite 回放、加密 Artifact 上传；加密备份 Artifact ID `13778877139`，本机长期保存仍待站长自行下载。
- 测试 D1 原有基础记录计数前后均 `books=4,words=59,user_words=9,chapter_words=262`；正式 D1、正式 Worker 和线上 23+5 本小说未更改。GitHub 曾弹出审批门禁红色 UI 提示，但实际运行已成功，请勿重复运行。
- 后续需只读核查导入内容、独立审稿 1150 个历史义项候选以及真实已上架小说全文匹配；新书自动补词卡的在线端到端仍未通过验收。详见 [最新 staging 执行记录](GLOBAL_DICTIONARY_STAGING_D1_RUNBOOK_20261110.md)。**本段覆盖下面较早「候选 SQL 已准备但还未写入」状态。**

## 最新状态（2026-11-10 夜间 · 以后续验收为准）

**测试 D1 结构与只读验收已真实完成**：GitHub Actions `42843020562` 成功执行迁移 013–018，共 10 张新词典表和 5 个防误配/未经审核保护触发器；`42843538233` 只读核对通过：已有 `books=4, words=59, user_words=9, chapter_words=262`，新词典表在数据导入前为空，未启用任何来源或正式教学卡。生产 D1 / 正式站均未改动。**较早段落中「测试表0/10、未真实迁移」现已过期，以本段和末尾 staging runbook 为准。**

**全量来源在离线归档、考试优先候选导入包已实际生成**：ECDICT 上游审计索引 400,183 词头 + 56,898 词形关系仍只是来源候选（未独立教学审核）。实际 CI `42846439845` 已生成 **11,422 带考试标记的词头 + 16,442 未审核词形关系**，37 个分块 SQL，通过 10 项测试及本地 SQLite 回放；对应公开来源衍生 artifact `13779510062`。所有 `teaching_ready=0`、`source.enabled=0`，已审核教学 sense 数仍为 **0**。

**下一项实际待办**：使用 `global-dictionary-staging-exam-candidate-import-manual.yml` 在 feature 分支、受保护 Environment 下进行用户明确审批的测试 D1 候选数据导入。默认分支只是不可写的工作流注册入口。导入前工作流必须再生成加密备份，核实历史行数及来源 SHA；导入后重查未发布状态与用户学习记录。当前**尚未执行远程候选数据导入**，因此不能宣称已建立在线可售词卡，也不能说四级23本/六级5本已经在线全部匹配。工作流和 QA 见 `docs/GLOBAL_DICTIONARY_STAGING_D1_RUNBOOK_20261110.md`，请其他窗口先读取本段避免引用旧状态。

## 历史23本旧词卡候选全量匹配（新增；不是实时线上匹配）

2026-11-06 的私人上架 P5 历史源含 CET4 **18**、CET6 **1**、考研 **4**，合计 **23 本**；已在**离线环境实际核对**其 **2,206 个历史 old word ID 全部能找到严格“词头+词性+中文释义”对应的 1,150 义项候选（2,206/2,206）**。严格文本跨书重复候选 384 组。已生成每本历史书的统计、2206 旧 ID→候选哈希/entry_id JSONL、Excel、ZIP；只存在私人 Library：

`/开发英语单词学习网站/统一词卡_待审工作区/历史23本_旧卡全书候选匹配/`

**至关重要的数据限制：** P5 源只包含每旧 ID **一条代表上下文**，所以可核对 **2206 条上下文代表样本**；其摘要中的 **6114 条 chapter_word 关联**只是历史数据库聚合数字，**并没有获得 6114 条逐章段落的完整锚点**。绝不能声称“6114/6114 锚点已完成匹配”。另外这23本不是今日的正式四级23本+六级5本；仍须使用受控 OPS Publisher 只读导出当前实际书版本、指纹与所有段落锚点并做完整校验，才能声称正式已上架小说真的匹配完成。

公有可复用代码 `src/global-dictionary-historical-books-compare.js` 和 [审计说明](LEGACY_23_BOOK_SENSE_CANDIDATE_AUDIT_20261110.md)，均不触碰用户/权益/正式 D1，不包含收费正文。**已批准 stable sense_id 仍 0。**

## B1.5 本轮新增：从词卡机器审核到正式签核的中间层（2026-11-10）

**状态：开发分支可重复代码已提交，私有文件已真正生成；没有把任何未经许可审核的素材标成可售卡。**

- `src/global-dictionary-editorial-signoff-gate.js` + `scripts/check-private-reviewer-decisions.mjs`：1150 条候选的专用“审核决议模板”，审核人须逐一说明 UK/US IPA、POS、词义、双语例句自然度、**商业来源/双语例句权利**、旧 ID 同义项身份等 8 类审核项目与依据；仅输出「可交运营台最终签核」候选。即使 JSON 所有勾选为 true，也 **不** 自动创建 `approved_sense_id`、`teaching_ready` 或用户掌握记录。具体见 [B1.5 审稿签核方案](GLOBAL_DICTIONARY_B15_EDITORIAL_SIGNOFF_GATE_20261110.md)。
- 用户私人 Library **`/开发英语单词学习网站/统一词卡_待审工作区/全量1150义项_B15商用终审决议/`**：实际 1150 条逐义项空白签核 JSONL、独立机器建议 JSONL、源内容 SHA 和 ZIP。源 SHA256 = `54360cf47197b75ebe3a102f3abce99ba901b2bdb8dafb22f2f09e59b1759e21`。**不要把私人例句、旧 Word ID、收费内容上传公有 GitHub**。
- `src/global-dictionary-fast-review-triage.js`：对 1150 条进行真实审核复杂度分流——**493 条**旧卡材料较少冲突（单一 IPA 英美候选、标准单词词性、无显式重复/多义冲突、例句含登记词形），另 **657 条**重点检查。原有 2206 个 old word ID 全部保留；**493 绝不代表已通过教学或许可审核**。真实分流文件在私人 Library `/开发英语单词学习网站/统一词卡_待审工作区/B15按审核难度分流/`。
- 发现额外写入安全风险并修复：`src/ops-import.js` 现不仅拒绝未经审核的 `gdict_` 主词头和 `v2_tmp_` 临时 ID，还**拒绝伪造的 `gds_` 稳定义项 ID 通过普通 V1 上传接口写库**。未来真正的 V2 上传需经过独立、服务端审核和权限约束，不能绕过已有用户学习键。
- **真正已批准教学义项依然 0**：人工及法务来源审阅、由认证 Publisher 最终签署的稳定 `sense_id` / 幂等 D1 写入仍待实施。真实测试 D1 schema 尚为 **0/10**，用户当前正式站未修改。
- Cloudflare Time Travel 可以按 UTC 时间或 bookmark 恢复，属于有期限的恢复手段，不等于长期脱机备份，真实 staging migration 必须记录恢复点；D1 Write Secret `CLOUDFLARE_STAGING_D1_WRITE_TOKEN` **未新授权，保持旧 Read Secret 不变**。参见 [仅手动测试库迁移门禁](DICTIONARY_STAGING_MANUAL_MIGRATION_GATE_20261110.md)。

## 当前最靠前的项目结论：1150 历史义项全部分为十批（2026-11-10）

**这一步已实际产生私人文件，不再只是工作计划。** 历史 2,206 个旧卡 ID 对应的 1,150 个严格义项候选已经完整编排成 **10 个不重不漏的离线审稿批次**：第 1–9 批各 120 条，第 10 批 70 条。第一批原有 120 个保留，另外 1,030 个已分别编排；覆盖旧卡 ID 关联总计正好 2,206。包含全部义项的独立 HTML 审稿工作台（搜索、分级、批次、风险过滤和本地初审）、Excel 审核总表、完整 JSONL、10 份分批 JSONL、质量统计和 ZIP。

- **私人 Library 原始路径：** `/开发英语单词学习网站/统一词卡_待审工作区/全量1150义项_十批完整审稿/`。本次所有文件已保存且 ZIP 完整性检验通过；其他聊天用 Files 可以直接读取，不要将私有历史教学例句/旧 ID 上传 GitHub 公有仓库。
- **可重复代码：** `src/global-dictionary-complete-review-plan.js`（由 1150 候选和固定第一批生成后九批，强制全量去重、拒绝无效或已审核身份）；[项目说明](GLOBAL_DICTIONARY_ALL_1150_TEN_BATCHES_20261110.md)。
- **准确区分：** “历史义项排班 1150/1150”≠“正式审核 1150/1150”；当前正式教学义项 `approved_sense_id` **0**，用户与正式/测试 D1 均未因该工作区改变。
- **真正还未完成四大关**：（1）教学义项释义、英美音标、原创中英例句、商业来源许可终审与稳定 ID；（2）Cloudflare staging D1 在受控独立写授权+备份门禁后完成 013–018 真实迁移；（3）发布者安全只读导出当前 CET4 23 + CET6 5 本全部受保护正文，建立版本化义项匹配并验证既有学习状态不丢；（4）未来新书无 `words[]` 的真实 V2 导入→词义锚点→阅读/复习联动→多端体验验收，最后按审批上线正式站。

## 2026-11-10 本轮实际交付（较早计划里的“尚待私有草稿运行”已更新）

- **实际生成，不再仅是脚本：**从私人 Library 历史快照 `miaowu-english-prod-2026-11-06.p5-content-review.json` 成功恢复原完整 `2206` 个旧词卡 ID；在私有工作区生成 **920 主词条教学草稿、1150 义项审核工作单**，保留每个旧 ID、各义项的 UK/US 音标候选、原有双语例句和搭配。每条继续 `reviewed:false`、`lesson_approved:false`，本次正式批准统一主课卡数仍是 **0**。
- 用户私人 Library **`/开发英语单词学习网站/统一词卡_待审工作区/`** 已保存真实 JSONL 数据文件、QA 统计和一键下载 ZIP；私有数据、收费小说正文、顾客学习记录**不上传公共 GitHub**。另一聊天可以用 Files 按该路径直接查找。
- 实际统计：920 词头、1150 严格文本义项、384 跨旧 ID 的同文本重复组、1056 个额外重复旧卡、180 个多义项主词头、173 组音标不一致候选；历史发布书籍 **CET4 18、CET6 1、考研 4**，这不是实时书架 **CET4 23+CET6 5**。
- 已使用历史书档案对应小说实际跑离线义项匹配：六级 **《末班车前请回信》111/111** 同文本、词性候选，跨其他旧小说复用候选 **45**，IPA 冲突 **35**；考研 **《第十三张底片》122/122**，跨其他旧小说候选 **65**，IPA 冲突 **55**。两本与旧快照同源，**不能宣称这是当前正式站全量匹配或正式义项审核通过**；不覆盖任何旧学习进度。
- 可复用程序：`src/global-dictionary-published-legacy-compare.js` / `scripts/match-published-novel-to-private-legacy.mjs`，将存量书的每个目标词映射为候选，保证 headword+POS+中文义项严格匹配、旧 ID 和跨书候选留痕、版本化审校；[对应说明](CET4_CET6_HISTORICAL_MATCHING_READONLY_20261110.md)。
- 013–018 六份 SQLite 迁移已在一次性测试库建立 **10 张**新增表、核验重复执行不覆旧数据；又测试迁移中断和全部执行后的本地恢复，CI 通过。仅是**离线演练**，Cloudflare staging D1 尚未迁移。详见 [迁移模拟计划](DICTIONARY_STAGING_013_018_MIGRATION_DRYRUN_20261110.md)。
- 真实 staging D1 Read Token 已验证、Time Travel bookmark 读取已成功；只读查询显示真实统一词典表 **0/7**。实际改 test D1 仍需要备份/恢复门禁及独立的 D1 Write 权限。**不准动生产 D1**。

## 首批120义项与全量1150机器质检（当前有效）

**已实际完成私有整理和机器质检，尚未通过人工教学签核。**
- 从 1,150 条历史严格义项中选 **120 条首批审稿**：45 条高跨书重复、35 条四级首现新级词、25 条六级首现新级词、15 条雅思/考研/原考试表未命中；涉及 113 个英文词头、576 个历史旧 word ID，74 条 IPA 冲突项。已生成完整 JSONL/CSV/离线 HTML 审稿工具/ZIP。
- 私有 Library 路径：`/开发英语单词学习网站/统一词卡_待审工作区/首批120义项_分级审核/`。HTML 可以离线搜索、标记“初审/待修改”、记录笔记并导出 JSON，**不能直接审批正式课程**。
- 另外对**全部 1,150 严格义项**完成机器质量排查：410 条在同词头下存在多个义项文本、384 组旧 ID 同文本、173 组英美 IPA 分歧、72 条需要拆分或复核的复合/特殊词性。1,148/1,150 条能在英语例句中找到原词头或原考试 CSV 所载词形；另 2 条规则推断 `reshape→reshaped` 与 `reunite→reunited`，需进一步核对。**文本形式命中不代表例句自然、中文释义准确或商业授权完成。**
- 私有 Library 路径：`/开发英语单词学习网站/统一词卡_待审工作区/全量1150义项_机器质检/`，包含全量 QA JSONL、聚合统计、报告、ZIP。**不要向公有 GitHub 提交收费小说上下文或私人词卡原始记录**。
- 公开 GitHub 只保存安全的复现规则与 QA 测试：`src/global-dictionary-review-batches.js`、`scripts/build-private-dictionary-review-batch.mjs`、`src/global-dictionary-private-qa.js`、`tests/v12-global-dictionary-review-batches.test.mjs`、`tests/v12-global-dictionary-private-qa.test.mjs`，对应 [首批文档](PRIVATE_WORDCARD_EDITORIAL_BATCH120_20261110.md) / [全量机器质检文档](PRIVATE_1150_WORDCARD_QA_20261110.md)。
- 严格门禁保持：**被独立商业+教学审核的 `sense_id` 为 0**；Cloudflare test D1 字典表当前真实 0/10；没有线上迁移/正式发布或旧用户学习状态合并。必须先人工审核后才允许生成稳定归一义项并进入 staging。

## 用户要求的 3 个最终目标（不要拆丢）
1. **完成全量词卡**：把统一英文词典来源覆盖四级、六级、考研、雅思乃至后续小说新词；提供准确英/美音标、分词性分义项中文释义、自然原创中英例句和适用搭配，审核商业来源与质量后成为可售教学卡。
2. **已上架小说全面关联**：正式四级 23 本、六级 5 本已经公开可见。读取真正当前受权限保护的正文版本，关联统一词典，不重写旧 book/chapter/word ID、不破坏已有书架、用户已学/收藏/复习/订单/权益；复现同义项可共用状态、异义项必须独立。避免 409 冲突并保留可回滚修订。
3. **后续上传自动匹配无需单独词卡**：小说 Agent 写剧情与英文学习目标及语境标注，上传 V2 可不包含 `words[]`；系统从**已审核**教学词卡库回填词卡信息。未审、缺词、歧义先人工确认，再形成可复用卡；禁止悄悄写入不准确或未经许可的词卡。

## 真正完成了哪些词卡/来源

- 上游 ECDICT 全量词头候选 **400,183**、词形候选 **56,898** 已离线解析审计；存在 GitHub Actions artifact，复核及获取方法见 [全量来源审计](GLOBAL_DICTIONARY_FULL_UPSTREAM_B1_REHEARSAL_20261110.md)。**它们全部是来源索引，不是已审核教学卡**；真实 Cloudflare staging D1 尚未导入。
- 独立编辑词卡草稿 **238**（全部 `reviewed:false`、缺美式音标）；仓库下 `content/lexicon` 原本的四个文件，均含英式音标、例句、基础中文释义。
- 两份历史小说包共 **105** 条词卡来源记录，含 **38** 条 *旧词卡 ID 和全部内容完全相同* 的跨书复用，去重后 **67 张**。两份包字段完整（含英美音标、双语例句），**尚不能代表生产站最新版本或独立教学签核**。
- 所以共计 **343 条原始来源记录 → 305 张旧 ID 去重候选卡**（238 草稿 + 67 历史样本），其中完整字段 67，缺美音 238。**独立审核批准成为统一主词卡 0 张**；切勿宣称“已经完成 40 万张词卡”或“305 张已可自动上架”。

### 跨窗口请直接读取的数据
- [词卡源数据登记册（305 条完整 JSONL 记录）](../content/lexicon/wordcard-existing-source-register-20261110.jsonl)：包含原 ID、词头、POS、中文义项、UK/US IPA、双语例句、搭配、来源文档/书目、候选义项键和严格未审核标记。
- [来源/去重数量与 SHA 登记](../content/lexicon/wordcard-existing-source-register-manifest-20261110.json)。
- 不能因为一条记录在历史小说包中出现过，就让其 `lesson_approved=true`；审核需保留可追踪审核人、许可和完成时间。

## 2026-11-06 历史私有正式书库：另有 2206 张旧卡（不要与上述 305 张源登记混淆）

**重大发现：** 项目私人 Library 已保存 `miaowu-english-prod-2026-11-06.p5-content-review.json`。该快照的 `cards` 是 2026-11-06 当时正式已上架小说引用的 **2206 个不同旧 word ID**，涉及当时 23 本跨等级小说、6114 条章节目标词关联，实际去重 920 英文词头、1150 个严格文本义项候选、384 组重复词义文本、1056 个重复旧 ID 额外副本；卡片英美音标/例句字段均非空。此快照与今天四级 23 本、六级 5 本的**实时公开书架不可混作同一统计口径**。

**数据归属与读取方式：** 私有旧卡/收费小说上下文只留在 ChatGPT Library，不复制公共 GitHub。其他窗口在 Library 搜索准确文件名直接读取；本仓库仅保存不泄漏正文的 [摘要与只读脚本](LEGACY_20261106_PUBLISHED_CARDS_PRIVATE_SOURCE_20261110.md)。这是填充统一教学卡、回溯老身份、修复跨书重复问题的首要历史复用来源；仍需当前正式版及人工义项审核，不能将 1056 个重复旧 ID 直接合并用户复习状态。

## 2026-11-10 最新 B1.3–B1.4 实施进度及授权阻断（优先阅读）

**本段覆盖其他较旧的“一词头只有一份掌握状态”说法。**
- **总原则：英文词头只有一张展示主卡，但学习状态必须按稳定的已审核义项 sense_id 独立**，相同已审义项跨书不重复学习；异义项分别学习。
- 已提交 `db/018_global_dictionary_reviewed_senses.sql`、`src/global-dictionary-sense-anchor.js`、`src/global-dictionary-sense-study-rehearsal.js`：已审 sense_id、旧卡 ID 审核关联、章节锚点绑定和按义项合并历史复习的**只读演练**。全部尚未迁移生产/预览数据库。
- 已提交 `scripts/build-private-historical-sense-worklist.mjs` 和 `scripts/build-private-historical-lesson-drafts.mjs`：从本人的历史私有词卡快照一次性制作 **920 个主词条草稿 / 1,150 个严格义项草稿**（输出于用户本地私有目录，代码已提交；不是已经执行完整私有生成或独立审核完成）。保留 2,206 个旧 ID，禁止自动审核。
- 我们对历史快照实际再次统计：384 组重复文本候选、1,056 张额外重复卡、**180 个有多个文本义项的词头**、**173 组英美音标存在差异的义项候选**。优先审核高重复、多义项和音标冲突。
- V2 小说 `/api/ops/import/dictionary-v2/preflight` 已增加 `sense_preflight`，用 018 表中真实审核通过的 sense_id 按章节/段落/位置对齐语境。旧版兼容主卡仍可产出**草稿**，但 `ready_for_sense_study=false` 时不能认作学习状态安全。
- GitHub CI 截至 2026-11-10 S1 [run 42805336251](https://github.com/kim-1868/miaowu-english/actions/runs/42805336251) 707/708 通过，0 失败、1 跳过；后续提交请以最新 SHA CI 为准。
- **Cloudflare 真实预览 D1 只读检查未通过**：[Run 42805328444](https://github.com/kim-1868/miaowu-english/actions/runs/42805328444) 判定 `STAGING_D1_READONLY_PROBE_FAILED_D1_TOKEN_PERMISSION`。GitHub Secret 虽存在，但当前 Token 对 D1 远程查询权限不足；不可因此假称已做迁移或实际预览验收。需项目负责人在 Cloudflare 重新授予**仅测试 D1 miaowu-english-test** 所需读写权限/重设安全 Token 后方可执行备份、迁移。不要在公开仓库或聊天发送 Token。
- 当前正式四级 23 本、六级 5 本的线上受保护正文仍待运营发布者安全导出。不允许从 2026-11-06 跨等级 23 本旧快照推断实时当前覆盖率。

## 统一身份不变规则

**一个英文主词头可以展示一张主卡，但记忆和复习进度按已审核的 `sense_id` 单独计算**。例如：
- record n. “记录” 与 record v. “录制” 各有独立学习状态。
- customer “顾客” 与 “消费者”是 *可能同义*，不得仅凭英文同形和中文相近自动并成一个已学记录。
- 相同旧 word ID 且所有卡字段相同的跨书复用必须保留，不重复建立一张新旧卡或让读者重新记忆。
- `sense_key_candidate` 是机器审核候选，不等于正式稳定 `sense_id`；应增设经过审核的义项身份与旧词义映射，再验收跨书进度。
- 等级只标注学习来源，不允许跨商品等级自动取得付费权益。

## 现有自动化能力 / 缺口

已开发（**代码级测试通过、尚未部署真实预览/生产**）：
- `src/global-dictionary-matcher.js` 词头与词形识别、缺词/多原形待审判断。
- `src/global-dictionary-novel-v2.js` 小说无需 `words[]`，通过标注 `{surface:"record",gloss:"录制"}` 使用已审核统一词典回填主卡；无人工审核不能自动放行。
- `src/global-dictionary-cross-grade-sense-review.js` 跨等级词义候选，无任何自动合并学习状态。
- `public/ops-cet4-export.js` 与运营台的 CET4/CET6 只读批量导出开发代码；不是已部署的功能。
- `scripts/audit-cet4-published-archive-offline.mjs` 支持 `--category cet4|cet6`、`--batch` 当前导出包离线审查。
- 已核实两本 CET4 历史备份：510 目标标注、194 实际引用词头、14 共同词头（13 中文义项文本一致）；CET6《末班车前请回信》历史修复版：14 章、111 候选卡、279 标注，其中 5 段无学习目标、六级真正新增级词密度低。

尚未实现/验收（**不能误报已完成**）：
1. 将 400,183 词头候选变成持久可用的审核分层索引；按来源许可批次、优先四级六级核心义项，补全英美音标、自然例句、稳定 `sense_id`，运行全量质量/同义词审核。不能强迫一次性审核 40 万条才允许逐级交付；对新词保留随用随审机制。
2. 凭发布者权限安全导出真实 23 本 CET4 和 5 本 CET6 当前受保护正文，校验版本 SHA，按义项建立旧 word ID 到新 `sense_id` 映射审稿清单，不能复用旧快照冒充真实全量覆盖。
3. 真正 Cloudflare **staging D1 先备份→013–017 迁移→来源及已审核义项导入→回滚**。
4. 运营台自动匹配新 V2 小说、消歧、上架、版本化 409 修订真实测试；跨设备阅读、收藏、掌握、剧情回声/快速刷词同步、购买/作废/恢复权益安全测试。
5. **“连英文学习目标都不标注、上传任意原始小说自动挑词并判断语义”尚未完成**。当前 V2 免 `words[]`，但仍需要 `surface + gloss` 标记。若用户要完全零标注，还需词汇提取与语境义项自动推荐及低信心审核门禁。

## 下一个窗口执行顺序

先读本文件、两份词卡 JSONL/manifest → 建立审核 `sense_id` 与来源许可证审查模块 → 从 305 候选和现有授权样书开始高质量教学卡补齐，同时维护 400k 来源检索索引 → 预览站灰度导入 → 收集 23+5 本正式小说受控版本匹配 → 修正缺词及六级新级词密度 → 完成复习状态/权益/回滚验收 → 经站长确认再上线。

**不得提交 `user_words` / 订单 / 激活码 / OPS_TOKEN 等敏感数据到公共 GitHub，也不得暗中覆盖历史卡 ID、学习进度或在线 D1。**
