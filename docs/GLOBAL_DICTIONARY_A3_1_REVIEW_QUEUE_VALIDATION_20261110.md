# 妙屋英语 · 统一词典 A3.1「按小说位置审核词卡绑定」验收记录（2026-11-10）

关联 Issue [#208](https://github.com/kim-1868/miaowu-english/issues/208) / Draft PR [#206](https://github.com/kim-1868/miaowu-english/pull/206)。

## A3.1 已完成并经 CI 验收

1. 新增纯只读 `src/global-dictionary-bindings.js`：
   - 以 `chapter_number,paragraph_index,segment_index` 定位每个小说学习目标词实际出现的位置，不再对整本书的同表层拼写一刀切；允许同形词 `saw` 在不同位置被判为不同词头；
   - 读取 A2 统一词典候选及来源审查状态，分成「审核已通过可绑定」与「缺词/待教学审查/有歧义/词形未核准」；
   - 回报章节、段落、上下文和旧 `wordId`，输出候选 `legacy_word_id -> dictionary_entry_id` 仅供人工预检；
   - 检测同一个旧 `wordId` 关联不同主词头时拒绝自动确认，防止跨小说进度错误合并；
   - 人工选择只接受已批准词典词头及已审核词形，不能凭点击按钮给未审核词卡「放行」。
2. `POST /api/ops/import/preflight` 已可传入 `{package,decisions:[...]}`，仅在预览环境受独立 Publisher 鉴权；按段落位置生成新的**只读**预览绑定方案。不保存任何选择，不自动修改章节 JSON、历史词卡或用户学习记录。
3. 现有运营台上传模块增加了「按句子上下文复核」候选选择区域；仅当候选源及教学状态满足要求时显示「仅预览确认」，提交后刷新本次只读预检报告。正式站隐藏，关闭/重新选择小说后内存选择会清除。
4. 专项自动化覆盖：审校过的词形候选、`record` 主词头复用、`saw` 上下文不同对应、未审禁止冒充、旧词卡身份冲突阻断、重复决策/不存在的决策拒绝、SQLite D1 模拟零写入。

## CI 证据

- 测试 SHA `a830cba4c553589a892e6645e93e68288578d349`：GitHub Actions S1 checks run `42679539433` **630测试 / 629通过 / 0失败 / 1跳过**。
- 同 SHA 的生产 dry-run `42679540007` 通过：**纯构建验证，并未部署 Cloudflare**。
- 最新系统原有小说运营台 `/api/ops/import` 没有被替换或改变，`BOOK_ALREADY_EXISTS_USE_VERSIONED_REVISION` 旧修订保护仍然生效。

## 明确未完成

- A2 真正从完整上游 ECDICT 下载、核对来源版权和装载隔离预览 D1：未完成。
- A3.2 已审核关联结果永久存储的 sidecar、版本 fingerprint、运营台「确认并保存关联」：未完成；目前只是**只读模拟**。
- B1 真正的「一词一卡」统一前端呈现与用户+主词头一份云端复习计划：未完成。
- 预览站实际 URL 并未部署或真机验收。Production / D1 没有执行迁移或数据写入。

## 下一阶段

先 A2 的完整词典导入和来源审核后，做 A3.2 内容 fingerprint、确认关联 sidecar 与回滚事务；再推进 B1 旧学习身份迁移。大规模词库不得直接塞进现有商业词卡表，避免数万行数据冲击运营台与生产 D1。
