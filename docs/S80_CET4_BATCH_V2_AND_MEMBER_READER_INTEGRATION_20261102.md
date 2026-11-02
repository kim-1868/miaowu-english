# S80｜CET4批量短篇流水线 V2 + 《雨夜档案》会员阅读接入准备

## 已确认的产品原则

- **按英语学习商品类别收费**：CET4／CET6／考研；小说题材（逆袭、BL、豪门、霸总、重生等）只属于**内部内容生产标签**，绝不能在网站书架渲染成分类徽章。
- 书架显示：封面、书名、简短简介、阅读状态／真实阅读进度、所属英语产品类别。不得在书卡增加 `genre` 或 `tag`。
- 四级用户一次兑换成功后，自动拥有**该商品类别已发布的全部小说和未来新增小说**；新增小说不能重复收费。
- 已上线的《雨夜档案》第一章公开试读不受本轮影响，另外11章只能经正式审批进入付费会员阅读器。

## 小说流水线 V2：一次8本候选（原来4本）

现有 `scripts/story-batch.mjs` 完成升级：原来4个剧本增加4个原创剧本，共8本、每本6章、约64个从已有考纲词形审计中选出的**待复核候选**。方向包括逆袭、BL、霸总、穿书、玄幻等。8本只是可生产的选题，**还没有通过模型生成章节正文或获得上架批准**。

核心操作入口：

```sh
# 不调用付费API，查看选题和预计调用次数（8×6章×纯中文/嵌词两阶段 = 96次）
node scripts/run-story-batch-v2.mjs preview --books all

# 在忽略版本管理的本地 private-output/story-batch/ 初始化8个写作任务
node scripts/run-story-batch-v2.mjs plan --books all

# 先配置本地环境 OPENAI_API_KEY 和 OPENAI_MODEL；以下命令会产生API费用
# 可以只选两本试产，限流并行数量2，章节在每本书内严格顺序生成
node scripts/run-story-batch-v2.mjs write --books heartbreak-mistaken-love,revenge-heiress-returns --concurrency 2
node scripts/run-story-batch-v2.mjs embed --books heartbreak-mistaken-love,revenge-heiress-returns --concurrency 2
node scripts/run-story-batch-v2.mjs qa --books heartbreak-mistaken-love,revenge-heiress-returns
```

批量运行遵守：每本书有独立进度，既有章节不被覆盖，重试会检查已有章节结构与章节编号；任何一种书失败，都不会自动删除另一书已生成结果。输出严格保留 `PRIVATE_AI_CANDIDATE`、`commercialApproved:false`，并保留原创性、自然度、词义、IPA、答案和版权审核要求。**不会将批量草稿提交到网站或D1。**

费用控制：不提供聊天内API密钥收集，不自动运行收费模型；首次先试产2本，抽检合格后再运行8本。API数量属于潜在调用计数，不保证实际费用或生成成功率。

## 《雨夜档案》12章：读者系统准备，不提前公开

`scripts/prepare-rainy-night-member-candidate.mjs` 从原始12章草稿生成符合现有内容包格式的**私有会员阅读候选**，不改源小说：

- 干净的候选书名和D1读者主键、四级产品归属、已确认封面引用；
- 12章内容、188个目标词、733处正文嵌入保持一致；
- 只标记第1章免费预览；第2–12章应该经现有 D1 权限和用户 CET4 授权后访问；
- 调用已有编辑包验证器和 draft-only SQL 形态审计；
- 明确 `commercialReleaseAllowed:false`、`d1Touched:false`、仍有188处词项审校、733处正文语境、36道题和读音资料审核缺口；
- `--check` 只打印汇总；`--write-private` 输出私有 JSON 和报告，**不会运行 SQL，也不会部署或发布**。

```sh
node scripts/prepare-rainy-night-member-candidate.mjs --check
# 仅在内部准备编辑审核时执行
node scripts/prepare-rainy-night-member-candidate.mjs --write-private
```

**下一阶段必须真正完成**：词义/音标许可/例句审核，正式D1内容草稿导入（生产库操作需经迁移/备份审查），现有读者的注册/激活/章节权限/进度/生词测试，运营者独立审核并手动批准发布。这一轮不宣称12章已正式上架。

## 质量门槛

1. 小说自然可读，不能通过硬塞关键词让句子生硬或影响剧情；
2. 用户不能绕过CET4权益拿到第2–12章；
3. 官方考纲只初步核对词形，不等于每个单词/义项均经过人工审定；
4. **内部故事题材不渲染在网站**，但保留商品类别 CET4 及“已拥有权益、可阅读”状态；
5. 审核通过且实际上线前不能宣传为完整可售合集。

> 本轮属于独立分支开发和PR验收：合并到release后仍需单独生产Worker部署，绝不因CI通过就说线上已更新。
