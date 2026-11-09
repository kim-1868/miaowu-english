# 妙屋英语 · 统一词典自动匹配 A1 实施记录（2026-11-10）

项目任务：[Issue #208](https://github.com/kim-1868/miaowu-english/issues/208)  
完整需求：[GLOBAL_DICTIONARY_NOVEL_AUTOMATCH_PLAN_20261110.md](GLOBAL_DICTIONARY_NOVEL_AUTOMATCH_PLAN_20261110.md)

## 本轮实际完成的代码（均只在 Draft 分支）

1. **纯匹配器 `src/global-dictionary-matcher.js`**：
   - 不区分四级/六级/考研/雅思的公共词头索引；统一入口可接多种词典，1个 `entry_id` 表示1张词典主卡，内部可以有多词义。
   - 精确词头匹配、审核过的词形映射、同形异词/多个旧词 ID 歧义拦截、基础词典与已审核教学卡严格区分。
   - 可分析现有 `version:1` 小说 JSON 中标注的目标学习词，**另行**记录普通正文英文作为非强制发现；完全不更改 JSON / D1 / 旧 `wordId`。
   - 汇总目标词 `matched` / `dictionary_only` / `needs_review` / `missing`，附首次上下文和章节信息。
   - 词形未审核或有同形碰撞时，绝不默认挑一个候选。
2. **预览站只读接口 `src/ops-import-preflight.js`**：
   - `POST /api/ops/import/preflight`，仅 `APP_ENV=staging` 且已验证 Publisher 角色可访问。
   - 目前**只与网站已有 `words` 表做逐词精确匹配**。此时没有独立统一词典表，因此已有旧词卡属于 `dictionary_only`，**绝不冒充商业教学审校通过**。
   - 每个请求有大小/数量限制；仅使用 SQL SELECT；永远返回 `ready_to_publish:false`、`release_blocked:true`，不会触发原 `/api/ops/import`。
   - 该接口只是项目 A1 原型；后续 A2/A3 接入真实主词典数据，才能展示真正高置信自动匹配。
3. **运营台原有上传页面**：
   - 预览站发布者识别 JSON/Markdown/TXT 后，可点击新增「统一词典自动匹配预检」按钮，只读查看匹配与待复核词及章节。
   - 正式站身份下隐藏按钮。原有上架行为、封面、发布鉴权、版本修订和 `BOOK_ALREADY_EXISTS_USE_VERSIONED_REVISION` 规则全部保留。
4. **词典索引离线编译工具 `scripts/build-global-dictionary-index.mjs`**：
   - 从站长现有 ECDICT 衍生考试词表生成统一、稳定 ID 的词头索引；多等级标签复用一张主卡；单独导出词形候选与原始数据异常列表。
   - 所有外部源 IPA/释义/词形均标注未审核，**不会自动填 `teaching_ready=true`**；无数据库写入。
   - 首期现有源共 8671 个去重原始词目，是先导种子，不等同 GitHub ECDICT 全量数十万条，也不是官方考试大纲。
   - CLI 参考（项目仓库本地执行）：`npm run dictionary:index:source -- "考试词表_合并版_原始.csv" --out ./private-output/dictionary-index`。源文件不自动复制进公开仓库。
5. **测试**：`tests/v12-global-dictionary-matcher.test.mjs`、`tests/v12-global-dictionary-index.test.mjs`、`tests/v12-ops-import-preflight.test.mjs`，覆盖跨级别匹配、词形歧义、同形异词、旧稿兼容、未审核禁用、令牌和环境保护、SQLite 只读路径、非法数据上限。完整 CI 以最终 GitHub SHA 报告为准。

## 当前阶段限制（必须对站长明确）

- **尚未导入完整 ECDICT 的全量词条**：目前源 CSV 可作为首期离线索引，缺少商业审核过的全部主词卡。
- 旧 `words` 表可能把同一个单词保存为多个不同词义 ID，新系统不会自动选择或写入，必须等安全统一映射。
- 自动预检报告已经是可调用原型，**不代表正式站或预览站已经实际部署**；真机与运营台实际验证尚待进行。
- 没有修改正式 D1、用户学习、购买套餐、小说正文或原有发布流程。
- 需要 A2 建可查询的统一词典表/静态索引并验证许可证，再 A3 对接新索引并在预览站验收。
- 独立 PR #203 的小说修订仍并行存在；本次分支没有合并它。

## 后续顺序

A2 词典合法来源与完整统一主词条索引 → A3 运营台预检结果接入真实统一索引与异常确认 → A4 自动生成关联包（兼容新版旧版小说） → B1 旧卡 ID / 用户主词状态安全迁移 → B2 四级六级实际预览站验收与发布审批。
