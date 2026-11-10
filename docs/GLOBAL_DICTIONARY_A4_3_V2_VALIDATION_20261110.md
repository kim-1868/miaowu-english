# 妙屋英语统一词典 A4.3 · 无重复词卡小说 V2 上传真正可转换（2026-11-10）

跟踪：Issue #208 / Draft PR #206。

## 完成的阶段能力

- **小说源格式 `version:2`**：无需 `words[]`、不许作者生成或传入 `wordId`。小说正文由 `{text}` 段和 `{surface,gloss}` 学习目标段组成；当前句中文含义由作者提供，发音、词性、例句、其他常见释义由**统一词典数据库**提供。
- **分级复用**：同一个 `entry_id` 既可用于四级也可用于六级小说；重复 `record` 和 `recorded` 在词形已审的前提下归并为同一主卡，小说内每次出现的 `gloss` 保留原义，生成旧运营台可接收的完整 `version:1` JSON。
- **独立多义教学数据 `db/016_global_dictionary_lessons.sql`**：一个 `entry_id` 仅有一份教学主卡，`senses_json` 可包含多个词性/释义/例句；主卡另提供旧阅读器能显示的基本音标、合并释义、例句、搭配。只接受真实有审核人和审核时间、双语例句完整且结构检查通过的课程行。
- **预览站限定接口 `POST /api/ops/import/dictionary-v2/preflight`**：必须 Publisher 身份且 `GLOBAL_DICTIONARY_LOOKUP_ENABLED=true`；从可信 D1 查询词典来源授权、词条审核、词形审核、教学卡，不接受上传包自称已审核的信息。只读，返回 `review_queue` 或 `converted_package`，不会调用正式上架。
- **运营台导入**：识别 V2 JSON 后先走自动匹配；歧义词可按章节/段落/位置选择已审词头（不能强制放过不合格教学卡）。缺词/未审核时禁止继续，展示异常。转换成功后必须按已有指纹候选、审查、staging 关联草稿模式处理，**不能落入旧 `确认上传并上架` 的自动发布分支**。
- 旧版 JSON/Markdown/TXT 导入保持原行为；前期已经构建的 A3.2/A4.2 sidecar 与现有 409 版本修订保护没有被破坏。
- Agent 可参照样例 `content/examples/novel-v2-no-wordcards.example.json` 和完整说明 `docs/GLOBAL_DICTIONARY_NOVEL_V2_UPLOAD_20261110.md` 生成六级小说，而无需在正文包重复附带词卡。

## 当前验证证据

- GitHub S1 完整测试（SHA `5031957a6af553d321b06c420ffba0dc20eb709f`，run `42770693635`）：**657 tests / 656 pass / 0 fail / 1 skipped**。
- Production dry-run（run `42770693696`）：**success（仅构建，无 Cloudflare 部署）**。
- `tests/v12-dictionary-novel-v2.test.mjs` 包含：无 words 源小说、跨词形稳定词头 ID、词典缺词、源许可证撤销、教学例句缺失、同形词逐句人工选择、拒绝作者自定义 wordId、普通英文不会无授权变成学习目标、staging token/权限校验。
- 另通过已有逐句候选及草稿关联测试，保证本阶段不修改原小说、复习状态、购买权益和旧 word ID。

## 尚未完成（不得声称已上线）

1. **真实完整 ECDICT 上游数据导入**、许可证链和大量词卡的人工教学审核均未完成；目前可用只是已有 8663 个种子词头的待审离线索引，加上新格式与接入原型。未经审校的词在新接口会明确阻断。
2. **未执行**新增 `db/013–016` 在 Cloudflare 预览 D1 的迁移，未部署 staging / production，未完成真实四级/六级小说端到端操作验收。
3. 现有用户学习表按旧 `word_id` 保存，历史学习状态兼容与词典式多义 UI 是下一阶段 B1；不能直接把现有用户已学状态清空、覆盖或将不同词错误合并。
4. 暂不支持仅给整篇无标记小说就自动挑出全部学习目标词；普通英文会作为非强制发现处理。Markdown/TXT 直接走统一词典尚未完成；优先将 V2 JSON 工作流验证后再扩展。

## 下一阶段

隔离预览 D1 数据备份与独立导入 → 真实词典教学卡审查与建立共享主词条 → 四级/六级 V2 真实小说端到端验收 → B1 阅读器统一一词一卡和无损学习状态迁移 → 站长批准正式发布。
