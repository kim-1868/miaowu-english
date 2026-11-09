# 全站统一词典 A2 · 词典索引与预检数据源验收（2026-11-10）

关联 [Issue #208](https://github.com/kim-1868/miaowu-english/issues/208) 和 [Draft PR #206](https://github.com/kim-1868/miaowu-english/pull/206)。

## 本阶段完成（代码已通过整仓 CI；尚未实际执行数据库迁移）

- `db/013_global_dictionary.sql`：独立 `global_dictionary_entries`（一个 normalized headword 唯一主 ID）、`global_dictionary_forms`（一词形多候选、审核标记）和 `global_dictionary_sources`（许可证、源 SHA、启用门禁）表。**完全不修改旧用户或小说业务表**。
- `scripts/build-global-dictionary-staging-sql.mjs`：将已提供的词表转成分批事务 SQL，默认 `teaching_ready=0` / `reviewed=0` / `enabled=0`，仅输出本地文件，不执行 D1。
- `scripts/build-upstream-ecdict-index.mjs`：兼容上游 ECDICT 原始英文表头 `word/phonetic/translation/pos/tag/exchange`，可处理不限于四级的原始词典；原始例句、音频及未经验证 IPA 不会获得发布权限。
- `src/global-dictionary-db.js`：只读查询独立词典索引，支持正文原形、歧义词形；同时要求来源许可证审核、来源启用、词卡本身人工审核、词形核验，全部条件齐备才进入 `matched`。
- `src/ops-import-preflight.js`：仅在预览站 `GLOBAL_DICTIONARY_LOOKUP_ENABLED=true` 且 schema ready 时读取新词典；默认回退旧卡只读对比。**所有预检仍然 `ready_to_publish:false`**，不会自动写小说和正式上架。
- SQLite 集成测试：实际创建新表、模拟导入若干四级/六级/雅思词、核实词形歧义、审核门禁、默认禁用和零数据改写；上游 ECDICT 原始英文列兼容测试及端点鉴权测试。

## 真实的站长来源词表离线抽查

数据源：`考试词表_合并版_原始.csv`，SHA256 `f748cdfbd3fa2c6bd33f5ced0b021dd8f69386a52539596db4d4d8b91cc67d37`。

- 原始唯一词头 8,671 个；新的“单英文词头”索引筛选后 **8,663** 个（8个例外转人工审核队列）。
- 索引内四级标记 **3,846** 个，原始四级来源总数 3,849：差额三项为有标点缩写，必须单独处理，不代表删除四级要求。
- 索引内其他标签：六级 **5,406**、考研 **4,801**、雅思 **5,038**、高考 **3,671**。一个词头可以同时属于多个等级，统计值不可相加。
- 词形数据含 **13,971 种去重表层拼写**、19,667 个词形→词头来源关系。至少 **596** 个表层拼写同时对应多个词头或本身又是一个独立词头，必须进入上下文审核；其他词形来源也默认 `reviewed=0`，不立即自动连接。
- 例外词头如 `B.C.`、`P.M.`、`i.e.` 和部分固定词组应进入“缩写/词组”扩展机制，不应偷偷把它们改写成另一个主卡 ID。
- 来源词表是 ECDICT 衍生的考试标签快照，**不是**最新官方四级词纲，也不是全量上游 ECDICT 词典。完整上游词典尚未导入任何 D1。

## 运行方式（仅本地生成候选 SQL；需要独立预览备份和数据库授权）

```bash
npm run dictionary:staging:sql -- "考试词表_合并版_原始.csv" --out ./private-output/global-dictionary
npm run dictionary:staging:sql -- path/to/ecdict.csv --out ./private-output/full-ecdict --upstream-ecdict
npm run dictionary:staging:tests
```

注意：输入 CSV 不需要上传 GitHub 公共仓；SQL 仅由人工检查后在**隔离预览 D1**顺序执行（先 schema、再全部 `01-entries`、再 `02-forms`、最后 `03-source-disabled`），严禁直接对生产库执行。此处没有发生实际导入。

## 验收结论与尚未完成

- A2 的**代码与离线结构**已通过 CI：截至该阶段 GitHub Actions S1 623项测试中622通过、0失败、1跳过；Production dry-run 通过（不部署 Cloudflare）。
- **A2 实际数据上线、完整 ECDICT 全量数据导入和许可证逐项签核仍待完成**，不得把此报告理解为“全量统一词卡已经完成”。
- 下一步：独立预览 D1 备份及索引导入 → 真实四级/六级小说预检报告 → A3 异常确认与关联包生成 → B1 历史学习状态安全合并 → 预览站验收。
