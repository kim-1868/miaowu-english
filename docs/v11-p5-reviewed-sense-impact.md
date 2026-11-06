# 妙屋英语 V1.1 · P5 已审核词义的历史学习状态影响模拟

状态：**网站 A 线离线模拟，未执行 D1 迁移或生产部署，未对真实 23 本小说逐义审核。** 无需 Agent V2。

## 目的

用户在小说 A 已掌握单词后，在小说 B 遇到相同义项应继续沿用学习状态；不同词性、不同释义必须独立学习。既有的 user_words、review_events、reading_progress、user_study_schedules 都不能因旧 ID 合并而损坏。

现有网站线上 studyKey 使用词目、词性、中文第一主释义推导，属于兼容候选，不等于人工审核确认。先由 v11-shadow-sense-audit 工具审核词义、章节语境并锁定快照 SHA-256，再运行本次模拟。

## 实现

新增 scripts/v11-reviewed-sense-impact.mjs，在本地已恢复的私有 SQLite 上执行**纯 SELECT**：
- 从数据库实际词库、章节语境生成审核指纹，审批不能沿用到已修改的小说。
- 未有 canonical schedule 时，保留任一旧卡的已掌握状态、收藏并集、最早到期时间；历史 review_events 不变。
- 有明确的 canonical schedule 时尊重读者最后的主动决策。如果多个计划不同、显式取消掌握但历史卡仍已掌握、显式取消收藏但旧卡仍收藏，则要求人工审核，不自动覆盖。
- 如果旧 studyKey 还与第三张未审核词卡共享，禁止部分合并，以免旧复习计划跨越新的义项界限。
- 只统计当前有权限、已正式发布、当前可见的章节/词卡。未购买或已撤销权限、其他账号的学习状态不混入当前用户。
- 返回匿名汇总：义项组、受影响账号数、预计已掌握/收藏/到期账号数、冲突指标及历史答题事件计数；不输出用户名、订单、兑换信息或小说正文。

## 离线执行

在已核实来源、受控私有文件夹里保存完整恢复的 SQLite 数据库和人工审核 manifest：

    node --experimental-sqlite scripts/v11-reviewed-sense-impact.mjs --local-sqlite /PRIVATE/RESTORED/rehearsal.sqlite --approvals /PRIVATE/REVIEWED/senses.json

虚构测试：

    node --experimental-sqlite --test tests/v11-p5-reviewed-sense-impact.test.mjs

不得将私有备份、真实账号、订单、原文上传 GitHub、聊天窗口或公共 CI 日志。脚本只读打开本地数据库，不访问 Cloudflare，无法代表真实 D1 已核验。

## 返回状态

| 状态 | 含义 |
|---|---|
| REVIEW_BLOCKED | 审稿失配、不同词性、旧小说章节已修改或审核证据不足 |
| MANUAL_REVIEW_REQUIRED | 多个计划、旧已掌握或旧收藏状态相互矛盾，必须人工选择迁移策略 |
| SIMULATION_PASSED_NO_MIGRATION | 离线投影检查通过，但没有改变任何旧数据和在线复习状态，也没有发布许可 |

## 下一步

1. 在私有隔离环境审核真实旧小说词义候选，生成带章节语境与 SHA-256 的证据。
2. 对冲突账号/义项采取保守人工审核；不直接用文本匹配自动合并旧用户学习计划。
3. 设计只新增映射表的隔离 D1 演练，覆盖阅读、藏书票、快速刷词、听音拼写与剧情回声；不变更旧 wordId。
4. 正式 D1 真实备份恢复、权益与运营核对、跨端验收、用户对冻结 SHA 的单独上线授权仍为强制门禁。
