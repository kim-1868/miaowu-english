# 妙屋英语 V1.2：一词一卡第二阶段——预览环境登录/付费/审核绑定的真实服务端接口

**日期**：2026-11-11；**范围**：开发分支 Draft PR #206 下的增量代码与离线合成端到端测试，**不是 Cloudflare 部署，未执行任何真实 D1 迁移或发布操作**。

## 本轮增量

1. `src/global-dictionary-headword-api.js`：提供两个仅允许 `APP_ENV=staging` 且开启 `GLOBAL_DICTIONARY_HEADWORD_SRS_ENABLED=true` 的路径：
   - `GET /api/me/dictionary/headwords/:entryId?chapterId=...&anchor=...` 返回**单张已批准主词卡**、该账号当前复习状态与修订版本，不写任何用户数据。
   - `POST /api/me/dictionary/headwords/:entryId/feedback`，body 包含 `{chapterId,anchor,kind,eventId,expectedRevision}`，必须额外启用 `GLOBAL_DICTIONARY_HEADWORD_SRS_WRITE_ENABLED=true` 才可提交。`kind` 允许 `seen/remembered/forgotten/mark_mastered/unmark_mastered`。
   - 服务端使用 **Worker 已认证的 user.id**，不接收客户端 userId；POST 检查同源 Origin；必需合法 UUID 事件 ID 和乐观锁 `expectedRevision`；**没有 GET 即写入**。
   - 只允许来自**当前已发布章节**的精确书籍、章节、词卡 `context_anchor`；非免费预览章节须存在未撤销的合法购买权益（包括关联兑换码未作废），且分类公开。仅允许 `global_dictionary_sources` 许可已核准、来源启用、`global_dictionary_entries` 教学启用、审核课程存在、`global_dictionary_senses` 具体上下文义项为 `approved=1,active=1`。任何一项不满足均拒绝，**词库里存在同样英文拼写绝不算学习许可**。
   - 核心展示可同时包含同一主卡的**多条已批准义项**，按照出版社已审中文释义、词性及英中例句严格对照；只显示已审义项，不泄露候选释义；依据章节锚点突出对应的内部 `sense_id`，但统一用户 `user_id+entry_id` 复习身份。
2. `src/worker.js`：在现有 `currentUser(req,env.DB)` 会话验签之后和已有 `checkOrigin` 之前置安全路线之后，引入上述 handler，不替代原 V1 词卡/阅读/学习端点；**production 永远返回 404，即使有人误开 flag**。
3. `db/019_global_dictionary_headword_study.sql`：原有 add-only 草案保留，事件流水增加 `source_chapter_id` 与 `source_context_anchor`，记录哪些书籍的哪一个具体词锚点触发反馈。**未纳入现有013–018远程迁移工作流，也不能直接在生产 D1 执行**。
4. **并发与安全**：`D1.batch` 同事务执行 `(user,entry) revision CAS 更新 + 审计事件写入`；唯一 `(user,entry,revision)` 防两个设备同修订版本互相覆盖；`event_id` 全局唯一，重复请求幂等，复用同事件到另一锚点/词/账户拒绝。冲突为 409，缺 019 表为 503，权限无效为 403。服务端时间决定艾宾浩斯到期，不接受客户端修改日期。
5. `tests/v12-global-dictionary-headword-api.test.mjs`：**19 项合成 SQLite/Worker Request 仿真测试**验证跨 CET4/CET6 两书只留一条 `record` SRS、免费/付费权限与兑换码撤销、词义审核与来源授权、未发布书籍、上下文锚点、GET 不写库、连续认识/遗忘/独立已掌握、用户隔离、版本冲突、同一事件幂等、防 CSRF、默认禁用、019 加法式迁移。GitHub Actions 还直接读取仓库完整 001/013–019 DDL 完成结构合并验证。

## 不能误认为已经上线

- 数据全是**合成 fixtures**；即使看到「publisher」或「已审」也是仅在内存测试库中造的测试记录，**真实 owner 7391 词头的正式审核结果仍为0**，没有“真实词卡已对普通用户开放”的结论。
- 真实预览 Worker 的新服务端接口仍缺少独立 staging 准入验收、013–019 迁移前加密备份/回滚、授权审稿员签核真实素材；**当前两开关均不应开启**。
- 真正阅读 UI 的词卡点击、朗读、在不同小说主动点击认识、用户词本和快速刷词接口还没有接上本次 V1.2 endpoint。已有阅读器功能保留，后续以增量方式接入，避免破坏旧版。
- 旧 2,206 个 `words.id` 和 `user_words`/`review_events` 数据仍保持原样；目前不允许把所有旧 `mastered` 状态自动转换成主词头 `mastered`。迁移必须另外验证与记录保守规则。

## 下一迭代的正确顺序

1. 检查现有 `public/live-reader.js`/`public/chapter-words.js` 的词卡事件及朗读/暂停，逐步将**已经批准的章节精确锚点**接到 V1.2 GET/POST，旧书不受影响；带版本号更新 UI。
2. 在独立预览数据库可恢复备份和授权后，执行含 019 的增量迁移；首次只开启 READ flag，证实真实身份/权益/词义安全，再单独批准 WRITE flag。
3. 配合已经整理好的 7,391 目标词头、655 例句候选进行真人审校/商业许可和 Publisher 签核；选择审核通过的真实词先用四级/六级/考研书做跨书 E2E，之后补齐。

**本文件只是安全开发交接。生产部署仍由 Draft PR #206 的完整验收与站长单独发布批准控制。**