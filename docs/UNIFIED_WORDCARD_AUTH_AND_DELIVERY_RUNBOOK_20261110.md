# 妙屋英语 · 统一词卡三项目标：授权操作与后续执行清单

最后核查：2026-11-10。当前项目开发分支：`feature/v11-smart-vocab-preflight-20261109`；GitHub [Draft PR #206](https://github.com/kim-1868/miaowu-english/pull/206) 与 [Issue #208](https://github.com/kim-1868/miaowu-english/issues/208)。**此清单不代表功能已经部署。**

## 用户最终交付标准（不可降低）

1. **全量统一教学词卡：** 按可审来源词头、词形、多词性多义项建立完整可复用词典。每个教学义项具备可靠音标、中文释义、原创中英例句及需要时的搭配。可查的未审核原始词头不是可售词卡；商用来源与人工审稿须有独立签核。
2. **已上架小说统一匹配：** 当前公开四级 23 本、六级 5 本（后续其他等级也按同逻辑）。逐本读取当前上线受保护正文，按真实章节、原词卡 ID、语境义项和版本指纹关联统一词典。相同已审 sense_id 共用学习进度，**不同义项独立**；绝不丢失购买/阅读/收藏/复习。
3. **以后上传小说无需单独制作词卡：** 新的 V2 小说不必提交 `words[]`。对学习目标 `surface + gloss` 自动引用已审的统一课程卡，只有歧义、缺词、未批准词义才进入审稿队列。进一步实现**无需手动给段落标注目标词**需额外的英文提取+上下文义项确认，尚未完成。

## 2026-11-10 · Cloudflare 新 Secret 已保存后的真实核验（更新）

- 用户已经在 GitHub 保存 `CLOUDFLARE_STAGING_D1_READ_TOKEN`，GitHub [只读检查 #42806429653](https://github.com/kim-1868/miaowu-english/actions/runs/42806429653) **Attempt 2 已由 ChatGPT 直接重跑成功**。
- 真实测试 D1：`miaowu-english-test` 基础表齐全，词典附加相关表 **0/7**，包括 `global_dictionary_senses` 未建。这不是“已导入全量词卡”的状态。
- 增量只读 Time Travel probe [#42809350007](https://github.com/kim-1868/miaowu-english/actions/runs/42809350007) **成功**，日志有 `STAGING_D1_TIMETRAVEL_BOOKMARK_READ_OK`；恢复点原始值被脱敏，**没有对 D1 备份导出或执行恢复**。Time Travel 是保留时限内的恢复机制；真的迁移前要即时再次记录书签并制定确认/回滚步骤。
- 只读的 `D1 Read` Secret 继续留用，**不要擅自改成 D1 Write**。真实 `013–018` 迁移需要另一只测试用途 Token（Cloudflare Account 的 D1 Write 权限可能影响同账号所有 D1，因此要由工作流硬编码 `miaowu-english-test` 与准确数据库 UUID，并设置人工批准和执行前备份恢复门禁）。目前尚未取得此单独写入凭证，也未执行迁移或部署生产。
- 这里完成的是用户授权阶段 **0** 与恢复点可读的部分验证；阶段 **1** 的完整可恢复备份/数据校验尚未完成，不应把 Time Travel bookmark 可读当作备份验收完毕。
- 下一步开发任务：完善安全的仅测试 D1 的迁移工作流（禁止生产资源访问、手动发起、迁移前记录书签、明确回滚）；在审核后再指导用户单独授权测试 D1 写操作。与此同时继续历史 2,206 旧卡批量审稿和 CET4/CET6 匹配。

## 一、站长现在只需完成的授权（第一优先）

**目的：验证真实预览数据库是否已具备统一词典所需表结构。这里先只读，不导出用户数据、不执行任何迁移。**

1. Cloudflare `https://dash.cloudflare.com/profile/api-tokens` → Create Token → Create Custom Token。
2. Token Name：`Miaowu-Staging-D1-Read`；Permissions：**Account / D1 / Read**；Resources：只选含 `miaowu-english-test` 的 Cloudflare Account。注意：Cloudflare Token 在相同 Account 下的 D1 资源权限通常以 Account 为范围，**并不等于 Token 被锁定到单个 D1 数据库**；项目 workflow 仅查询测试库。
3. 默认不配置 Client IP 过滤（GitHub 云端运行器 IP 会变化），按项目安全策略设适当有效期。Create Token 后仅出现一次 Token 值，不发聊天、不入 Git、不放 URL。
4. GitHub 仓库 `https://github.com/kim-1868/miaowu-english/settings/secrets/actions` → **New repository secret** → Name **`CLOUDFLARE_STAGING_D1_READ_TOKEN`** → Secret 粘贴 Token → Add secret。**不要覆盖已有 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`**。Token 在 Actions workflow 中映射至 `CLOUDFLARE_API_TOKEN` 环境变量，仅在读取 SQL 元数据时使用。
5. 到先前已存在的隔离只读检查 [Run #42806429653](https://github.com/kim-1868/miaowu-english/actions/runs/42806429653)，右上角 **Re-run jobs → Re-run all jobs**。重新运行可读取最新保存的 Actions Secrets。**不要找不到 Run workflow 时直接修改 main**；当前 workflow 只在开发分支上，GitHub 的 `workflow_dispatch` 手动运行按钮通常要求文件也存在默认分支。
6. 正常应输出 `STAGING_CONFIG_AND_013_TO_018_SQL_FILES_SAFE__NO_DATABASE_MUTATION`、`STAGING_D1_BASELINE_TABLES_PRESENT`、`STAGING_GLOBAL_DICTIONARY_TABLES_PRESENT_COUNT_X_OF_7` 和 `NO_CLOUDFLARE_DATABASE_WRITE_OR_DEPLOYMENT_EXECUTED`。
7. 如果不成功，把**报错状态或脱敏日志截图**发到项目对话；不要分享 Token。只读工作流输出错误类别（如 `...BLOCKED_NO_CONFIGURED_CLOUDFLARE_SECRET`、`...D1_TOKEN_PERMISSION`），据此排查。

**权威参考：** [Cloudflare 创建 Token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)、[D1 query API 支持 D1 Read](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)、[GitHub 运行工作流说明](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow)。

## 二、完整后续路线图（依赖、责任、验收）

| 阶段 | 责任 | 状态 | 动作 | 验收结果 / 止损条件 |
| --- | --- | --- | --- | --- |
| 0. 预览 D1 只读授权 | 站长开 Token，开发方核验 | **待授权** | 保存 `CLOUDFLARE_STAGING_D1_READ_TOKEN`，重跑隔离工作流 | GitHub 绿灯，查到表结构；0 写库/0 生产访问 |
| 1. 测试库安全基线 | 开发方主导，必要时站长授权 | 未完成 | 检查 staging 当前表与迁移历史；保留 D1 Time Travel 检查点/可恢复备份；证明恢复过程可执行 | 有备份校验、真实回滚方案；不覆盖生产 |
| 2. 历史教学资产整理 | 开发方 | **离线工具完成，私有真实草稿待运行与审核** | 私有历史 P5 快照 2,206 个旧 word ID 归档；自动组合 920 主词头 / 1,150 严格文本义项候选；保留旧 ID，识别 384 重复组、180 多义词头、173 音标分歧组；审核译义/音标/例句/许可 | 独立审稿和稳定 `sense_id`，不能凭文本相同直接合并状态 |
| 3. 统一词典基础索引 | 开发方 | **400,183 词头 + 56,898 词形离线来源索引完成，未真实入库** | 检查使用许可，预览 test D1 分批导入 **未审索引** 且默认不可售；按四级、六级、考研、雅思优先补真实有用义项 | 词典查找正常；未审核行不会被当成商品课程 |
| 4. 预览 D1 结构迁移 | 开发方，需要后续独立 test-D1 写权限 | **SQL 代码已有，未真实执行** | 先备份，再按依赖执行 013–018，检查 Foreign Key/触发器/表数与回滚 | 每一步只改 test 数据库，所有旧账户学习记录原样 |
| 5. 上架小说全量匹配 | 开发方，需有效 OPS publisher 受控身份 | **只读导出与审计代码就绪，真实 23+5 全文待获取** | 从当前发布内容分别导出 CET4 23 本和 CET6 5 本；校验每书版本 SHA；识词、语境、原旧卡 ID、别义候选；其余等级随后 | 每本真实覆盖、孤立卡、重复义项、音标/例句缺陷及 409 修订清单；旧卡身份不删不乱 |
| 6. 未来新书自动匹配 | 开发方 | **V2 无 words[] 的代码和模拟数据库已测，未真站验收** | 真实 test D1 上线只读预检，低置信度/异义项需确认；生成可兼容小说草稿；复核封面/章节/格式/草稿上架 | 两本四级/六级各跑完整端到端流程；同义项复用、异义项独立 |
| 7. 云端学习状态兼容 | 开发方 | **只读合并演练已有，尚未接上真实账号** | 对照阅读、收藏、快速刷词、剧情回声、跨设备与复习时间；付费权益仍按购买的等级限制 | 同义项不要求重复学，异义项独立；不丢学习/进度/收藏/订单 |
| 8. 用户体验与审稿质量 | 开发方 + 站长预览验收 | 未完成 | 对齐页面词卡、例句点击、外语朗读暂停、弹层外点击关闭、手机/平板/电脑；核实目标词密度和六级新增词覆盖 | 无严重 UI/内容回归，缺释义/音标/例句不允许直接售卖 |
| 9. 上线准备及生产发布 | 开发方 + 站长终验 | **禁止自动上线** | 差异清单、正式 D1 备份、可回滚部署、逐级灰度/记录指标 | 完成真实预览验收且明确发布批准；变更后比对学习状态与购买权限 |

**严格序列：先 0→1，再 4；第 2、3、5 可与授权准备并行。** 不应因为想加快速度跳过审核、D1 备份、旧进度安全检查，或先把所有 400k 未审词头标记为已完成。

## 三、已有源数据和代码入口（其他聊天窗口也应先读）

- 项目总交接：[`docs/UNIFIED_WORDCARD_FULL_PROJECT_HANDOFF_20261110.md`](UNIFIED_WORDCARD_FULL_PROJECT_HANDOFF_20261110.md)。
- 仓库可公开的原词卡候选：`content/lexicon/wordcard-existing-source-register-20261110.jsonl`，343 来源记录去重后 305 张不同旧 ID；**另有私有快照 2,206 个历史旧 ID**，不要在计算“独立新卡数”时把不同集合简单相加。
- 完整私有历史快照：ChatGPT Library `miaowu-english-prod-2026-11-06.p5-content-review.json`，包含收费小说上下文；**严禁提交公有 GitHub**。
- 历史卡加工：`scripts/build-private-historical-lesson-drafts.mjs`（生成主词条+义项审核草稿）、`scripts/build-private-historical-sense-worklist.mjs`（旧 ID、书目、含义、优先级）。
- 身份和 DB：`db/013_global_dictionary.sql` 至 `db/018_global_dictionary_reviewed_senses.sql`；`src/global-dictionary-sense-anchor.js` 与 `src/global-dictionary-sense-study-rehearsal.js`。
- 新书无需制作卡：`src/global-dictionary-novel-v2.js`、`src/ops-dictionary-v2.js`、运营台 `public/ops-console.js`；严格区别“主卡已匹配”和“义项已批准”。
- 四级/六级受控批量导出：`public/ops-cet4-export.js`，离线审核 `scripts/audit-cet4-published-archive-offline.mjs`。当前未对真实运营台完成 UI 点击验收。
- 当前通过的开发分支上次完整 S1 回归：**712 项、711 通过、0 失败、1 跳过**。对应 [CI 运行](https://github.com/kim-1868/miaowu-english/actions/runs/42806436309)。这仅是程序验证，不是线上功能上线。

## 四、下一次反馈格式

用户完成授权后只需回复「**D1 Secret 已保存，检查已运行**」及可选的结果截图；不要提供任何 Token 明文。开发方下一次优先核对 staging 表的真实清单，再继续测试库备份、迁移计划与当前小说匹配，最终才做生产部署。
