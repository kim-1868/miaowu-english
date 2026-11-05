# 妙屋英语｜跨小说词义 ID 统一方案（不改变现有网站）
日期：2026-11-05
状态：仅设计分支，**没有执行数据库迁移、没有发布网站、没有触碰用户记录。**
对照代码：release/claim-receipt-ux-v34-20261105。

## 一、已核实的风险基线
- 四级书架有 17 本/124 章，564 个不同规范化英文头词；分布在 1,437 个历史词卡 ID。
- 273 个词跨小说出现，但跨书没有共享过同一个 words.id。
- 当前 user_words 唯一键是 (user_id,word_id)，review_events 按 word_id 记录；重复拼写可能重复收藏、重复复习和分别掌握。
- chapters.content_json 的段落 segment 嵌入 wordId；chapter_words、word_categories、用户学习和复习表都引用 words.id。**禁止直接大规模替换该主键。**

## 二、三层身份模型
1. 旧 words.id 保留：原小说、章节、每个上下文词卡继续使用旧 ID，线上内容/权限/支付/朗读不变。
2. canonical_word_senses.id：唯一且稳定的“英文词目 + 词性 + 经过审核的具体义项”身份，统一跟踪用户学习进度，不因中文解释的措辞改变而更名。
3. legacy_word_sense_map：旧 word ID 与统一义项 ID 的审核映射。只对 approved 映射共享；pending 保持旧逻辑。

还需要：
- chapter_word_sense_overrides：若**同一旧 word ID 内部**的不同出现位置对应不同义项，以 (chapter_id,word_id,context_anchor) 决定意义，不能在旧前端只携带 wordId 时自动合并；这类记录先保留不共享。
- user_sense_state：按 (user_id,sense_id) 维护已收藏/学习中/已掌握/到期日期。
- review_event_senses：仅将历史复习事件追加关联至 sense，原始 review_events 永远不删除也不改词卡 ID。

例：record / n. 记录，两本书相同义项→同一个 sense，分享掌握状态；record / v. 录制→另一个 sense。charge / v. 收费 vs. v. 指控：词性一样但意义不同，也必须拆分。evidence / n. 证据 在悬疑/职场两种场景中意义相同：可共享。若词性、释义、句中用法不明确，则 pending，不得自动归并。

## 三、阶段实施（不得跳步）
**阶段 A：完全离线/只读。**
- 将 273 个跨书同形词对应的历史 ID、中文释义、词性、所在章节的真实语境列成审核清单，编辑逐项确认 merge/split/pending；禁止按拼写或相似中文释义直接合并。
- 在隔离测试 D1 数据库执行配套的新增表 DDL（db/plans/009_canonical_word_senses_DRAFT.sql）；不更新生产。
- 测试不同词性/义项、同义跨书、同一旧词 ID 多义、重复操作、权限隔离。

**阶段 B：新代码兼容层（需要单独审批和灰度）。**
- 使用默认关闭的服务端 SENSE_IDENTITY_ENABLED 开关。
- 旧的 GET /api/chapters/:id/words 仍返回当前书内原词卡、原语境和旧 word_id，可选附加 sense 信息。没有开关时 API 和读者界面完全不变。
- 将 PUT /api/me/words/:id、POST /api/me/quick-review、POST /api/me/echo/answer、POST /api/me/flashcards/answer 统一先校验旧 word_id 的用户可访问性，再查 approved sense 映射。
- 开关打开后，旧状态表及新 user_sense_state 在同一事务双写；旧 review_events 继续保留，追加 review_event_senses。所有重试须幂等。
- 记忆藏书票、刷词、今日到期、剧情回声、已掌握统计使用 sense 去重；未审核词卡维持 word_id 单独计数。章节内用户主动发起“本章速记/剧情回声”可以再次复习已掌握词，但不因换书而自动变成新词。
- 只返回用户当前有权阅读的章节所关联的词卡。统一掌握状态不可泄露未购小说的原文和词卡细节。
- 对一词多义且同一个旧 wordId 被混用于不同语境的情况，先标记未审核；待词语点击携带语境锚点（context_anchor）后才做精确 sense 绑定。

**阶段 C：可逆的数据回填与上线（独立批准）。**
- 在生产执行前先做 Cloudflare D1 备份、独立还原测试、固定基线比对。先在测试 D1 运行多遍，验证幂等。
- 回填仅新增 user_sense_state，不删除 user_words、review_events；新旧查询与写入之间使用水位或版本机制确保并发更新不丢失。
- 同义多卡：bookmarked 采用 OR；last_seen_at 保留最大时间；保留所有原 review_events。掌握状态优先依据最新有效学习证据；如有冲突且无法确定，则保守标记 learning 并等待复核，禁止错误宣称 mastered。due_at 遵循合并状态，避免漏复习。
- 小规模测试账号灰度验证、核对去重计数和权限；全部通过后才逐步开启。
- 有问题立即将开关关闭，恢复旧版读取逻辑，原有数据完全可用；不需要回滚性删除词卡/改动小说。

## 四、发布验收的硬性门槛
1. 两本同义同词性词卡共享已掌握状态，不重复进今日到期/收藏数量。
2. 不同词义/词性不共享，即使拼写完全相同。
3. 用户可选择复习已掌握义项，但不会被强制要求重新作为新词学习。
4. 正文内容 JSON、所有老词卡 ID、章节锚点、已购权益、阅读进度、激活码、原始复习事件完全不变。
5. 有审核冲突的词保持旧学习状态，不错误归并。
6. 登录、游客/无权限隔离、词卡发音、场景词义、书房计数、分页、多设备学习都通过回归测试。
7. 生产功能开关默认关闭，批准上线前绝不部署；出现异常可以立即关闭并恢复原行为。

## 五、今后的新书制作约束
- 通过编辑审核的同词性、同义项重复词共享 sense_id；新词性或新义项创建独立 sense_id。
- 可以继续给各本书生成自己的 legacy word_id、词卡场景和原句，但不允许让新 legacy ID 产生新的独立学习身份。
- 不要混淆“每本新书与四级书架重复率 30%–40%”与“读者对某个义项的累计学习状态”。

本文件是架构方案，不代表线上修复已经完成。
