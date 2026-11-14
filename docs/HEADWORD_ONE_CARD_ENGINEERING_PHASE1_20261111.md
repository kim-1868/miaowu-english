# 妙屋英语 V1.2 · 一词一卡第一阶段实际开发与验收（2026-11-11）

**状态：仅开发分支的纯函数、只读小说预案与未运行的加法式数据库迁移。未部署预览站或正式站。**

## 对照用户确定的产品目标

- 统一完整词库：每个 `entry_id` 为一张可见主词卡，内部多词性 `sense_id` 用于展示和来源审稿，不再生成多张强制学习卡。
- 小说上传后：系统识别英文和词形，返回章节可点击词卡的定位 **建议**；是否显示为正式教学目标仍要求小说语境编辑审核，未审、歧义不能自动上架。
- 点击阅读词卡：展示同一张主卡内已审核的多词性、释义、原创新例句、音标、搭配；朗读/词卡关闭/与阅读页已有行为的接口适配将在下一阶段进行。
- 用户学习：以 `user_id + entry_id` 为唯一复习身份。连续“认识”不能刷爆间隔；“再记一次”缩短下一次复习并提示本轮 5 张后再现；“已掌握”独立操作；每个用户的状态互相隔离。

## 本轮实际新增、可复用的代码

1. `src/global-dictionary-headword-srs.js`：单词头级的纯函数 SRS：1/3/7/14/30 天、同 UTC 日不重复推进、到期才能再次增长、忘记缩短、独立标记已掌握；只给出状态提案，不碰 D1、旧用户信息。线上最终实施时，必须通过有权限的服务端时钟和用户身份生成参数；不能直接信任客户端时间/用户ID。
2. `db/019_global_dictionary_headword_study.sql`：**只提出**加法式 `user_headword_study` 和独立事件流水表，每个 `user_id+entry_id` 唯一，并发 revision 预留字段；不修改旧 `user_words`、`review_events`、订单或 `global_dictionary_senses`。**当前远程迁移工作流仍仅适用 013–018，本文件绝不能被自行直接 apply 到正式库。**
3. `src/global-dictionary-headword-click-plan.js`：对之前 `extractUnmarkedV2EnglishTokens` 的读取结果与已有 `matchDictionaryWord`/`auditDictionaryLesson` 对接。只允许源和词形标记已审核、教学主卡信息完整且**至少一个 active+approved 义项**的单词产生可点击位置建议。所有未审核词义从主卡过滤，多个合法义项展示在同一张主卡，默认 `context_sense_id=null`，绝不猜中文语境义项。
4. `tests/v12-global-dictionary-headword-*.test.mjs`：验证两个不同小说共用 record 名词/动词主卡与同一复习计划、词形匹配、无审校内容阻断、日期循环和用户隔离、历史数据库表在 019 迁移模拟后仍保持不变；测试使用**全部合成用户和词卡**。

## 已完成的旧项目资产继续复用

- 源词库：400,183 ECDICT 词头索引、7,391 考试优先词头、655 条原创英中草稿、5,985 复杂词组、239 来源和音标专项核查；**这些不是已通过商用 Publisher 的教学词卡**。
- 历史：2,206 旧词卡 ID + 1,150 候选义项；现有 `global-dictionary-study-rehearsal.js` 和 `global-dictionary-sense-study-rehearsal.js` 只读保守归并继续保留。旧 ID 不会删除、覆盖或合并用户复习数据。
- 小说：`global-dictionary-auto-discovery.js`、`global-dictionary-matcher.js`、`global-dictionary-novel-v2.js`、`ops-dictionary-v2.js`；不复制另一套 tokenizer。
- UI：已存在的阅读词卡、例句朗读、快速刷词与剧情回声不删改，本轮只提供后续可以安全接入的数据格式。

## 本阶段尚未完成、必须后续真实验证

1. 前端 `reading` UI 读取安全批准卡，并按章节确认后的锚点真实可点击、TTS 读音与小说自动播放暂停/关闭弹层协同。
2. 服务器授权 SRS API：对 session 身份、付费权益、商用批准词卡、并发更新、服务端时间、事件去重强校验，再写**预览** D1。不能允许客户端传 `user_id` 或造 `approved=true`。
3. 真实云端 013–019 测试 D1 备份/迁移/恢复与 2,206 旧 ID 逐本当前在线小说对照，不丢状态；原 013–018 workflow 不会自动运行 019。
4. 正式审核内容目前 0 条；没有可售教学词卡，就不允许把模拟 E2E 绿灯称为真实预览运营台通过。

## 后续最短路径

下一阶段先做服务端只读主卡/授权 SRS API 与小说点击锚点的安全保存适配，在 staging 备份及明确授权之后连接真实 D1。并行审核已有 655 个原创例句与小说实际需要的义项；完成人工签核后才能在预览网站真实查看和朗读。