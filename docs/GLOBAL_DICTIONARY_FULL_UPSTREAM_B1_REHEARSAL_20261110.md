# 妙屋英语 · A2 全量上游词典来源核验 + B1 旧学习状态无损迁移预演（2026-11-10）

对应：[GitHub Issue #208](https://github.com/kim-1868/miaowu-english/issues/208)、[Draft PR #206](https://github.com/kim-1868/miaowu-english/pull/206)。

## 本轮真实新增成果

### 1. GitHub Actions 实际取得完整上游 ECDICT，并完成离线审计

从公开仓库 `skywind3000/ECDICT` 的 `master/ecdict.csv` 下载真实上游 CSV，使用 Python 流式 CSV 解析与临时 SQLite 去重；记录实际原文件 SHA256，生成**不含作者身份/用户学习记录/原音频/第三方例句**的统一主词头与词形候选 JSONL。

- 上游源 SHA256：`d1ecbdf9ee2b920afb6f430ca6b6bb9f559588cf0dff86e04bd255f9390843cc`
- 有效且无大小写规范冲突的常规词头 **400,183**，重复规范词头隔离 0。
- 词形→词头候选 **56,898** 条，涉及 **56,673** 种拼写。
- **225** 种词形同时对应多个词头；**56,403** 种词形同时又是某一独立词典词头。两项可重叠，不能相加。特别是源词典本身保留大量屈折词为独立词头，不能简单当作数万项人工审错。
- 考试来源标记（跨等级可重叠）：四级 3,846；六级 5,406；考研 4,801；雅思 5,038；高考 3,674；托福 6,970。**此为上游 ECDICT 标签，不是官方词纲覆盖率**。
- 由于词形/原形双存在，A4.3 词卡解析器新增「**唯一已审教学义项与小说标注 gloss 完全相符**」才允许自动判定本词形；其余仍审核，防止 `saw` 等词错误映射。

开发文件：`scripts/audit-upstream-ecdict-stream.py`、`tests/test_upstream_dictionary_stream.py`、`.github/workflows/global-dictionary-upstream-audit.yml`。

**可复验的完整候选索引（非生产数据、并未部署）**：
- 上游 GitHub Actions run：`42773007378`。
- 归档 artifact ID：`13742288377`，压缩包大小 8,621,234 bytes，保留至 2027-02-08（GitHub Actions artifact，无需使用私人仓库的 CI 额度）。
- Artifact 包含 `dictionary-unverified-entries.jsonl`、`dictionary-unverified-forms.jsonl`、`audit-summary.json` 和 `LICENSE-ECDICT.txt`。所有 `teaching_ready=false`、`reviewed=false`，**不会误作可销售教学词卡**。
- 原始完整上游 CSV 没有提交项目仓库或发到 Cloudflare；若后续要变更上游版本，须重新记录 SHA、审计差异和保留许可。

### 2. B1.1 先在离线备份演练「一个词头一条云端学习状态」

新增 `db/017_global_dictionary_legacy_links.sql`：只创建人工审核确认的 `legacy_word_id → canonical entry_id` 映射表，不重写旧 ID、不移动旧 `user_words`、不清空 `review_events`、不修改套餐权益。

新增纯预演 `src/global-dictionary-study-rehearsal.js` 与只读备份 CLI `scripts/rehearse-global-dictionary-study-merge.mjs`。合并策略：
- 一个人对一个统一词头，不同旧义项共享一本主词卡；
- 只有**全部**历史状态为 `mastered` 才判已掌握；历史有任何 `learning`/`review_due` 不得由旧已掌握状态强制覆盖；
- 收藏取并集；待复习时间优先保留尚未掌握记录的最早真实 `due_at`，**没有日期绝不伪造复习间隔**；
- 跨级别学习状态只是同一个已审核词头的记忆状态，**不代表取得其他等级的付费阅读权限**；
- 用户与旧单词 ID 只用于预演计算，写出的 JSON **仅聚合统计**，不导出任何可识别用户 ID。文件只写本地、且拒绝覆盖已有报告。

### 3. B1.2 旧词卡映射审核工作台

新增 `src/global-dictionary-legacy-worklist.js` 和 `scripts/build-global-dictionary-legacy-worklist.mjs`。基于**离线本地数据库备份**，对旧词卡做准确词头及中文义项核对：
- 同一 `record` 名词/动词若旧词义分别吻合已审 `senses_json`，产生指向同一主词卡的人工审核候选，不自动签名；
- `saw` 的旧中文释义与独立 `saw` 教学义项不一致时进入语义审查，禁止误关联；
- 原词典来源许可、词条或教学义项未审核时一律阻断；
- 已审核旧映射若与当前词头不一致，阻断而非覆盖历史。
- 仅生成私有 `legacy-canonical-review.jsonl` 工作单，不触碰任何线上用户或书籍。

## 本轮 CI 验收

最终 SHA `916c56305d4f0b32467798b8c406a27b91f4a272`：
- S1 run `42773005507`：**669 项，668 通过，0 失败，1 跳过**。
- Production dry-run run `42773005878`：**成功**，只构建未部署。
- 完整上游源解析 + 3个 Python 单测 + 数据 artifact run `42773007378`：**成功**。
- B1 SQLite 测试核查已学/待学混合、最早复习时间、收藏合并、反授权、跨词头错误、历史记录与用户数据无写入。

## 尚未满足上线门槛（不得误报完成）

- **全量词头索引已真实下载与离线生成，但尚未导入 Cloudflare 预览 D1**，且源翻译、音标、第三方例句的商业授权与教学质量尚未最终签核；不能将 400,183 词称为 400,183 张已审核教学词卡。
- **B1 还只是离线备份模拟与人工候选工作单**：正式网站仍保留按旧单词/词义身份的现有云端状态与阅读器。暂不启用新同步逻辑，也不批量合并学习计划。
- **真实四级六级小说上传、运营台页面操作、Cloudflare staging migration、用户权益与多设备验收**尚未在真实预览环境完成。
- 项目 Draft PR #206 未合并，正式站与预览站均未部署本轮代码，旧 `user_words/review_events/entitlements` 未修改。

## 后续发布门禁

预览 D1 创建经过验证的备份 → 上传完整只读词头索引（来源许可分离）→ 人工核查足够的教学卡和旧词身份映射 → 真正 staging 运营台 V2 小说与用户测试 → 实施有回滚的用户状态/一词一卡 UI → 用户确认后正式站上线。未经以上验收，不得自动发布或清空旧进度。
