# V1.2 · 四级/六级/考研小说跨书统一词卡批量预检（2026-11-11）

本工具属于妙屋英语“统一词库 → 自动匹配小说 → 统一词卡和复习”生产流水线的**人工审稿预检阶段**。不接触 019/020 远程 D1，不修改用户学习记录，不上架小说。

## 当前已有基础

- 四级/六级：现有运营台可由已登录发布者授权，以**只读**方式导出各级已上架小说快照。导出结构带每本 `sha256`、版本号和章节数量；使用 `unpackAndVerifyExamLiveBatch` 对每本校验。导出并非原子全库快照，多个导出时间点之间可能存在变化。
- 考研：目前仅支持**运营方自有的本地 JSON 草稿**进入同一预检，不能宣称已核对线上考研书架。
- 词库索引：允许传入离线本地 ECDICT 衍生 CSV，用于判断词头候选是否存在、拼写/词形是否歧义。来源许可、音标和释义仍未审核；**字典查得出 ≠ 可商用的已审教学词卡**。
- 当前测试库 61,422 条候选词头、16,442 条词形的基线与此工具无直接读写关系；这不是“全量已完成词卡”。

## 新增内容

`src/global-dictionary-crossbook-batch-preflight.js`：

1. 分别核对四级/六级完整的出版者导出包 SHA 和书籍版本，考研本地草稿单独标记；
2. 对已标注的小说单词卡按照 `headword + part_of_speech + meaningZh` **严格聚合待审义项**，同一义项跨书只形成一个候选群组；
3. **同英文拼写不同词义**列入专门的多义项复核，不直接共享 `mastered`；
4. 缺词性/缺含义的单词没有足够证据判定为同一义项，保留单本旧词卡 ID，**不跨书自动合并**；
5. 每本输出旧词卡缺失、内文目标词释义不一致、缺 IPA、缺双语例句、纯中文无目标词段落、未标注英文片段等计数；
6. 提供按跨书覆盖数和出现频次排序的优先审稿队列，以及跨级别复现统计；所有候选仍显示 `approved_sense_id:null`、`cross_book_mastery_merge_allowed:false`，不能用于直接写入学习表；
7. 无需请求远端数据库，输出不包含小说正文句子、用户学习记录、订单或密钥。
8. 扫描尚未标注词卡的 `segments[].text` 中的英文**单词候选**（跳过 HTTP/HTTPS URL 和 email），按照跨书出现数、频次排序输出 `unmarked_discovery_queue`；对每个词查询已有的离线字典索引（若提供），区分 `matched/dictionary_only/needs_review/missing/NOT_CHECKED`。这个阶段**绝不猜测语境义项**，不自动上架或改正文。
9. `unmarked_discovery_queue` **仅包含单个英文词、出现次数和书籍归属**，不复制上下文句子。每个候选固定 `requires_context_sense_review:true`、`automatically_bound:false`；即使字典中存在也不算审核通过。


`scripts/preflight-crossbook-dictionary-batches.mjs`：

- 从**仓库外**的私密本地文件读取四级/六级导出包、考研草稿、运营方词表 CSV；
- 报告也只能写到仓库外的私密目录，文件仅所有者可读（`0600`），若报告已存在则拒绝覆盖；
- 控制台只打印匿名计数，不打印付费正文，避免把私密素材送到公开 CI 日志或仓库；
- 原始小说和词表**不能提交到公开 Git 仓库**。

## 离线执行示例

```bash
node scripts/preflight-crossbook-dictionary-batches.mjs \
  --cet4-batch /private/cet4-live-export.json \
  --cet6-batch /private/cet6-live-export.json \
  --postgrad-drafts /private/postgrad-json \
  --lexicon /private/owner-merged-ecdict.csv \
  --out /private/crossbook-private-review.json
```

允许只提供其中一个等级的输入，不要求三类同时齐全。仅 `--out` 是必填项。建议四级/六级尽量使用同一日重新导出的快照，避免对比不同版本的小说。

## 后续实施顺序

1. 继续补充词库来源许可核验、义项/音标/例句的人工审稿队列，先四级/六级/考研核心词；
2. 运营方私密导出实际在线小说 JSON 后，运行本工具取得真实各书可审核报告，才能回答“目前有多少跨书重复义项”等问题；**仅凭测试数据不声称真实覆盖率**；
3. 对人工审核通过的义项分配稳定 `sense_id`，建立经过授权的小说上下文义项绑定；
4. 用户之后完成 019 测试库手动迁移后，另行审核 020 按 `sense_id` 的 SRS 结构和真实预览站接入；
5. 多书同义项共享进度，不同义项独立，测试老用户、收藏和复习计划不回退，再考虑正式部署。

本功能为 code-level preparation + synthetic QA；无真实小说批次数据时不产生正式审稿统计。
