# 妙屋英语 S3-A · 小说与词汇内容管理基础（2026-10-31）

## 当前完成的范围

已经在 GitHub 开发分支加入：
- `db/004_editorial_content.sql`：**只增不删**的 D1 迁移：导入包记录 `content_packages` 和单词-考试分类关系 `word_categories`，利用现有 `books`、`chapters`、`words`、`chapter_words`。
- `scripts/build-content-import.mjs`：将规范 JSON 小说/词库包严格校验后，生成 **私有目录** `private-output/` 下的 D1 导入 SQL。
- `content/examples/cet4-sample-draft.json`：仅供展示格式的两章原创短片段和两个英语单词，**不是正式商品**。
- `GET /api/chapters/:id/words`：与正文使用**同一套服务端鉴权**，防止未购买者通过词卡接口看到付费语境和例句。
- V0.3 云端阅读器支持结构化的 `paragraphs[].segments`；点击嵌入英文词可弹出音标、释义、故事语境、例句、搭配及发音。旧的测试章是普通段落字符串，照常可读。
- `/api/staging/diagnostics` 增加 `s3.editorialSchemaReady`，可以确认远程迁移是否完成。
- 自动化测试：导入文本中英文、SQL 字符转义、缺失词汇/重复章节拒绝、再次导入不会重复、草稿绝不自动发布、词卡接口付费权限检查。

**不能把以上理解为已经完成正式内容后台。** 目前没有图形化内容编辑界面、更新版本/回滚、批量正式发布和运营权限体系，这些将作为 S3-B 开发。

## 内容包结构

参考 `content/examples/cet4-sample-draft.json`：

- `version:1`。
- `book`：稳定 ID、`category`（cet4/cet6/postgrad/ielts）、书名、简介、可选封面 Key。
- `words`：稳定 ID、headword、英美音标、词性、中文释义、英文例句和中文翻译、常用搭配。
- `chapters`：稳定 ID、章节序号、标题、`preview` 免费试看标志、段落数组。
- 每个段落的 `segments` 可交替放 `{"text":"普通文字"}` 与 `{"wordId":"cet4-hesitate","surface":"hesitate","gloss":"犹豫"}`。这决定阅读器里的单词标注以及藏书票对应的上下文。
- 同一章节内多次出现同一单词会分配不同锚点，例如 `p0:s1`、`p1:s3`；词库 ID 可跨章节复用。

### 为什么这样设计

1. AI 可以产出故事草稿和带结构的词汇清单，但用户必须审核原创性、英语搭配、中文意义、出现密度及叙事节奏。
2. 文本本身与词汇注解绑定，而不是人工手动在几十章中逐一改网页 HTML。
3. `words`、`chapter_words` 和 `word_categories` 分开保存，未来可以计算已遇见多少词、复习与收藏，不依赖某一本书。
4. 付费正文在 D1 的 `content_json`，不上传到 `public/`。编辑稿和正式待售文本不要提交到公开 GitHub 仓库。

## 安全上线顺序

### A. **只在 D1 测试数据库创建附加表**（需要手动一次）

当前远程 D1 是 `miaowu-english-test`。**先备份数据库或使用 D1 Time Travel 可恢复的历史版本，且确认选中的就是测试数据库。**

用户以前曾在 D1 Console 手工创建了 S1 的基础表。为避免 Wrangler 把旧的 001–003 迁移当作未执行重新操作，**本阶段建议先只执行 `db/004_editorial_content.sql` 中的语句**，不运行全套远程 `migrations apply`。

操作路径：Cloudflare → Storage & databases → D1 → `miaowu-english-test` → Console → 复制 GitHub 里的 `db/004_editorial_content.sql` 全文 → Execute。

该迁移为 `CREATE TABLE IF NOT EXISTS` 和 `CREATE INDEX IF NOT EXISTS`，不会触碰已创建的用户、分类权益、激活码或已有阅读测试数据。它不会自动导入样章，也不会发布任何小说。

完成后，在同一浏览器打开（使用 reviewer 访问密码）：
`https://miaowu-english-staging.kim10086a.workers.dev/api/staging/diagnostics`

**期望新增字段：** `"s3":{"editorialSchemaReady":true,"missingColumnsByTable":{}}`。S1 的 `databaseSchemaReady` 应继续为 true。

注意：人工执行 SQL 不会自动登记 Wrangler 的 `d1_migrations` 历史。未来使用正式迁移工具前，需要先核对/同步旧的迁移记录；不要盲目对已有生产库运行 `migrations apply`。

### B. 生成与检查内容包（开发人员 / Agent 执行）

先用示例文件测试：

```bash
npm run check
npm test
npm run content:check
node scripts/build-content-import.mjs content/examples/cet4-sample-draft.json
```

脚本只写入本地 `private-output/content-sample-cet4-letter-<hash>.sql`（被 Git 忽略）。如果输入是未审核的正文，**不要把 SQL 或 JSON 上传到公共 GitHub**。

真正导入时，开发人员在数据库备份后使用：
```bash
npx wrangler d1 execute miaowu-english-test --remote --file=private-output/content-sample-cet4-letter-<hash>.sql
```
以上命令是使用本地私有文件的示意，实际文件名以生成结果为准，**仅在测试环境执行**。目前无必要让用户亲自运行。

### C. 目前的草稿与发布限制

- 生成的导入 SQL 只创建 `books.status='draft'` 和 `chapters.published_at=NULL`，所以 `/api/books` 不会显示新草稿，`/api/chapters/:id` 也不会返回正文。
- 同一导入文件重复执行只会忽略同 ID 条目，避免重复；**编辑已有内容不会自动覆盖原来章节**。版本修订与回滚将在 S3-B 加入正式工作流。
- 不能手工把真实付费故事复制到 `public/app.js` 来“解锁”——那会泄漏全部受限正文。
- 示例内容只作为研发测试。正式销售前还需要完成内容审核、发布审批、错词修改、版权核查、备份、运营授权及实机测试。

## S3-B 下一步

开发一套可在浏览器中填写书目、章节、词汇的**私有编辑后台**，支持上传和预览规范 JSON、标记问题、生成审核记录、发布/撤回控制；需要独立管理员权限，不能把共享的 reviewer 测试站密码当作编辑权限。之后再开发阅读进度和词卡复习跨设备同步。
