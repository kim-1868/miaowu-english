# 妙屋英语 V1.2 · 第四阶段：小说未标记英文的编辑确认与词卡复用（2026-11-11）

> 当前仅开发分支 Draft #206；**不自动发布、不直接写 Cloudflare D1、不读取/修改真实付费小说和用户学习记录**。生产发布门禁仍为 Publisher 审核+实际预览站验证。

## 此次新增的真实工程能力

旧代码已经能扫描 V2 小说的 `{text:"...English..."}` 并列出英文词头、偏移、可能词头和已审核教学义项；但这一清单只读，没有「人确认上下文后，把原文本安全生成词卡目标段落」的转换。此轮补齐：

1. `src/global-dictionary-unmarked-editor-confirm.js`：根据**重新计算**的自动发现与已审核主卡，生成编辑审稿清单；要求 `source_sha256 + plan_sha256` 防止审旧稿套新文本，逐个对原 token 的章节、段落、segment、UTF-16 offset、`entry_id` 和 `sense_id` 进行强校验。每一条确认必须显式 `confirmed:true`。歧义多词性由编辑选择真实上下文义，绝不由 AI 猜测。
2. 完成审核选择后只将**选中的英文 token**拆成 `{surface,gloss}` 段落，逐字符断言拆分前后原文完全一致；保留书名、章节 ID、免费/付费、未确认英文和之前已经存在的学习目标，不重复创建词头和词卡。
3. 严格复用原 `normalizeDictionaryNovelV2`、`convertDictionaryNovelV2` 和 `planApprovedNovelSenseAnchors`：确认的内容必须通过已有 V2→V1 教学包语义检验与唯一 `gds_*` 已批准义项定位，才能输出**待上架审核的 V2/V1 兼容包**。绝不把源词典普通候选或已写但未审的例句直接宣告可售。
4. `src/global-dictionary-unmarked-editor-ops.js`：从 staging D1 只读已审核词库、许可来源、词形审核、lesson 和 active approved senses。前端传入的 `index/lessons/senses` 不受信任；服务器重新计算来源数据。需 OPS Publisher 身份进入；新增服务端 **`POST /api/ops/import/dictionary-v2/plan-unmarked`**（准备审稿清单）和 **`POST /api/ops/import/dictionary-v2/confirm-unmarked`**（按明确决策生成安全草稿），仅限 staging 且开既有读取开关，无 D1 写入。
5. 不会覆盖旧 2,206 个历史 word IDs；也不改变 019 词头级复习计划、旧书内容、订单及收藏。若某词在多个小说出现，可以重复关联同一 `entry_id`，用户只背一张主词卡。

## 上线/验收边界

- 新增的编辑确认输出**不是已经入库、不是已发布小说**。其 V1 兼容包必须走原有严格的 OPS 导入、来源签核、版本化修订、章节 `chapter_words`/精确锚点绑定及 Publisher 审核，才可能显示给实际读者。
- 正式生产与 staging 的 019 远程数据库迁移尚无真实完成证据；当前 `publisher approved` 的真实 owner 数仍为 **0**，所以不能拿已有 7,391 源候选/655 原创待审草稿虚构一个可上架例子。测试例使用合成的 `record` n/v、`decision`，不包含用户付费故事。
- 后续真正上线前需要保证已审核词卡、购买权益与精确 `pX:sY` 均真实存在；预览站先完整备份再演练+回滚。当前本代码不包含自动把所有普通英文都当作教学目标的开关。

## 下一步

把该审稿流程变成 OPS 里的可操作列表与差异预览，支撑多本小说批量处理；随后将 V2 可上架包通过真实 staging 的导入/审核/关联流程验证。解决普通英文高频停用词的默认过滤策略与内容覆盖，不影响中文小说自然阅读。