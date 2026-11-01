# S33 《雨夜档案》真实草稿导入验收：纯内存 D1 同结构预演

**执行环境：GitHub Actions 中 Node 内存 SQLite，仅运行真实建库源文件和真实12章导入SQL；不访问 Cloudflare，不读取或修改生产 D1，也不影响已激活账号。**

## 核验范围
- 使用 `scripts/check-production-fresh-schema.mjs` 同样的10个初始化源文件创建内存版完整 **22业务表** 的一致结构。
- `composeRainyNightSeasonDraft()` 生成的12章/188候选词/733个注释标记，通过 `generateSql()` 实际执行导入；这不同于仅依靠字符串检查。
- 验证 `books=1` 且 `status='draft'`、`chapters=12` 且12章 `published_at IS NULL`、`words=188`、`chapter_words=733`、`word_categories=188`、`content_packages=1`、只有第一章作为将来候选试读。
- 模拟公开已发布书架查询，断言看不到任何这部草稿。
- 检查账号、会话、恢复码、兑换码、权益、个人词库、答题事件、后台运营员仍全部为0；所有SQLite外键无悬挂。
- 同一导入SQL执行两遍，所有记录数不变；再模拟书籍及章节已发布后重新导入，原正文不得被改写且不能新增内容包。

运行：`node --experimental-sqlite --test tests/s33-rainy-night-offline-d1-import.test.mjs` 或 `npm test`。**这些操作不会触达任何 Cloudflare 数据库。**

## 仍未通过的真实发布环节
1. 188词美式IPA、英式多读音/缺失项、词性和真实CET4适用性核验；
2. 全733个中英混排语境逐条编辑检查，剧情回声题目与章节引用校验；
3. **只能在单独的旧测试 D1** 进行真实网络端到端验收：账号授权、读写、跨设备同步、私人草稿不可见、无权益403。不得直接把这份草稿导入生产并设置 published；
4. 账户恢复、支付、数字内容售后和发布者权限确认。
 
**仅在人工确认导入 SQL 文件完整且环境明确为 `miaowu-english-test` 时，才考虑远程测试导入。绝不重复运行已经初始化过的生产 D1 Bootstrap SQL。**