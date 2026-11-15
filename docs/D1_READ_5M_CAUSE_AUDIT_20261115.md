# 妙屋英语 D1 读取行数专项审计（2026-11-15，源码阶段）

> **当前状态：静态源码检查 + 本地合成 SQLite 验证。尚未取得生产 Cloudflare Query Insights，因此不得宣称定位到本次 500 万行的真实第一责任 SQL。**
>
> 本分支不部署、不执行生产 D1 SQL、不变更数据库索引；将候选优化先放在 PR 审核。
>
> 对照分支：`feature/v11-smart-vocab-preflight-20261109`（该分支并非已验证的生产部署 SHA；必须以生产部署元数据为准）。

## Cloudflare 实测补充：用户 2026-11-15 提供的 Query Insights 截图

- `Rows read` 图显示所选范围累计 **12.64M**（不是固定自然日，亦不能等同当前剩余额度）。
- 查询表显示 **85 条 SQL 模式**，当前截图第 1 页（10 条）。注意表头 `% of runtime` 的降序箭头：**当前是按运行耗时占比排序，非按 Rows read 排序**，因此后面 75 条中可能有更耗行的查询。
- 截图第 1 条：`SELECT DISTINCT w.headword,b...`，执行 **8** 次，总 `Rows read=6.63M`，平均约 **828,750 行/次**，`Rows read/returned=1.12k`。
- 第 2 条：`SELECT c.slug,b.id AS book_i...`，执行 **1** 次，读取 **1.33M**。
- 第 3 条：`SELECT c.slug,b.id AS book_i...`，执行 **1** 次，读取 **1.31M**。
- 这三条可见 SQL 合计 **9.27M，占 12.64M 约 73.3%**，按截图取整估算，并非所有 SQL 的最终排名。
- 这三个 SQL 前缀都**不同于本审计开发分支中** `/api/books`、`/api/me/bookshelf`、`/api/me/flashcards`、`/api/me/smart-vocab` 的主列表 SELECT 前缀。高度怀疑有人为审核/统计/分析型 SQL，但 **未展开 SQL，无法定位来源或确认是不是 production deploy 使用的版本**。
- 需要点击 **Rows read** 列按**降序**重新排序，并展开前 3 条 SQL 复制**完整 SQL**（先清理字面量、不要贴账号/用户数据）。之后用 SQL 中的表/字段和 GitHub Actions 运行时间确认是否为人工/任务脚本，不要因为代码猜测直接改生产索引。
- GitHub 2026-11-14 的人工运行记录确有 production 只读 P0 任务，但已检查的三条工作流运行分别是 CET4-02 词卡读取、无需 D1 的工件转换与待审批工件转换；**不能据此认定它们对应截图最耗行的 SQL**。

## 2026-11-15 10:41:31 证据升级：第一热点 SQL 完整文本

Cloudflare Queries 中最耗时且读取 **6.63M** 行（8 次）的 SQL 已展开，核心逻辑为：

```sql
SELECT DISTINCT w.headword, b.id = ? AS is_replaced
FROM books b JOIN categories c ON c.id=b.category_id
JOIN chapters ch ON ch.book_id=b.id
JOIN chapter_words cw ON cw.chapter_id=ch.id
JOIN words w ON w.id=cw.word_id
JOIN json_each(
  CASE WHEN json_valid(ch.content_json) THEN ch.content_json ELSE '{}' END,
  '$.paragraphs'
) p
JOIN json_each(p.value, '$.segments') s
WHERE b.category_id = ?
 AND c.is_visible=1 AND b.status='published'
 AND ch.published_at IS NOT NULL AND ch.published_at<=CURRENT_TIMESTAMP
 AND cw.context_anchor='p'||p.key||':s'||s.key
 AND json_extract(s.value, '$.wordId')=w.id
 AND trim(coalesce(w.meaning_zh,''))<>''
 AND trim(coalesce(w.part_of_speech,''))<>'';
```

**结论：这是逐章词卡锚点完整性/当前书籍替换状态的审核型查询，不是个人快速刷词或常规分类书架的 SQL。** 两次嵌套 `json_each` 与 `chapter_words` 关联，会重复展开大量正文片段；即使 `DISTINCT` 最后返回少量词，读行计数已经累积。具体调用源（Cloudflare Console 人工执行、运营台或外部脚本）尚未由 SQL 文本证明；在当前检查的相关核心 Worker 文件和生产只读 SQL 文件中未找到 `is_replaced` 原查询。需要审查 11 月 14 日 18:30 前后的调用记录。

### 审核用优化候选，**未执行到正式 D1**

