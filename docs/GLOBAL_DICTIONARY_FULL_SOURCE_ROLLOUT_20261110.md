# 妙屋英语 · 全量候选词典分批导入与统一义项上线门禁（2026-11-10）

> **当前事实**：这份文件记录的是已通过 CI 的离线全量候选词头打包与安全执行入口，**不是正式教学词卡已完成，也不是已导入了 400,183 行测试/生产 D1**。运行前先检查 GitHub 最新 CI 与受保护环境状态，勿合并到生产。

## 当前真实状态（严格区分三层）
| 层 | 数据/数量 | 真实完成状态 |
|---|---|---|
| 完整上游 ECDICT **未审核原形索引** | 400,183 词头；56,898 词形关系 | GitHub 上游审核 artifact；已完整离线回放 |
| 已写入测试 D1 的**考试标签候选索引** | 11,422 词头；16,442 词形关系 | [受保护导入 run 42847388782](https://github.com/kim-1868/miaowu-english/actions/runs/42847388782) Success；候选来源 disabled |
| **未导入**的其余词头/词形 | 388,761 词头；40,456 词形关系 | 9 个待批准批次已生成并验证，本次未触碰任何远程 D1 |
| 真正可售、可共享复习状态的**已审核词义项** | 0 approved sense | 未做许可/例句/音标/义项人工签核，不允许自动学习或迁移旧复习 |
| 既有正式小说 | 四级23 + 六级5（按公开书架历史记录） | 现网受保护完整正文版本、学习记录与锚点尚未重新导出并逐项验收；不能报已匹配 |

当前统一词典主卡为 **一个英文词头一张展示卡**，学习状态按经审核稳定 `sense_id` 区分。相同词义跨书只学习一次；同形词的不同含义（record 名词/动词）独立复习。词库来源和学习状态不代表获得其他等级购买权益。

## 真实已验收的 GitHub Actions
1. 全量源流式审计：[run 42773007378](https://github.com/kim-1868/miaowu-english/actions/runs/42773007378)；上游源 sha256 `d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc`。
2. 首批考试候选入测试 D1：[run 42847388782](https://github.com/kim-1868/miaowu-english/actions/runs/42847388782)；37 SQL 批次全部 Success，来源禁用，历史核心表行数不变，完成加密备份。
3. 全量剩余候选数据离线回放：[run 42850583900](https://github.com/kim-1868/miaowu-english/actions/runs/42850583900)：388,761 + 40,456，9 批；6 项生成器测试、4 项工作流安全测试、九批 SHA/SQL 白名单验证与完整 SQLite 外键/完整性回放通过，远程写入为 0。
4. 最新手动执行入口由文件 `.github/workflows/global-dictionary-staging-remainder-cohort-manual.yml` 实现。默认 `main` 分支只是会失败关闭的入口注册文件，**实际执行只能选 `feature/v11-smart-vocab-preflight-20261109`**。

## 9 批剩余数据（总计 429,217 行）
| 批次 | 内容 | 预计 INSERT 行数 | 预期完成后词头数 | 预期完成后词形数 |
|---:|---|---:|---:|---:|
| 1 | 额外词头 | 50,000 | 61,422 | 16,442 |
| 2 | 额外词头 | 50,000 | 111,422 | 16,442 |
| 3 | 额外词头 | 50,000 | 161,422 | 16,442 |
| 4 | 额外词头 | 50,000 | 211,422 | 16,442 |
| 5 | 额外词头 | 50,000 | 261,422 | 16,442 |
| 6 | 额外词头 | 50,000 | 311,422 | 16,442 |
| 7 | 额外词头 | 50,000 | 361,422 | 16,442 |
| 8 | 剩余词头 | 38,761 | 400,183 | 16,442 |
| 9 | 剩余词形 | 40,456 | 400,183 | 56,898 |

- 这 **429,217 行是候选索引**，不包含完成音标、译文、合法来源确认、原创例句的教学卡。9 批不允许运行在正式 D1，生产库禁止使用任何导入 SQL。
- Cloudflare D1 Workers Free 套餐 2026 年 9 月起每天写入超过上限即失败，Workers Free 为 100,000 rows written/day（全帐号共享，不仅本项目）：https://developers.cloudflare.com/d1/platform/pricing/ 。每批不超过 50,000 个 INSERT 只是节流策略，**仍需人为检查当日额度**，而非承诺每日批次一定能成功；建议分不同 UTC 日期批准。
- Time Travel Workers Free 仅 7 天，Paid 30 天，不能代替可长期存放的加密备份： https://developers.cloudflare.com/d1/platform/limits/ 。

## 执行一个批次前的保护流程
- 打开 [受控手动批次工作流](https://github.com/kim-1868/miaowu-english/actions/workflows/global-dictionary-staging-remainder-cohort-manual.yml)，选择 feature 分支，`cohort_number` 从 1 顺序递增，`confirmation` 精确填 `STAGING_UNREVIEWED_COHORT_ADD_ONLY`。
- `Review deployments` 必须由负责人审核批准 Environment `staging-d1-schema-approval`，不得放宽自审/分支/环境限制。
- 执行前校验固定候选 artifact ID `13781435146`、源 SHA、单批 50000 行限制、SQL 文件 SHA、测试 D1 UUID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`、前一批行数、来源/教学审核禁用状态。
- 执行前完整导出测试 D1 → 离线 SQLite 独立恢复 → AES256 加密 → 先保存加密 GitHub Artifact（30 天）→ 再写本次单批 SQL。
- 最终再次通过 SELECT 复核本批行数、旧 `books/words/user_words/chapter_words` 运行前后计数完全一致、`global_dictionary_lessons/senses` 仍为空、来源未启用。若任何步骤失败，**停止、不直接重跑、不删库、不擅自恢复**，先看部分导入行数和加密备份，然后决定受控恢复。
- 成功之后将新生成的加密备份下载到个人电脑/私人安全存储；注意 GitHub Artifact 保留期有限，密钥在密码管理器中保存。**本工作流不会自动续跑下一批**。

## 词卡实际完成仍需要的内容门禁
- 已有私有 Library 历史词卡快照可构造 920 主词条 / 1150 严格义项候选，2206 旧 word ID；这不是目前线上四级23本+六级5本完整真实版本。现存 493 易审和 657 重点审稿批次都尚未正式商业内容审核通过。
- 一张可售教学卡必须有来源合法性、正确 UK/US IPA、准确 POS + 中文义项、自然原创英中例句、编辑审校来源，且对应 `global_dictionary_senses.approved=1,active=1`。未审核不可使用 `gds_` 作为伪造状态键。
- 已有 V2 小说不传 `words[]` 的后台预检与唯一义项匹配代码，但未在真实 staging Worker + 运营台对受控四级/六级小说完成端到端验收。未审批义项禁止自动发布。
- 旧用户学习状态以同一已审 sense ID 归并，保留收藏、最早待复习间隔、掌握状态冲突复核；不会因词头相同把多个词义合并，购买权限不变。

## 当前阻断点
1. **已完成**：[只读 post-index audit run 42848827545](https://github.com/kim-1868/miaowu-english/actions/runs/42848827545)，job `129943544968`，`completed/success`，原始日志确认 `STAGING_POSTINDEX_11422_ENTRIES_16442_FORMS_ONE_DISABLED_SOURCE_VERIFIED`、`STAGING_POSTINDEX_ZERO_APPROVED_SENSES_AND_ZERO_STUDY_BINDINGS`、`STAGING_POSTINDEX_HISTORICAL_BASELINE_4_59_9_262_VERIFIED` 和 `STAGING_POSTINDEX_READ_ONLY_NO_D1_MUTATION_NO_PRODUCTION_ACCESS`。独立只读门禁**已通过**，不可再标记待审批。现可在核对当日 Cloudflare D1 写入额度后，依序**人工批准**第 1 批受控 staging 导入。
2. 批次 1–9 均是**未来明确人工审批执行**，CI 通过 ≠ 云端导入完成。
3. 当前 0 正式签核 sense，缺少所有线上28本书受保护完整包、上下文锚点和编辑审批。未经真实来源与审核通过不能声称“全量词卡已完成”或“自动配卡上线”。

参见总交接 `docs/UNIFIED_WORDCARD_FULL_PROJECT_HANDOFF_20261110.md` 与 staging runbook `docs/GLOBAL_DICTIONARY_STAGING_D1_RUNBOOK_20261110.md`。
