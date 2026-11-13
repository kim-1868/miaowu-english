# 妙屋英语 · 统一词卡 P0 最短交付执行计划（2026-11-13）

**唯一核心目标**：在真实 TEST D1 中完成已发布小说 A/B 的同义项共用与阅读复习端到端；随后将同一套机制批量应用到正式站已发布小说和四级/六级/考研词卡，最终实现新小说自动配卡。**以远程实际数据与读者端证据为完成标准，PR 合并或合成测试通过不等于完成。**

追踪主任务：[Issue #265](https://github.com/kim-1868/miaowu-english/issues/265)。开发分支：`feature/v11-smart-vocab-preflight-20261109`。正式候选 [PR #206](https://github.com/kim-1868/miaowu-english/pull/206) 仍为 Draft。用户要求先预览验收，**不直接部署正式站、不迁移 PROD D1**。

## 0. 已知事实与本计划的边界

- 真实生产只读快照：**32 本已发布小说、8,444 个上下文锚点**，532 组文本重复候选只是 HOLD，不能直接认作同一已审核词义。
- TEST D1 在此前验收中已具备主要 schema，已发布数据主要是 QA；**approved real commercial senses = 0、licensed real lesson = 0、legacy approved links = 0**。TEST 和 PROD 数据不同步。
- [Protected run #43278046192](https://github.com/kim-1868/miaowu-english/actions/runs/43278046192) 已 **success**，AES256 私密审稿 Artifact **14020109876** 已生成：2 真书 / 2 旧卡 / **1 个共有候选义项**。UK Britfone 找到 1 个候选但与旧卡音标字符串不同；US 候选仍有 1 项差异，英文例句 1 项机器提示；license signed 0、独立语言签核 0、OPS 实际签核 0、TEST 写入 0。密文有效期短，必须在有权访问的受保护区域及时归档；禁止将用户付费内容/原始旧词卡/解密凭据写到公开仓库。
- [PR #280](https://github.com/kim-1868/miaowu-english/pull/280) 有离线 Ed25519 签发/验证工具，但其自身声明还需 **真实 OPS 服务端的 Publisher 身份、可信密钥登记和审计记录**。不允许用测试密钥、人工打勾、GitHub environment approval 冒充商业签核。
- [PR #281](https://github.com/kim-1868/miaowu-english/pull/281) 有真实双书封存清单生成的 SELECT-only TEST 冲突检查器；其 `test_import_allowed=false` 是正确的安全隔离，但**另一个真正可执行的、受限的 TEST 导入通道尚未验收**。
- `src/ops-access.js` 已有 Publisher 身份与 `appendOpsAudit`；`src/global-dictionary-published-approved-legacy-overlay.js` 能只读查已发布章节的、已审核的旧卡 sense 关联；`src/global-dictionary-sense-study-api.js` 已有按 user+sense 的 SRS 入口，禁止另造读者端实现。
- 公开数据库中还未证明存在真实商用 Publisher Ed25519 密钥注册表/签名服务；优先**查证现有能力**，不在没有证据时说“已接通”。

## 1. 工作方法（先纠正循环）

1. **固定一条关键路径**：1 个已审义项 → 2 张原旧卡 → 2 本真实已发布小说 → TEST A/B 阅读与复习 → 可复现证据；没有真实证据不得宣称完成。
2. **禁止重复搭脚手架**：已有脚本可复用就复用；没有阶段实际数据变化的“又新增只读预检脚本/虚拟 fixture”PR 一律不作为 P0 推进。
3. **两线并行但有明确汇合点**：
   - **工程线（AI 可直接推进）**：核验签核/OPS 桥接、可信审计核查、封存源与 TEST 冲突对账、可恢复备份程序、幂等 TEST 导入器、仅 staging QA 可见的阅读链路/测试。
   - **真实内容线（需要实际有授权的审稿/OPS身份）**：审这 1 个共有义项的英中准确性、例句质量、UK/US IPA 选择及来源/许可；只在实际证据存在后签商业授权收据。
   - **汇合门禁**：可信 OPS 审核完成 + 真实 TEST SELECT 冲突/备份检查通过 + 独立 TEST 写入批准 → 受控首批导入。
4. **审批集中化**：只为真实受保护材料访问、真实内容/OPS签核、独立 TEST 写库授权、最后正式发布分别请求一次必要批准；CI 普通开发不反复要求用户点击。
5. **全部状态写到本任务或关联 PR**：每阶段只报告 `已做 / 已验证 / 未做 / 阻塞原因 / 下一实动作`，附 GitHub run、D1 匿名计数和阅读验收证据。合并不会自动“升级阶段”。
6. **不改历史状态**：新表/旁路绑定 add-only，原 words、chapter_words、user_words、权益和用户复习记录保持不变；生产数据库绝不由 TEST 流程写入。

## 2. P0A：工程桥接与真实教学内容审核（可以并行）

| 编号 | 具体任务 | 责任与门禁 | 完成标准 |
|---|---|---|---|
| A1 | **查清**当前 OPS Publisher 身份、审计记录与 Ed25519 受信任公钥登记方式；复用既有 `authenticateOperator/hasOpsRole/appendOpsAudit`。必要时仅增加受控签核与服务端验证端点，不制造第二套平行身份系统。 | AI 编码；只有真实 OPS 管理员能注册/激活合法签发身份。 | 实际 Publisher 身份和权限、服务端登记密钥指纹、审计 ID 三者一致；未注册/撤销身份拒绝；签名篡改拒绝。 |
| A2 | 用新密文 Artifact 14020109876 的**单张共有义项**做具体审查：英中文释义与小说上下文、英中例句、UK/US IPA、搭配、来源许可。旧卡 SHA/原文锚点不可变；必要时给**新统一词卡**独立创作教学例句，禁止直接覆盖旧小说。 | AI 可整理机器检查和候选；真实授权的内容/权利审核人、OPS Publisher 作最终确认。 | 一份可追溯的、独立审核的词义/素材说明；7 类权利与10项内容审签真实记录；合法 OPS 收据可验证。无证据则继续 HOLD，不需要用户再次解释“AI创作”一般来源。 |
| A3 | 将现有 `v12-real-two-book-test-readonly-collision-check.mjs` 安全接到**真实 TEST D1** 的受保护只读运行；至少检查 2 本/2 章/2 旧卡、重复章号/旧ID、可能复用的词条与来源、schema、已有用户计数。 | AI 实现与验证；受保护 TEST 只读凭证和必要审批。 | 产生一次**真实远程**脱敏检查结果，记录冲突类型、数目和解决方案；不以离线 SQLite 代替。 |
| A4 | 设计一条**最小受控导入**：TEST 专用 DB ID 白名单、独立写权限、审核收据验证、真实来源指纹、数据库可恢复备份与恢复演练、事务/幂等批处理与写后逐项计数。现有合法同ID数据先比SHA决定复用；不同内容不覆盖。若需克隆身份，映射必须私密签定并保留来源卡 SHA，不能无审计改ID。 | AI 开发；只有满足 A2+A3、真实备份与独立 TEST 写入批准才允许运行。 | TEST 实际写入已授权词典 source/entry/lesson/sense + 2 张旧卡 legacy links；重复执行无重复记录；失败可恢复；没有用户记录或 PROD 写入。 |

**P0A 不合格即不进行真实写入**。若 A2 的原创/来源与独立审核无法成立，必须明确保留 HOLD；不能声称是算法 Bug 或修改保护规则凑通过。

## 3. P0B：首次真实跨书学习验收（“第一次能用”）

- 测试书初始为 draft、hidden 是保密要求；但阅读查询要求 published/visible/published_at。需**专用 staging QA 可见与授权流程**，保持原先不暴露付费故事给普通用户；有权 QA 账户才可读真实测试章节。
- A 小说点击目标词卡，确认 **词头展示同一张卡，本句对应准确义项**；触发 seen → remembered/forgotten；切 B 小说同义项读取同一 `sense_id`、同一用户学习记录。
- 同词不同义项的学习状态分离；多设备/重试/重复提交不多算；关闭来源、撤销权益、失效会话、未审词义均拒绝；如 TEST 写入失败不得推进复习阶段。
- QA 后清理专用账户测试事件，校验原用户 SRS、收藏、权益及旧章内容计数/指纹不变。
- **通过阈值**：远程 TEST 的 approved commercial sense >0、合法 source/lesson >0、真实 legacy links≥2、不同真实书的受权阅读 anchor≥2；手机和电脑实际预览成功，有可复现但不含敏感明文的验收证据。仅到此才可将 Issue #265 标为技术 P0 完成，仍不能宣称“全量词库已完成”。

## 4. P0C：从 1 个真实词义扩为全站（在 P0B 完成后批量推进）

1. **批量分组，不是逐卡人工点审**：32 已发布书 → 锚点去重 → `headword + POS + specific meaning + context` 候选组；用完整32书/3433旧卡封存快照对账，532 相同文本候选仍需语义验证，不自动直接批准。对重复出现的相同义项只审一个统一课件，但保留所有源旧卡关联。
2. **来源审核和语言审核分层**：上游数据集/批次的权利证据尽量一次归档，可复用许可判断；逐义项使用自动质量检查，语义歧义、文化问题、音标/翻译差异入异常队列。不能用“大批同源许可”替代逐义项必要的准确性检查。
3. **优先词表**：四级 → 六级 → 考研，跨级去重共用 `entry_id`，不同义项分别 `sense_id`；先复用项目已有 ECDICT 词头/词形/级别索引，再用 Open English Wordnet 作义项辅助候选（遵守许可），为缺失教学内容批量准备独立可商用双语例句与IPA；**400,183 ECDICT 头词不是400,183张已审教学卡**。
4. **批次入库**：批次大小从可恢复小批开始，首批真实验收后可按数据差错率增量放大；每批只审变更、不重跑全部。输出：按考试等级的完整词表目标总数、已完成教学义项、未补义项；每本书审核绑定率、冲突率、错义隔离报告。
5. **新书自动匹配**：新 JSON 上传 → 已有分词/词形索引与中文语境匹配 → 精确唯一且已审自动绑定 → 歧义或无课件仅进少量异常队列 → OPS 发布前确认。不得自动编造sense或在新书正文丢弃原词卡。

**全量完成标准**：已明确的各考试词表中可售教学词卡覆盖率达到约定上线标准，所有上架小说词卡均可查且复习状态按user+sense共享；剩余异常量、来源许可与兼容处理有实际报告。不得用“候选导入量”代替“可售已审量”。

## 5. 发布路线与不做内容

- 预览站：独立 staging D1 与测试用户；网页手机/电脑朗读、词卡、收藏、剧情回声、快刷、激活/撤权、旧学习历史、多等级权限回归。
- 发布前：真实差异、非敏感测试证据、PROD 只读基线、加密可恢复备份、按步骤回滚与运行开关；原 PR #206 只有通过完整验收才可结束 Draft。
- **独立用户验收通过后**，才可执行正式站部署和生产数据迁移；失败回退、保持旧业务不受影响。
- 冻结：词汇星图、个人成果报告、熟词僻义新玩法、FSRS算法替换、未发布小说扩大处理、每6小时重复提醒、无远程效益的重复预检 PR。

## 6. 执行顺序与停止规则

- **现在**：A1/A3/A4 工程准备，与 A2 真实审核并行；第一件工程交付应该是可独立验证的 OPS→受信任审核→TEST 最小导入**断点修复**，而不是再造几份 HOLD 单。
- **汇合**：有真实 OPS 审核收据和远程 TEST 只读冲突结果后，完成备份与 TEST 最小导入 A4。
- **接着**：立即在 staging 完成 B 双书阅读测试；有一次成功才能扩到 C 批次，不因为“预检成功”就推进状态。
- **阻塞时**：报告 *一个精确 blocker + 需要谁执行哪个动作*。不要反复要求用户证明其已确认的AI小说/ChatGPT例句来源。任何人都不能替有权审稿者编造审核记录。
- **变更控制**：每个实际能力一个最小PR与有针对性的回归；如只整理非敏感计划，可直接写本开发分支；不能绕过已存在的测试库和正式发布门禁。

## 7. 给其他开发窗口的接续规则

只需读取本文件和 Issue #265；先检查最新 GitHub run、OPS 服务端和 TEST D1 的**实际状态**。不能将 2026-11-13 的已知计数当作永久最新状态。新的工作提交必须说明：相对本文件具体推进哪个未完成 A/B/C 节点、远程证据是什么、是否涉及受保护签核和 TEST/PROD 数据写入；禁止新开没有下一步执行者的审计脚本。
## 2026-11-13 · P0A-1 实际工程执行记录（代码完成，不等于远程上线）

- [PR #282](https://github.com/kim-1868/miaowu-english/pull/282) 已合并至统一词典开发分支，squash SHA 8d4f3bc82cc53fc0a851a2574f3cb74a505d7f8c。没有合并到正式发布分支。
- 新增 TEST-only 的 021_ops_dictionary_publisher_receipt_bridge.sql，复用既有 ops_operators 和 ops_audit_events，记录受信 Publisher Ed25519 公钥指纹以及只用于预检的已验证签名收据；不创建任何账号、权限、词卡或许可。
- Worker 已接入三个 staging-only 默认关闭的实际 OPS 接口：受独立配置指纹约束的公钥登记、Publisher 审核摘要授权审计、离线签名回传验签与持久化审计。只处理指纹和审稿摘要，不传小说原文或私钥。
- 专项 Node 22 + 真 SQLite 007/021 schema 端到端 5/5 成功；PR 最新 head 的八项 CI 检查全部成功，包括 S1 和生产构建 dry-run。没有 Cloudflare 令牌、远程 TEST/PROD D1 操作或正式站部署。
- **严格状态**：P0A-1 工程代码及测试已完成；P0A-1 的真实 TEST schema 迁移、受信公钥配置与实际 Publisher 签核尚未完成。7项权利、10项独立编辑签字、TEST真实词卡写入、A/B小说阅读验收仍未达成。请勿把代码合并或签名本身误当成合法教学内容批准。
- **下一动作**：走既有受保护 staging 备份/迁移许可后应用 TEST 021；配置 OPS_DICTIONARY_PUBLISHER_BRIDGE_ENABLED 和独立可信指纹、由实际 Publisher 注册公钥、签具体单义项的审稿摘要并回传验签；之后才执行真实受控 TEST 导入、跨书阅读验收。所有生产操作仍需独立用户批准。


## 2026-11-13 · P0A-1 真实 TEST 021 受保护迁移入口已准备（尚未执行）

- **实际工程交付**：[PR #283](https://github.com/kim-1868/miaowu-english/pull/283)，合并 SHA `eb32aab834b21c4aab28fa06e87ae053dcc48a32`。专项 021 SQLite 迁移/历史计数/完整性测试成功；S1 回归也成功。
- **GitHub 手工入口**：[PR #284](https://github.com/kim-1868/miaowu-english/pull/284)，合并 SHA `1e584cc26f463ef9060b866117cca59e88182988`；仅向 `main` 登记同名 `workflow_dispatch` UI 文件。默认分支工作流永远不访问 Cloudflare，运行直接失败；要在 Actions 下拉选 `feature/v11-smart-vocab-preflight-20261109` 才能使用真实受保护 TEST 流程。
- 真实开发分支受保护工作流：`.github/workflows/v12-ops-test-021-protected-schema.yml`；脚本 `scripts/v12-ops-test-021-workflow.sh`、校验 `scripts/v12-ops-test-021-verify.mjs`，SQL `db/021_ops_dictionary_publisher_receipt_bridge.sql`。仅人工 workflow_dispatch + 仓库 owner `kim-1868` + 功能分支 + `staging-d1-schema-approval` 审批能进入实际远程 D1 操作。
- 该工作流的一次性执行顺序：真实 TEST 只读计数+FK/quick_check → Cloudflare Time Travel bookmark → 全量 TEST SQL export → AES256 加密 → 解密、独立 SQLite 恢复/FK/完整性验证 → **先上传 30 天加密 Artifact** → 只执行 021 文件（从不运行全部 `migrations apply`）→ 比较 16 张历史表前后计数、021 新增两表/两索引/四触发器与新增注册行 0。若缺表、已有部分021、历史计数变化、完整性失败，直接失败关闭。
- **实际远程状态**：到本次更新还**没有手动启动受保护的 021 工作流**；未远程迁移 TEST，未写任意 Publisher 公钥/真实义项，更未触及 PROD。代码和测试通过不等于实际数据库迁移完成。
- **最短必要人工操作**：GitHub Actions 找到 `P0 protected TEST D1 OPS Publisher 021 schema with full backup` → Run workflow 下拉选择 `feature/v11-smart-vocab-preflight-20261109`；填 `confirm_target=miaowu-english-test`、`confirm_uuid=88a817cb-23bb-4ae4-bcb8-92286c4165d4`、`confirm_operation=APPLY_TEST_021_OPS_PUBLISHER_SCHEMA_ONLY`、`acknowledge=BACKUP_RESTORE_AND_NO_CUSTOMER_WRITES`；执行后如出现 `staging-d1-schema-approval` 环境审批，需要真实 owner 在 GitHub 审批。执行成功后应下载加密备份在 GitHub 外私密留存。
- **下一项工程**：等真实 TEST 021 schema 通过后，核实预览 Worker 已使用包含 PR #282 的分支构建，再受控启用 OPS Publisher 桥接并配置独立可信公钥指纹，由真实 Publisher 用真正权限做注册、审稿摘要的审计、离线签名、验签；版权与内容审核、真实书绑定和 A/B E2E 仍是独立后续门禁。


## 2026-11-13 · 真实 TEST D1 的 021 schema 已落地验收成功

- **第一次受保护执行实际成功**：[GitHub Actions #43397904258](https://github.com/kim-1868/miaowu-english/actions/runs/43397904258) 的 protected-021-test-add-only job `completed/success`，环境审批 `staging-d1-schema-approval` 已实际生效。这不是离线模拟。
- 只读迁移前校验：`P0_021_SAFE_BEFORE={"old_tables":2,"publisher_021_tables":0,"existing_business_count_keys":16,"remote_writes":0}`；远程 TEST D1 identity、FK、quick_check、Cloudflare Time Travel bookmark 全部通过。
- 完整 TEST D1 远程导出，AES-256 对称加密、解密和独立 SQLite 恢复并检验一致性均通过：`P0_021_FULL_TEST_AES256_BACKUP_AND_RESTORE_VERIFIED_NO_DB_WRITES`。先上传受保护的 [encrypted Artifact #14023424336](https://github.com/kim-1868/miaowu-english/actions/runs/43397904258/artifacts/14023424336)，随后才实际调用 `wrangler d1 execute miaowu-english-test --remote --file db/021_ops_dictionary_publisher_receipt_bridge.sql`。Artifact TTL 30 天，须私密下载脱离 GitHub 长期保存。
- 远程迁移后核验：`P0_021_SAFE_AFTER={"phase":"AFTER","status":"TEST_021_ADD_ONLY_SCHEMA_VERIFIED","metadata_tables_added":2,"indexes_added":2,"triggers_added":4,"historical_counts_preserved":16,"productionAccess":false,"customerRowsChanged":0,"noPublisherIdentityOrReceiptsCreated":true}`。外国键和 quick_check 通过，16 张核心业务表的行数未变化，新增 Publisher 公钥/收据均为0，无正式数据库读写。
- **状态更正**：P0A-1 的 **OPS签名桥接代码、021真实 TEST schema、备份/回滚证据均已完成**；未完成的只有预览 Worker 实际使用新代码/启用开关、独立可信 Publisher 公钥 pin 和真实 Publisher 登记/语言版权签核。真实商业义项仍是0，TEST 两书绑定和 A/B 阅读未达成。请勿再反复运行021迁移。
- 第二次重复触发 [#43398006504](https://github.com/kim-1868/miaowu-english/actions/runs/43398006504) 仍处于 waiting，**应取消多余的 #2，绝不再次审批或重跑021**；即便运行，前置 021-existing-schema 检查也会拒绝并产生无意义失败。
- **下一工程**：先确认 staging Worker 当前版本与 `ops-dictionary-publisher-bridge.js` 是否一致，受控预览部署后再配置独立真实 Publisher 公钥指纹，按既有 OPS 身份执行公钥注册/审核摘要审计/签名验真；7权利、10内容必须是有权人员真实审核记录；下一步才做真实词义安全入库。

## 2026-11-13 · P0A-1 预览 Worker 已包含 OPS 桥接代码（默认关闭，真实部署成功）

- [PR #285](https://github.com/kim-1868/miaowu-english/pull/285) 已 squash merge 到 feature 开发分支，提交 `b62001dafbb4aed748c4f44702099c75e84ef306`。复用旧版 `v12-published-sense-staging-deploy.yml`，新增 007+021 真 SQLite OPS Ed25519 链路回归测试、生成配置中显式 `OPS_DICTIONARY_PUBLISHER_BRIDGE_ENABLED='false'`，并增加匿名 POST 进入 OPS Publisher 路由仍被预览 Basic 认证拒绝的 401 smoke。
- **真实受控部署成功**：[GitHub Actions #43399194553](https://github.com/kim-1868/miaowu-english/actions/runs/43399194553)，job `isolated-staging-worker` completed/success。全部步骤：TEST D1 专用目标校验、旧 UI/SQLite/业务回归、临时只读配置生成、`wrangler deploy --keep-vars` 仅 `miaowu-english-staging`、预览首页及词义接口的匿名 401、OPS Publisher register 路由匿名 POST 401。Runner 日志：`STAGING_SHARED_SENSE_READONLY_PREVIEW_DEPLOYED_NO_PRODUCTION_DB_NO_SRS_WRITES` 和 `STAGING_ANONYMOUS_401_GUARD_VERIFIED__OPS_BRIDGE_EXPLICITLY_DISABLED`。
- **已验收范围**：真实 TEST 021 schema 成功 + Worker 新桥接代码已部署至 staging，但 bridge feature flag 显式 FALSE，SRS write FALSE。**未完成**：真实 OPS Publisher 公钥注册/可信密钥指纹配置、独立版权与语言审核、签名回传验真、真实已发布小说感知的词义入库和 A/B 阅读复习端到端。现有测试成功/匿名 401 不代表已证明真实 OPS 签发接口启用后可用。
- **唯一下一步**：从真实 OPS Publisher 身份与其私有 Ed25519 密钥材料建立独立可信公钥指纹，通过有权限的 TEST/staging 设置及受控变更启用 bridge；由有权者完成 1 个真实义项的 7 类素材权利/10 项语言审签，凭签收进行服务端可信审计与回传验证，再执行非 QA 的最小 TEST 词义导入。严禁生成假签核或在公共 GitHub 中存放签名私钥/付费原文；不触碰 PROD。


## 2026-11-13 · P0A 下一工程：真实 Publisher 安全启用入口（已实现并部署为关闭）

- [PR #286](https://github.com/kim-1868/miaowu-english/pull/286) merged：`50417a22392256977c4bd56119f8842313ddd33d`。实际修复 `src/ops-dictionary-publisher-bridge.js` 审计上下文绑定漏洞：`ops_audit_events.content_fingerprint` 现在锁定 review SHA、来源 SHA、候选 sense SHA、editor ID、TEST UUID 的规范 SHA256；独立 Ed25519 签名虽合法，但来源/候选/编辑身份与该授权记录不同也必须拒绝。此前 TEST 021 还没有真实 Publisher 注册/收据，因此无旧真实签名迁移兼容问题。
- 新本地操作工具 `scripts/v12-ops-publisher-local-onboarding.mjs`：`init` 仅在用户电脑 Git 仓库外创建 Ed25519 私钥（0600）与可公开公钥指纹；`register` 调用 staging 的真实 OPS Publisher 认证 API；`sign-reviewed` 只有实际私密审稿 packet 的 7项权利、10项独立内容审签都满足已存在许可 gate，才调用真实审计、在本地签名、远程验签。此脚本**不生成版权证据或代替审核者**，不写 dictionary sense。
- 专项 QA [#43400974112](https://github.com/kim-1868/miaowu-english/actions/runs/43400974112)：真实 OPS 007+021 SQLite 6/6，Publisher 本地密钥、模拟 API 与 gate 4/4，合计10/10；其余 S1、安全构建、预览工作流检测全5项success。该 QA 没有访问任何远程数据库。
- 最新真实隔离预览部署 [#43401140056](https://github.com/kim-1868/miaowu-english/actions/runs/43401140056) job Success：新协议代码已上线至 `miaowu-english-staging`，但 `OPS_DICTIONARY_PUBLISHER_BRIDGE_ENABLED=false`；SRS write false，匿名受保护路由401。
- [PR #287](https://github.com/kim-1868/miaowu-english/pull/287) 已合入 `main` 作为**绝不访问数据库的手动工作流入口**：只有选 `feature/v11-smart-vocab-preflight-20261109` 的 `.github/workflows/v12-ops-publisher-staging-enable.yml`，并由用户在 GitHub 独立审批 `staging-d1-schema-approval`，才会用真实 TEST 只读查到已存在 active Publisher + 021 schema、旧密钥无冲突后，将**用户本地生成的公开 Ed25519 SHA256 指纹**绑定到 staging Worker 开关 true。这个操作不创建 Publisher 身份、不生成私钥、不接触 PROD、不导入词卡。
- 具体受信操作手册：[docs/P0_PUBLISHER_REAL_SIGNING_ONBOARDING_20261113.md](https://github.com/kim-1868/miaowu-english/blob/feature/v11-smart-vocab-preflight-20261109/docs/P0_PUBLISHER_REAL_SIGNING_ONBOARDING_20261113.md)。
- **实际状态**：代码安全修复与预览部署、保护性手工入口均已完成。**尚未**执行真实 activation、登记真实 OPS Publisher 公钥、验证真实独立审核收据、写入商业 sense、绑定原两书或读者 A/B E2E。此阶段不可标记 P0 完成。下一阻塞为用户在**自己的设备**生成/保管可信私钥和提供其公开指纹给受保护 workflow，现有 TEST D1 真实 Publisher 账号需在该流程 read-only 核验。不得把模拟测试数据或用户一般 AI 创作声明当作个别义项的可售许可证据。
