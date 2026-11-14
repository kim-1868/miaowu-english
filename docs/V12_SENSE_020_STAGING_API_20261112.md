# V1.2 · 020 义项级学习 API 服务端接线（2026-11-12）

真实 TEST D1 020 迁移已成功：GitHub Actions #43058692057。新增 2 张义项级表+2索引+3个许可审核触发器，0 用户学习行，正式站无变动。

新增 `src/global-dictionary-sense-study-api.js` 和 Worker 的独立路由：

- GET /api/me/dictionary/senses/{sense_id}?chapterId=...&anchor=...
- POST /api/me/dictionary/senses/{sense_id}/feedback
- 必须是 APP_ENV=staging，且分别手工配置 GLOBAL_DICTIONARY_SENSE_SRS_ENABLED=true（读）和 GLOBAL_DICTIONARY_SENSE_SRS_WRITE_ENABLED=true（写）；这两个标志 **未在任何部署配置中开启**。
- session 用户ID由 worker 的现有 cookie 身份校验提供，拒绝请求体 user_id；仅可访问正式发布的章节或有权限的付费章节；作废激活码立即阻断权限。
- 精确匹配已签核且 active 的上下文 sense_id 及书/章/锚点。词典来源需要被许可和启用、主词头教学已核准、双语例句与已审核 lesson 完全一致；禁用词义不读也不写。
- POST 同源 Origin 必须匹配，event UUID 去重、revision 乐观锁，D1 batch 中原子更新 `user_dictionary_sense_study` 和审计事件 `user_dictionary_sense_review_events`。不同词义不同记录，同义项在不同书中相同学习进度。间隔 1/3/7/14/30 天，已有掌握语义独立。
- GET 只读，生产环境404；保留旧 reader/headword 端点和旧 user_words 记录，尚未迁移任何历史用户学习进度。
- **代码就绪不代表线上可用**。必须先由编辑批准真实词卡/义项、将书籍上下文锚点真实绑定、在预览站单独批准开启 flag 并验证写入，最后才能考虑上线。不要直接开启旧 headword-level SRS 功能。

合成 SQLite QA 覆盖跨书同义项、多义项隔离、重复事件、防篡改、过期revision、权限回收、已下架或未许可词义、默认关停和生产拒绝。