- `sql/d1_perf_anchor_validation_review_only.sql`：利用 `cw.context_anchor=pN:sM` 定位 JSON 中**一个**段落片段，再按 `.wordId` 核验；避免为每条锚点迭代所有 `paragraphs × segments`。
- `tests/d1-anchor-validation-review.test.mjs`：合成 SQLite 对照原 SQL 的 `DISTINCT`、替换书籍标记、发布筛选、缺失词性、错位锚点、无效 JSON、未发布章节、隐藏分类等行为。
- 在 **本地合成 SQLite 3×3 章节、约 3600 个锚点**的数据中，原 SQL 耗时约 623ms，候选 SQL 耗时约 14ms，结果集合一致；这只是一次合成样本运行，**绝不是生产 D1 的实时 rowsRead 或已证实的降本比例**。
- 优化候选不用于阅读接口，未经审查不在生产中执行。后续若定位到触发这条 SQL 的实际任务，应优先禁用高频实时核验，改为导入/版本修订时离线验证，仅在审核必要时手动查询，并在 staging 上对照。

特别注意：本 PR 之前提交的书架进度汇总优化不是截图中 **6.63M rows read** 的根因修复，不能据此声称 500 万行问题已解决。还需展开另两条各读取 **1.33M/1.31M** 的 `SELECT c.slug,b.id AS book_i...` 完整 SQL。

## 一、明确事实

Cloudflare D1 以 `rowsRead` 计费/免费配额，而非 API 请求数。单次 SQL 的 `rowsRead`、执行次数 `numberOfTimesRun` 以及 `totalRowsRead` 可从 Cloudflare `d1QueriesAdaptiveGroups` 的 Query Insights 查询。查询历史保留约 31 天。统计图与 Query Insights 为云端观测结果，不应使用 `COUNT(*) FROM table` 去推断生产计费行数。

必须分别统计 **account-wide** 与 `miaowu-english-prod`，以分辨 P0 测试库/导入流水线是否也消耗同一个账户的每日额度。

## 二、按代码发现的热点，按调查优先级排序（不是已证实的真实消耗排名）

| 优先级 | 入口与文件 | 观察到的实现 | 性能风险与调查 |
| --- | --- | --- | --- |
| P0 | `GET /api/me/flashcards` — `src/reading-library.js:232+` | `LIMIT 8000`；在 SQL 查询后用 JS 去重、分页，结果包含词卡大字段；附带 `EXISTS` 权益子查询 | 用户每开始一轮刷词，都可能重扫大量词汇。检查其 `totalRowsRead` 和 `avgRowsRead`；改成**数据库内分页/归一词义身份**必须保留跨书去重，不允许简单将 LIMIT 改成 20 |
| P0 | `GET /api/me/smart-vocab` — `src/smart-vocab-api.js:116+` | 单次读 `LIMIT 15000` 完整词卡；`catalogReady` 每次 `COUNT(DISTINCT LOWER(TRIM(headword)))`，还读全部个人学习记录 | 如生产开关启用，可能占大头。先核实该路由是否启用及真实 Query Insights；不得移除词卡审核门禁来降成本 |
| P0 | `GET /api/me/wordbook` — `src/reading-library.js:103+` | 每翻一页都按 400 条从头分批扫完整用户生词，JS 去重后再截 12 张 | 页码变大并不会减少数据库读取；需设计可索引的稳定词义 ID、计数和游标翻页 |
| P1 | `GET /api/me/words` — `src/reading-library.js:74+` | 读最多 4000 行，附带每词关联 `chapter_words` 语境句的标量子查询；到期统计再次查询所有符合条件的用户词义 | 查询成本随收藏数上涨；用数据库侧汇总、有限列表、批量取句或缓存不可变字段替代 |
| P1 | `GET /api/me/bookshelf` — `src/my-bookshelf.js` | 原来对每本书执行 6 次重复的进度相关统计/查最新章节，另有 EXISTS | 本 PR 将用户进度汇总一次，保留相同返回字段、书签/最近阅读分离、权限边界 |
| P1 | `GET /api/chapters/:id/words` — `src/worker.js:427+` | 为验证权限调用 `chapterAccess`，读取并 JSON.parse 整章 `content_json`，然后再读词卡和学习状态 | **正文重复读取/解析是确定事实**。本 PR 将词卡权限检查改为只查轻量章节元数据，不再读取/解析 `content_json`；此项主要优化传输/CPU，不等于已经证实节省大规模 `rowsRead` |
| P2 | `GET /api/books` — `src/worker.js:766+` | 按类查询，计数和结果分两次；每本有章节数相关查询；标签单独批量取回 | 当前书数较少时不应直接认定全表扫描，需配合 `EXPLAIN QUERY PLAN` 与 Query Insights 判断 |
| P2 | 词卡跨书共享 — `src/study-identity.js` | `LOWER(TRIM(w.headword))` 和章节关联，`annotateStudyWords` 对每 60 个词目进行一次数据库查询 | 查明已有 `ix_chapter_words_word` 是否确实已应用到生产；函数/表达式索引需要 `EXPLAIN` 后再加 |

