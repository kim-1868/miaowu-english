# S60｜全文混排词性风险审稿提示（安全规则，不是自动审稿批准）

日期：2026-11-02。

为了避免S59反复手工发现“`contact` 被当名词”“`original` 被当名词”后，后续新增小说再次出现同类错误，给已有的733处原文审核工作表加入**4类启发式风险提示**（`src/editorial-code-switch-lint.js`，只读、无网络）：

1. `CODE_SWITCH_VERB_AFTER_NOMINAL_CLASSIFIER`：动词紧接“最早的一次 / 每一次 / 一份”等疑似名词位置，需要检查句法。
2. `CODE_SWITCH_VERB_IN_NOUN_MODIFIER_SLOT`：教学词卡声明为动词，但正文直接使用“contact 方式 / record 文件”等可能属于名词修饰语的结构。
3. `CODE_SWITCH_ADJECTIVE_HEAD_NOUN_MISSING`：仅有形容词（如 `original`）却用于“核对/保存/移交”后的受事名词位置，没有中心词。
4. `CODE_SWITCH_ADJECTIVE_LINKER_REVIEW`：“一条 missing 的记录”一类形容词+中文“的”组合可能不自然，应审查但不直接判错。

工具在 `scripts/review-rainy-night-word-contexts.mjs` 中逐处标记，加入既有私有CSV的 `reviewFlags` 列与 `overview.flags` 汇总。自动审查只有**风险提示**，误报可能正常：混排形式高度依赖上下文、读者水平及作者风格。**零风险提示 ≠ 词汇通过人工审核。**

### 本次验收门槛

- 检查四类已知旧错误能被规则找出，而S59改写后的动词+宾语、形容词+中心词不会被误报；
- 12章、188词、733标注不变；所有733处的 `UNREVIEWED` 不会自动变成 APPROVED；
- 《雨夜档案》最终发布门禁仍 `BLOCKED`。结果仅在本地编辑任务里使用，不在公开网站显示小说全文，也不调用 Cloudflare D1。

使用：`node scripts/review-rainy-night-word-contexts.mjs --summary`；需要逐处查看时在本地受控环境下使用 `--write-private`，勿上传私有CSV/原文到公开站点。
