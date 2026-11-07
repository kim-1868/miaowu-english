# 妙屋英语 V1.1 · 已恢复数据库的 23 本小说内容核验（离线、只读）

状态：**工具已准备，尚未获得正式 D1 的真实恢复库；没有执行线上书库审核或修改正式网站。** 网站 A 线，不需要 Agent V2。

## 目的

之前能直接复查的只有仓库 2 个上架包和用户另存的 2 个完整小说 JSON。历史运营标签里记录 23 本书，但书名/标签列表不能替代真实数据库的章节正文、词卡和上下文。

新文件：`scripts/v11-p5-restored-library-audit.mjs`。它只打开**用户自己在受控设备上恢复的 SQLite 数据库文件**，只读分析：

- 真实恢复文件里的已出版书目，与仓库 `published-book-story-tags-v38.json` 历史 23 本书目 ID 的重合、缺失、额外新增数；不会把历史列表当成当前实时生产库。
- 每本已出版书的章节数量、已经发布时间、未发布章节、免费试读章节、正文实际英文标注数量与数据库 `chapter_words` 的位置索引数量。
- 检查 JSON 正文里是否存在无对应单词实体的 `wordId`，是否有漏建 `chapter_words` 索引，是否存在索引位置与正文不一致、空白真实语境、损坏章节 JSON。
- 按已发布书内出现的词卡检查英音、美音、英/中文例句是否缺失；识别多词性卡。
- 复用 `buildSenseShadow` 对完整实际词库和章节上下文生成当前快照 SHA-256（用于日后人工审核清单绑定）；找出跨书不同 `wordId`、文本候选同义的组，但**一律不能自动合并**。
- 不读取、输出或上传任何用户、密码、订单、兑换码、复习计划或会话数据。默认终端输出只有匿名总计和指纹，**绝不打印书名和小说原句**。

## 用户掌握恢复数据库后的执行方法

先在获授权的私有受控目录恢复完整 SQL 到 SQLite；不要把生产 SQL、真实账号或小说正文上传 GitHub Actions、对话窗口或外部网盘。

在项目根目录执行：

    node --experimental-sqlite scripts/v11-p5-restored-library-audit.mjs --local-sqlite /ABSOLUTE/PRIVATE/rehearsal.sqlite

如需将真实章节语境交给人工逐义审校，使用**绝对路径且位于 Git 仓库之外**的本地文件：

    node --experimental-sqlite scripts/v11-p5-restored-library-audit.mjs --local-sqlite /ABSOLUTE/PRIVATE/rehearsal.sqlite --private-review-queue /ABSOLUTE/PRIVATE/owner-review.json

工具以只读方式打开 SQLite，连接会锁为 `query_only`。私有清单新建时权限为 0600、不会覆盖已有文件。清单包含小说真实上下文及按书分列的质量问题，**不得提交仓库**。它只为人工确认，不会带出订单数据，也不含已经批准的义项映射。

如需将历史 23 本书目严格作为对账门禁：

    node --experimental-sqlite scripts/v11-p5-restored-library-audit.mjs --local-sqlite /ABSOLUTE/PRIVATE/rehearsal.sqlite --require-historic-coverage

当真实库书目与历史快照不一致时，该命令会失败；**不应未经核对就自动把历史快照的缺失书补回数据库**。由于书库可能正常新增/下架，应人工比较差异原因，而不是用 23 强行限制当前真实书数。

## 自动化测试与验收边界

`tests/v11-p5-restored-library-audit.test.mjs` 只使用虚构小说、虚构词卡及本地合成账户。覆盖上下文 SHA-256、跨书同义候选/不同词性、不公开正文、章节与词卡位置漏索引、书目差异、只读数据库、私有文件0600、不覆盖旧审核文件。

**安全提示：GitHub CI 只运行虚构数据；永远不要把正式备份加入 Actions。**

## 未完成的发布硬门禁

1. 尚无经授权从**真实正式 D1**生成、验证可恢复的私有完整快照，不能宣称 23 本已核验。
2. 小说词义/音标的真实语境人工审核及用户历史学习冲突，仍需对实际数据执行，只能从候选队列逐项确认。
3. 真机 Safari/Android、运营后台人工发码/退款/找回等实用流程和现有用户权限仍需非破坏性验收。
4. V1.1 的正式发布需要站长针对冻结 SHA 单独明确批准；「继续推进」只授权安全开发，不授权生产 D1 变更。
