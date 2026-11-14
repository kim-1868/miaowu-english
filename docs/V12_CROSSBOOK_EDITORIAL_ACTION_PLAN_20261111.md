# 妙屋英语 V1.2 · 跨书审核任务批量计划（2026-11-11）

这是 **PR #231/#232 离线小说预检**的下游环节，不依赖还未运行的 019/020 迁移。

工作流：

1. 四级/六级授权只读导出，加本地考研草稿，由 `scripts/preflight-crossbook-dictionary-batches.mjs` 生成**私密**的预检报告；
2. 此次新增 `src/global-dictionary-crossbook-review-action-plan.js` 对已标注旧词卡、未标注英文候选和小说内容缺陷生成三类审核任务：
   - `EXISTING_SENSE_REVIEW`：跨小说复用、同词异义、缺 IPA / 双语例句、字典候选未审；
   - `UNMARKED_CONTEXT_REVIEW`：尚未标注英文的词头，必须编辑确认上下文对应义项；
   - `BOOK_CONTENT_REPAIR`：无词卡引用、内文义项不一致、缺音标/例句和无学习目标段落；
3. 按影响范围和复用程度排序，分别输出四级、六级、考研各自首批 120 个（默认）审稿任务，保留待审总数与剩余数。结果是可重复生成、仅供人工复核的任务队列。
4. 不读取真实用户记录、不写数据库、不修改小说正文或用户权限。每条任务明确 `approved_sense_id:null`、`approval:false`、`publish_allowed:false`。词源许可和英汉例句权利由正式审核流程另外确认。
5. 工具对任何宣称已审核、自动绑定、自动发布或写过用户进度的预检报告直接拒绝处理，不能靠文件字段伪造运营台审核。

在运营方本地执行（**输入和输出均须在公开仓库之外**）：

```bash
node scripts/build-private-crossbook-review-actions.mjs \
  --report /private/crossbook-private-review.json \
  --out /private/crossbook-editorial-tasks.json \
  --batch-size 120
```

本阶段仅实现“审核任务生成”，**不代表线上已上架小说已完成全量审稿，不代表 61,422 个候选词已获得商用许可**。真实批量统计需要以授权导出的最新书架为准。019 的测试库人工迁移继续由用户另行执行，正式站不改动。
