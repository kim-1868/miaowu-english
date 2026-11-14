# 妙屋英语 V1.2 第三阶段 · 已审核主词卡接入小说阅读器（2026-11-11）

> **仅代码与本地测试；未部署 Cloudflare 预览或生产，未运行远程 D1 013–019，真实 Publisher 批准义项仍为 0。** 本阶段接续 PR #216、#217，只允许合并至统一词典 Draft #206 的开发分支。

## 本轮真实交付

- 新增 `src/global-dictionary-reader-anchors.js`，GET 只读、按登录用户和已授权章节返回 `pX:sY → gdict_entry_id`。严格 join 原章节目标 `chapter_words`、已审核 `global_dictionary_book_bindings` + `global_dictionary_book_sense_bindings`、approved/active sense、已审核主卡、版权来源，以及已发布章节和未作废权益。不存在有效完整链接时不返回可点击锚点。
- `src/global-dictionary-headword-api.js` 新增 `GET /api/me/dictionary/chapters/{id}/anchors`，与现有服务端主词卡 GET/反馈 POST 共用 `APP_ENV=staging` + 显式读开关，用户身份仅取现有 Worker Cookie session，生产返回404。
- `src/worker.js` 的已授权章节 GET 仅当 staging+读开关有效时返回 `headwordReaderReady=true`；这样正式站不会因为新脚本而产生多余 404 请求。
- `public/app.js` 为原已有 wordId 的英文目标词提供稳定 `data-dictionary-anchor="pN:sM"`，读取服务器批准的锚点映射，然后将有已审卡的词交给新桥；未审、加载错误、无授权时仍沿用原词卡与朗读/藏书票。旧的段落朗读点击词卡自动暂停、手动恢复；点击非操作控件区域关闭词卡；切章节重置缓存并丢弃过期请求。
- `public/headword-reader-bridge.js` 复用原读者移动端底部弹层/桌面就地弹层，在**一张可见主卡**下展示经审核的多词性词义、例句、合法英美音标与适用搭配；只在服务端签核返回后展示。支持读音、例句朗读、「认识」「再记一次」「独立标记已掌握」，所有反馈用前一期 `eventId+expectedRevision` CAS 接口持久化，不从客户端传入用户ID。
- 保存藏书票仍使用原旧云端收藏 API；**尚未迁移为 user+entry 的统一收藏，快速刷词/剧情回声也暂未接新SRS**。这两处是下阶段验收项，不应谎称本轮完成。

## 已验证

- 本地合成 SQLite 源审核/付费授权/已作废兑换码测试 5/5。
- 新桥 Node 模拟行为测试 5/5，校验真实请求路由、确认「认识」提交精确章节锚点与统一词头、过期响应阻断、HTML安全编码。
- Chromium 真浏览器 1280px 桌面和 390px 手机两个视口，展示卡片→点击认识→POST→关闭流程均通过，0 JS 异常。此处语义/权益为**合成批准数据**，不等于 Cloudflare staging 真实数据。
- 新增原 app/worker/index 兼容静态测试；GitHub 全站 S1 和专项 QA 结果以 Actions 为准，不用本地测试冒称通过。

## 没有完成及下一步

1. 已备份且获授权的 staging 才可执行增量 019 迁移并开启读开关。先核实完整来源和审核人身份，批准一张真实 `record` n./v. 卡及两本小说的精确锚点，验付费/试读权限、点击、朗读。
2. 再单独开写开关并验 SRS 跨书/跨设备、同步冲突/幂等/撤销权益、回滚；旧 `user_words`、旧 2,206 word ID、收藏、订单、章节位置必须保留。
3. 下一轮才扩展到未标记英语 token 的自动发现候选→编辑确认→生成真实可点击锚点；对所有英语字符未经审核自动发布是不可接受的。
4. 完成统一词头收藏、快速刷词与剧情回声共享 SRS，再批准分批商业上线。