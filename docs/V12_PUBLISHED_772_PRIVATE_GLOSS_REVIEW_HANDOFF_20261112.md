
## 已验证的生产审稿导出结果（2026-11-12）

**最新结果覆盖此前的“待审批”描述。** 用户已取消旧任务 [#43168579747](https://github.com/kim-1868/miaowu-english/actions/runs/43168579747)；修复版受保护只读任务 [#43168618991](https://github.com/kim-1868/miaowu-english/actions/runs/43168618991) 已完成，所有步骤成功，含固定生产 SQL、严格基线校验、772 行审核队列创建、GPG 对称加密、解密后内容一致性核验和加密 artifact 上传。

- Artifact ID **13922285839**，名称 `v12-published-32-772-context-gloss-HOLD-encrypted`，约 **100,994 bytes**；GitHub 的失效时间为 **2026-11-19T06:45:21Z**（按 GitHub 服务端时间，具体展示可能因时区不同）。
- 与此前 #43158107860 完全一致的基线：32 本/8444 个锚点/532 个重复候选组，其中 5507 处相关位置、4735 处原卡释义文字相同、772 处不同。
- 真实 772 条校验：`gloss_mismatch_positions=772`、`different_after_punctuation_removal=772`、`form_variant_candidates=0`、`missing_uk_or_us_ipa=0`、`missing_bilingual_example=0`。
- **全部 HOLD，0 条人工/OPS 正式义项批准、0 条链接写入、0 次生产数据写入**。这些数字不是新增可售词卡数量。
- 付费内容片段仅在受保护 runner 内的私密文件中处理；公开项目只记录匿名数量、源文件合同及流水线。解密需要对应受保护的 GitHub Secret，不能在公共 issue、聊天或代码中公开密码。
- 须在 Artifact 过期前由具有权限的负责人将**加密文件及解密凭证分别安全保管**。若无法安全取回或重放，则必须重新经保护性审批导出，不能用缓存的旧审核材料充数。
- 下一阶段应在同等保护边界下复核真实逐行的 `context_gloss` 与 `old_card_meaning_zh`，区分同义改写、义项不同、上下文不充分与数据错误，并独立核验来源商用许可，形成签核建议。**未经验证的候选不能转成 sense_id，也不能写入 TEST D1。**


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
