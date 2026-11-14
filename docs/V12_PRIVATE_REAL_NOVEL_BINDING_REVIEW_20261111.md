# V1.2 历史小说逐词义关联审核（私密、本地、可追溯）
本阶段接续 PR #231–234 和真实历史词卡审计：将**已经保存的完整小说 JSON**与历史旧词卡候选映射关联为每个 `chapter:number + paragraph + segment + old_word_id` 的审核记录。

- 当前上下文必须人工核对：`approved_sense_id:null`、`editor_action:'hold'`、`eligible_for_study_write:false`。
- 每条记录有独立 `review_id` 和 `source_fingerprint_sha256`，可检测稿件与映射变化；并对正文释义不一致、旧词卡 ID 消失、词性/词义改变、历史来源不属于本书等明确记录原因。
- 同一词头下不同词义必须独立确认为已审核的 `sense_id`；**候选文本相同并不能代替人工签核**，且此工具不包含在线用户/购买状态。
- `scripts/build-private-novel-binding-review.mjs` 只接受公开仓库**外部**的来源 JSONL、小说文件夹及输出路径，拒绝覆盖已有报告，控制台只打印总数；Paid story prose **never** enters CI.
- 当前真实试点资料来自用户历史保存的《末班车前请回信》和《第十三张底片》修订 JSON，**并非正式站最新 Publisher 快照**；需要拿到新版只读导出后再复核审稿决议、章节版本及全部锚点，才能提议真实 D1 关联变更。
- 019/020 迁移未执行、学习功能 feature flags 保持关闭、正式站无写入。

示例（仅本地资料与私密输出）：

```bash
node scripts/build-private-novel-binding-review.mjs \
  --source /private/03_2206旧词卡到候选义项映射.jsonl \
  --novels /private/novel-json \
  --out /private/novel-context-sense-review.json
```

审核记录是**待审工作台数据**，不是可售卖的最终词卡或已生效的用户学习状态。
