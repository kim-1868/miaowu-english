# B1.3 · 稳定义项身份 + 历史卡审稿工具（2026-11-10）

**重要：本变更目前仅开发分支代码，未部署 Cloudflare 或执行 D1 迁移。**

单一英文词头的词典式主卡可以包含多个义项，但跨书收藏、已掌握、间隔复习与剧情回声成绩必须按稳定 sense_id 区分。既有 global_dictionary_legacy_links 只有 entry_id，不能安全区分 record 名词“记录”与动词“录制”。

新 018 迁移添加以下三张隔离表：global_dictionary_senses（不受释义编辑或显示顺序影响的 stable sense_id）、global_dictionary_legacy_sense_links（带原旧卡 SHA256 和编辑审批记录的独立旧义项映射）、global_dictionary_book_sense_bindings（仅 draft 书籍中对应实际文字锚点的义项）。

数据库触发器阻止已审身份被改作另一词义、未经审核的旧卡链接、旧链接重指向、已发布小说上直接添加学习义项。并未修改 words/chapter_words/user_words/review_events/entitlements。真实 staging D1 必须备份后依序迁移 013–018、验证回滚，再开始使用。

### 让 2206 张老卡快速成为审稿候选
之前存储在本人私人 Library 的 miaowu-english-prod-2026-11-06.p5-content-review.json 已知包含 2206 个旧词卡 ID、1150 个严格文本义项、384 组同文本重复、1056 张额外重复卡。新脚本在私有离线环境按同词头/词性/中文释义分组，输出旧 ID、书籍、音标变体、审查优先级，**不复制商业小说语境到公共仓库**。

运行：node scripts/build-private-historical-sense-worklist.mjs --snapshot /private/历史词卡快照.json --out /private/义项审稿清单.json

快照中的文字完全相同也不代表已经签核，正式义项 ID 必须通过独立人工审核后才能进入 global_dictionary_senses。之后才能进行已有四级 23 本、六级 5 本的当前在线内容版本对比和新小说无 words[] 上传。

下一个上线阻断点：真实预览 D1 备份/迁移、Approved sense ID 的阅读器与复习键、真实 23+5 书章节匹配及 409 修订、权限与多端验收。
