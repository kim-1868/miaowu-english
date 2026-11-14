> **后续实际进展（2026-11-11）**：原报告所述“尚未接入 pinned ECDICT + IPA 全量私人合并、headwords_with_pinned_opensource_candidates=0”已被后续真实运行**更新**，请以 [EXAM_FIRST_REAL_7391_SOURCE_JOIN_20261111.md](EXAM_FIRST_REAL_7391_SOURCE_JOIN_20261111.md) 为准：全部 7,391 私人目标词头参与真实源匹配，7,385 有中文释义候选、7,299 有美式 IPA 候选、7,354 具可抽取的词性行前缀候选，50 批私人审稿包已更新。所有卡仍未审核，已批准 sense=0，生产 D1 写入=0。原始阶段记录保留供溯源。

# 妙屋英语 · 四级/六级/考研词卡开源候选与旧书教学义项合并（2026-11-11）

## 范围与完成状态
已新增 `scripts/merge-exam-first-review-candidates.py` 和纯合成回归测试；此脚本把用户私人 7,391 目标词头、1,150 历史候选义项、40 条新原创双语例句稿，与 **已有开源生成器** `scripts/build-exam-first-open-source-card-candidates.py` 的私人输出按词头和 canonical entry_id 连接。拒绝重复词头、重复历史义项哈希、跨义项复用旧 word ID、编造的已审状态及不一致的 source ID。不会为任何词义自动造 approved sense_id，不会写 D1，不会修改跨书复习/购买权益。

**实际跑过的私人批次（2026-11-11，本次执行）：**
- 7,391 目标词头：基础 3,674、四级新增 1,654、六级新增 1,755、考研新增 308。
- 命中第一期历史候选义项 1,067 / 1,150，覆盖 841 个词头；其余 83 条保留历史数据但不混进第一期。
- 6,550 个目标词头缺少历史义项稿；2,206 个旧 word ID 全部保留；40 条原创双语例句草稿按原候选哈希附着。
- 50 个私人审稿批次，每批最多 150 个词头；含历史高复用 197 词头、低冲突 429、专项 215 与无历史内容 6,550。
- 本地纯合成测试 5/5 通过；本次真实数据汇总断言通过。
- **本次源数据连接层尚未在本地接到完整的 pinned ECDICT+en_US 原始文件**，故该工作包的 `headwords_with_pinned_opensource_candidates=0`；这不是上游词典缺失，而是本次工作包暂未填充开源字段，绝不可说已完成 7,391 张教学卡。此前公开样例的上游 join 真实测试已通过，完整私人全量运行仍待执行。

## 私人输出在哪里
Library 私人路径：
`/开发英语单词学习网站/统一词卡_待审工作区/四级六级考研_优先审稿1150/三级考试7391词头_统一词卡待审合并包_20261111.zip`

内容：`summary.json`、`batch/REVIEW_001–050_NOT_APPROVED.jsonl`、本脚本与测试、说明。**不将私人词表/真实旧卡/收费小说内容提交公共 GitHub**。其它对话可从该 Library 路径继续审稿。

## 下一步：在私人可信工作机直接加入真正开源候选
1. 从已经固定版本获取 ECDICT (`39cfb9672c0906b63569e0453c2e6abfb9ab182a`) 的 `ecdict.csv` 和 `LICENSE`；从 ipa-dict (`972cd67dd5f96bc5660e28070cde26e3928abcd7`) 获取 `data/en_US.txt` 与 `LICENSE`。不导入 GPL 关联 `en_UK.txt`，不从来源复制例句/音频。
2. 运行已有 `python scripts/build-exam-first-open-source-card-candidates.py --targets TARGETS.jsonl --ecdict ecdict.csv --ipa-us en_US.txt --ecdict-license ECDICT-LICENSE.txt --ipa-license IPA-LICENSE.txt --out PRIVATE_SOURCE_OUT`。
3. 运行 `python scripts/merge-exam-first-review-candidates.py --targets TARGETS.jsonl --historical HISTORICAL1150.jsonl --drafts EDITORIAL40.jsonl --opensource-candidates PRIVATE_SOURCE_OUT/exam-first-opensource-candidate-only.jsonl --out NEW_PRIVATE_REVIEW_OUT`。
4. 在新的 `summary.json` 检查 7,391 行全部有来源候选、来源 SHA 与每档命中数量，再进行 IPA/中译/词性/原创例句人工复审与 Publisher 签核。

## 发布边界
ECDICT 的中文释义、音标、词性与 ipa-dict 美式 IPA 只是带来源、待审的候选；许可和正确性须逐字段审计。审核过的相同 **sense_id** 跨故事共享学习状态，不同义项单独复习。一切旧小说与新小说的自动配卡仍走现有 V2 preflight、OPS Publisher、staging D1 和正式发布门禁，不会自动授权上架。

本增量 PR 只进入上游 Draft #206 功能开发基线，不触碰正式发布分支、现网、用户、Cloudflare D1。