其他重要事实：`db/004_editorial_content.sql` **已有** `ix_chapter_words_word ON chapter_words(word_id,chapter_id)`；`db/001_schema.sql` **已有** `ix_user_words_due`、`ix_chapters_book`。勿重复建同类索引；但生产是否实际建成尚未确认。

## 三、真实消耗归因：只读、低干扰方式

Cloudflare 授权必须有 **Account Analytics Read**。在已登录 Wrangler、拥有该权限的本地终端执行（历史时间窗口可调整）：

```bash
# 先排查账户下多个 D1 数据库总量；确定生产 vs staging 占比
npx wrangler d1 insights --sort-by=reads --time-period=2d --limit=50 --json > d1-account-read-top.json

# 本次 500 万行问题：按累计读取行数排序
npx wrangler d1 insights miaowu-english-prod --sort-by=reads --time-period=2d --limit=40 --json > d1-prod-read-top.json

# 查“单条 SQL 不算重但重复执行很多次”的情况
npx wrangler d1 insights miaowu-english-prod --sort-by=count --time-period=2d --limit=40 --json > d1-prod-count-top.json
```

这些命令查询 Analytics API，**不发送新的 SELECT 到生产 D1**；不要复制 Cloudflare 令牌到聊天或 Git。SQL 文本可能包含应用字面量，传播前检查和脱敏。可仅提供排名 SQL 的安全片段、`totalRowsRead`、`avgRowsRead`、`numberOfTimesRun`、`queryEfficiency`、`databaseId`。聚合读取量相加可能因样本、Top-N 截断不同于计费面板总数。

如果 Cloudflare Dashboard 中执行诊断：进入 D1 SQL database → 选生产库 → Metrics，并使用 Query Insights 或 GraphQL Analytics API。**不要在免费额度耗尽时反复发起线上 `SELECT` / `EXPLAIN` 来试错**。

要核实真实全表扫描，对排名前 5 SQL 在**同结构脱敏测试库**运行 `EXPLAIN QUERY PLAN <SQL>`，检查 `SCAN` / `SEARCH ... USING INDEX`，并比较优化前后的 `rows_read`。不要依靠 SQL 是否含 `LIMIT` 直接下结论。

## 四、本 PR 已做与尚未做

- [x] 盘点四条指定链路和章节权限读取；对应源码及查询风险如上。
- [x] `my-bookshelf` 的 6 个重复用户进度相关子查询改为按用户一次汇总（保留书籍计数的单独标量查询）。用合成 SQLite 比较新旧结果，样例字段完全一致（两本书、跨用户、未发表章节）。
- [x] 新增 Node SQLite 回归测试（需 CI 实际执行验证）。
- [x] 词卡接口权限判定复用正文规则但只取章节元数据，不再先加载整章正文。
- [x] 核查浏览器端已有 `glossaryCache`（`public/app.js`，按用户与章节缓存成功结果）；待通过真实 Query Insights 后决定是否做请求进行中的去重、跨书统一词卡静态缓存。
- [ ] 获取生产过去 48h 的 Query Insights 的真实指标与时间窗。
- [ ] 确认 Cloudflare `rowsRead` Top 5，按累计读取量、单次平均读取量、执行次数归因。
- [ ] 确认线上索引是否和仓库迁移一致；在测试库 EXPLAIN/回归，才能讨论生产执行索引迁移。
- [ ] 后续针对排行榜高消耗 SQL 分批提交分页、缓存及索引补丁（严格分离用户学习状态与公共词卡缓存）。
- [ ] 完成预览测试、多用户隔离、词义去重、权限、性能前后对比，获得发布批准后再生产部署。

## 五、后续缓存设计底线

- 仅缓存**不可变、公共或已审核的词卡静态字段**；权限判定必须实时发生，不能把授权内容通过共享缓存泄漏给其他用户。
- 用户掌握状态、复习时间、收藏状态不使用公共共享缓存；单独查询并合并。
- 小说章节可以在当前客户端阅读期间复用缓存，但在版本变更时需失效，并且付费正文不能直接作为不带授权的公共缓存返回。
- 快刷每轮推荐 20 个不同义项，保留错词重现和独立“标记已掌握”；不得为省查询破坏语义规则。

## 六、校验口径

首要目标：找到`totalRowsRead`占比最大的 SQL，并通过索引/查询重写使其下降，之后才评估可能的用户数容量。新增索引会增加写入开销，必须先通过测试库和执行计划，再按正式发布流程部署。
