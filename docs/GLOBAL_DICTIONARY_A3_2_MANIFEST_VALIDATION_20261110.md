# 妙屋英语 · A3.2 版本指纹与词典绑定候选保存（2026-11-10）

关联 [Issue #208](https://github.com/kim-1868/miaowu-english/issues/208) / Draft PR #206。

## 本阶段已完成且经 GitHub CI 验证的代码

1. `db/014_global_dictionary_bindings.sql`：独立、不可变的候选关联 manifest 表。仅保存书籍 ID、类别、精确小说包 SHA256、绑定清单 SHA256、章节/段落/segment 的词卡关联 JSON、操作员身份与请求 ID；默认 `candidate`，**不写入** `books/chapters/words/chapter_words/user_words/review_events/entitlements`。
2. `src/ops-global-binding-manifests.js`：
   - `POST /api/ops/import/bindings/preview`：仅预览环境 Publisher 鉴权，严格复用 `validatePackage` 检验现有版小说 JSON，再通过 A3.1 主词典解析/语境选择计算精确 `package_sha256`、`binding_sha256` 和未解决异常；
   - `POST /api/ops/import/bindings/confirm`：仅预览站 Publisher + 独立 `GLOBAL_DICTIONARY_BINDING_SAVE_ENABLED=true` + `GLOBAL_DICTIONARY_LOOKUP_ENABLED=true` 才可调用。必须重新实时预检、显式 `confirmSave:true`、两枚指纹一致、所有目标词无审核阻碍、绑定唯一、审核来源合法，否则拒绝。
   - `requestId` 防重复；同一请求相同指纹幂等返回，改内容则 409；检查书籍 ID 在现有 `books` 表不存在，**不允许绕过旧书 `BOOK_ALREADY_EXISTS_USE_VERSIONED_REVISION`**。
   - 保存只是**不可变的候选记录**，不会调用正式导入/发布接口。
3. 现有 OPS 上传页面（仅预览站）：有「确认保存词典关联候选（不发布）」按钮；只有完整审核且保存开关打开后可操作。需用户点击显式确认，且后台重新核验指纹。变化后须重新预检；预览完成但未保存的记录仅存于浏览器内存。
4. `tests/v12-global-dictionary-manifest.test.mjs` 六类 SQLite/权限测试：稳定指纹与无写入预检、独立 sidecar 与幂等写入、错误指纹/伪造确认/请求冲突 409、旧小说禁止绕过版本修订、未审核词卡阻止保存、预览站角色鉴权。与原全站 CI 一起执行。

## 阶段验收

截至代码 SHA `7fb0e1e5b341934f7575f5a54158ad810335e550`，GitHub Actions S1 `42680893775` 为 **636 tests / 635 pass / 0 fail / 1 skipped**；生产构建 dry-run `42680894135` 通过（**无实际部署**）。

## 未完成和部署边界

- 这不等于小说自动上架或系统已有主词典线上可用；需要在隔离 staging D1 对新增 013、014 两张迁移进行备份、基线核验，再授权执行。
- 全量上游 ECDICT 数据取得、来源音频和例句许可证审核，词典实际导入 D1：**未完成**。默认源仍 `enabled=0` 且所有词卡 `teaching_ready=0`。
- OPS 在真实预览站运行、六级小说导入并一次匹配、保存候选、生成上架包、旧学习状态无损迁移与回滚：**未完成**。
- 正式站和预览站目前均**没有**部署此功能；只在 Draft PR，禁止直接对生产执行 D1 或小说替换。
- A3.2 现在只是经过独立验证的候选清单功能，最终要在 A4 正式版本化稿件发布时验证保存清单与原始包仍一致，且重新核验词卡审核/版权状态，不能只信任历史 manifest。

## 下一步

先完成全量 ECDICT 词头/词形索引与独立预览数据实际导入；再建设 A4 安全关联包生成和最新指纹复核；最后开展 B1 一词一卡学习身份迁移模拟、实际预览站账号验收。
