# 妙屋英语 V1.1 × 小说 Agent V2 · 网站端只读导入预检

状态：网站端第一批开发；独立分支，不改变正式 Pages、Worker、D1，不自动上架。

## 为什么做

Agent V2 能生成「出版台导入包.json」，但是 Agent 自行模拟的 JSON 结构检查不能替代网站服务端真实的 `validatePackage`。此前小说因「只有空格的独立文本片段」被后台拒绝。这里直接调用网站运行时共用的校验函数，再调用已有的跨书词卡审计，不连接任何数据库，也不修改输入文件。

## 在完整 V1.1 网站开发分支执行

~~~bash
node scripts/v11-agent-v2-preflight.mjs "/path/to/出版台导入包.json"
node scripts/v11-agent-v2-preflight.mjs --strict "/path/to/book-a.json" "/path/to/book-b.json"
node --test tests/v11-agent-v2-preflight.test.mjs tests/v11-import-package-audit.test.mjs
~~~

使用前先解压 Agent V2 的 ZIP，从中选择 JSON 文件。此命令不读取 ZIP、不自动调用 Codex。

普通模式下 P0 错误导致非零退出码，P1 问题记录为人工审校警告；加 --strict 后，P0 和 P1 都会阻断。本工具输出 JSON，`importStructurePass` 只代表离线结构预检，并非正式网站已上架；`publicationApproved` 永远为 false。

## 实现检查

1. 网站真实结构：版本、book、章节、单词、wordId 引用、片段文本、限制长度、数量上限、章节序号。
2. 已确认零免费试读，按 cet4 / cet6 / postgrad / ielts 分类售卖。
3. 同批次 book.id 重复，跨书相同 wordId 携带不同教学义项。
4. 相同拼写、词性和中文释义使用多个 wordId 只作为人工审校线索，不自动合并。
5. 已复用 wordId 的 IPA/例句/搭配发生差异时提醒人工审核。网站旧入库路径对词卡使用 INSERT OR IGNORE，可能沿用旧数据。
6. 空搭配、词卡缺少教学字段、未引用单词、词形变化等沿用网站既有只读审计。

## 安全边界

- 不读取正式 D1，所以不能确认线上已经存在的书籍 ID 或词卡 ID，也不能代替真正的运营台 HTTP 上传测试。
- 不根据文字相似就合并同义项：同一拼写不同词性/义项仍需单独学习，已有读者已掌握、收藏、复习和阅读历史不可被覆盖。
- IPA、释义、搭配地道性、小说原创性、版权、真实等级词源均需审校，不因 P0 为零就自动允许销售。
- 网站分支基于完整 V42 产品代码，Agent V2 则在独立分支生成小说，**不可直接从不完整的默认 main 合并**。
- 新书先通过这个工具，再进入 staging 真实出版台、测试读者账号、付费墙与跨小说学习状态的人工验收。只有用户明确批准后才能部署正式 V1.1。
