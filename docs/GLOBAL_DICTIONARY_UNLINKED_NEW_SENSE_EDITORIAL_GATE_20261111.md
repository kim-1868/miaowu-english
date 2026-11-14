# B1.6 · 新词义（零历史旧 ID）初审衔接与安全签核门禁（2026-11-11）

> 只在 [Draft #206](https://github.com/kim-1868/miaowu-english/pull/206) 开发分支中使用，**不可直接开通商用教学，不修改 D1**。它补齐之前历史 1,150 义项审核门禁不能处理零旧 ID 的缺口。

## 真实私有离线 E2E

- 私有合并包目标 **7,391**。历史 1,067 个本期义项带旧 ID，使用现有 `src/global-dictionary-editorial-signoff-gate.js`，不得迁入本流程。
- 其他 **6,550** 无历史义项先分类。其中单词性低冲突 **565 / 565** 已有自编英中例句草稿；其余 5,985 未完成对应义项草稿。645 句总数含 80 旧历史义项。
- 新 `src/global-dictionary-new-sense-editorial-gate.js` 严格禁止 `old_word_ids` 和自称 Publisher 已批准，对来源、词性/译义/例句、商用授权、人工审核身份证明、独立发音来源和旧义项撞车证据进行审查；缺一不可。校验成功也只输出**等待真实 OPS 认证的签核建议**，不返回 `approved_sense_id`。
- `src/global-dictionary-new-sense-initial-review-adapter.js` 读取 **565 单词离线审稿台**导出的全部 565 条初审 JSONL；即使初审打钩，也只能产出 `action=hold`、无许可确认、无真实 reviewer 的新义项正式审稿**空白模板**。初审勾选绝非 Publisher 审稿。
- `scripts/check-private-new-sense-editorial.mjs` 两种纯本地操作：
  1. `--source PRIVATE_645.jsonl --initial-review PRIVATE_565_EXPORT.jsonl --out NEW_HOLD_TEMPLATES.jsonl`
  2. `--source PRIVATE_645.jsonl --decisions PRIVATE_EDITED_565.jsonl --out PRIVATE_REVIEW_REPORT.json`
  会严格排除第一阶段 80 个历史来源义项，不允许新义项混入旧 ID；输出使用独占文件写入，拒绝覆盖已经填写的审核记录。所有文件从私有工作区读取，不向 GitHub、日志、Worker 发送内容。
- **真实私有数据全流程通过**：565 词头 + 565 全部未勾选的本地初审起点 → 565 带原稿的 `HOLD` 模板 → 565 阻断；0 已签核、0 可请求 OPS 最终签核、0 个旧 ID 绑定、0 次 Cloudflare D1 或用户学习数据操作。注意浏览器 QA 曾模拟勾选 1 条，正式交付的 565 初审起点已**全部清零**以免冒充人工审核。
- **合成回归 16 项全部通过**：伪造 Publisher 状态、旧卡 ID 偷带、重复义项/来源、改头改等级、空缺英中例句、无 UK/US IPA 或商业授权、无真人审核证据都被阻断。公开 GitHub CI 只带 synthetic fixture。
- 私有一体化增量包：`/开发英语单词学习网站/统一词卡_待审工作区/四级六级考研_优先审稿1150/妙屋英语_565新增义项_离线审稿衔接与安全门禁_20261111.zip`。包含 565 原词头与例句、565 未勾选初审源、565 HOLD 模板、565 受阻 QA 报告、代码及测试、SHA256 逐文件清单；ZIP 自检全部通过。

## 仍需完成的产品缺口

1. 逐条真正审阅 565 例句与译义（尤先 135 个高风险词）、确认音标/权利证据。只有 OPS 授权 Publisher 才能进行最终签核。
2. 对尚未起草的 5,863 多义/多音和 122 词源/缩写进行义项拆分、语境例句创作与审稿；不得为赶上线把同一词不同义合并成一个学习状态。
3. 实现真实有权限、可撤销/审计的 Publisher 服务端 signoff 和可追溯词库数据导入，先做 staging D1 备份/迁移，再验证旧书新版导入和新书自动配卡、跨书同义项去重、权限与回滚；全部通过才能考虑生产合并。

**词源候选覆盖不等于已审义项覆盖，例句自动 QA 通过不等于人工语义正确，不允许无授权自动写进可售词库。**
