# V1.2 · 772 处正式小说上下文差异：受保护只读审稿包

## 真实证据

经 owner 审批、正式生产库固定只读聚合 [#43158107860](https://github.com/kim-1868/miaowu-english/actions/runs/43158107860) 核实：

- 仅已发布 32 本/上线章节，8,444 个标注，8,444 个 wordId 精确对应，缺失 segment、gloss、非法章节 JSON 均 0。
- 532 组文本重复候选中，涉及 5,507 个锚点；4,735 处正文 gloss 与旧词卡 meaning 文字相同，**772 处文字不同**。
- 这不等于 772 个错误，也不等于 4,735 个语义正确或商业授权已核准。

## 新增私密证据流水线

- `sql/published_32_private_772_context_gloss_mismatch_readonly.sql`：只读取已发布、当前上线章节，筛选重复旧卡文本义项候选，抽取发生差异的 wordId/词头/词性/旧词义/正文标注 gloss/当前 surface/旧卡音标与例句。不导出整章、段落全文、订单或用户行。
- `scripts/build-private-published-gloss-mismatch-review.mjs`：强校验返回 **772 条**，验证来源字段清单、锚点唯一性和确实存在的文本差异；所有记录保持 `HOLD`，`approved_sense_id=null`、`eligible_for_binding=false`。仅输出风险数量，不在日志公开原词/书 ID。
- `tests/v12-published-772-private-review.test.mjs` + QA workflow：Node SQLite 合成库严格核对已发布过滤、重复卡分组、差异字段、敏感字段拒绝和无自动批准。
- `.github/workflows/v12-published-772-private-review-protected.yml`：需要 `production-d1-readonly-approval` 人工批准，使用固定只读 SELECT 先核对先前 32/8444/772/4735 基线，然后导出772私密审稿行，**先在受保护runner中 AES256-GPG 加密并验证恢复，再上传7天有效期的密文 artifact**；不向公开仓提交审核数据、不改 D1、不部署、无用户复习记录写入。

## GitHub 审批注意事项

初次任务 [#43168579747](https://github.com/kim-1868/miaowu-english/actions/runs/43168579747) 采用旧版运行命令，已被更正，**不应批准旧任务**。它由于同一工作流的串行限制阻止了后续版本执行。

目前应在 GitHub Actions **取消旧版 #43168579747**，然后打开已修复版本 [#43168618991](https://github.com/kim-1868/miaowu-english/actions/runs/43168618991) 按 `Review deployments` 审批 `production-d1-readonly-approval`。这是独立审批，不能用先前已完成的 #43158107860 的权限替代。

## 阶段真实性

单独合成 QA 成功不等于私密生产审稿包已经生成。本工作流成功并且收到加密 artifact 才可说 772 项已导出；即使导出成功，也仅作为**待人工独立核准**的素材。TEST D1 `approved_active_senses=0`、`linked_published_anchors=0` 仍是待解决的实质上线阻断项。
