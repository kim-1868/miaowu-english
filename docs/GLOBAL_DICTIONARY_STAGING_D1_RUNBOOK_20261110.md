# 统一词典 B2 · 预览 D1 受控验收执行清单（2026-11-10）

> 状态更新（2026-11-10）：**测试 D1 的 013–018 结构迁移及迁移后只读验收已完成**，证据见本文末尾 GitHub Actions 运行记录；全量候选词头、已审核教学义项、小说自动匹配、预览 Worker 部署均**尚未完成**。本文阶段清单保留历史原始检查项，完成事实以末尾日志为准。本清单服务 Issue #208 / Draft PR #206，严禁直接执行生产。以 `docs/GLOBAL_DICTIONARY_PRE_RELEASE_QA_20261110.md` 的风险门禁为准。

## 本阶段目标
在隔离的 Cloudflare **测试 D1** 上验证 013–017 schema、完整词头候选索引与少量**真正通过内容审核**的教学义项，再测试四级/六级小说免 `words[]` 自动匹配。全流程不得改变生产 D1、生产 Worker 或历史用户学习状态。

## 阶段 0：权限与环境前置（未验证）
- [ ] GitHub 受保护 Environment `staging-d1-schema-approval` 已建立，设置必需人工批准；仅临时测试 D1 写权限，禁止生产 D1 写权限。
- [ ] 对照 Cloudflare D1 数据库 ID 和绑定名，人工确认明确指向 `miaowu-english-test`；Secret 不写入日志、Issue、文档、代码或产物。
- [ ] 核实当前 `feature/v11-smart-vocab-preflight-20261109` 提交 SHA，并检查 staging workflow 不会触发生产部署。若无符合要求的工作流，先补齐工作流并做静态安全审查，不手工临时复用生产部署脚本。
- [ ] 审阅 ECDICT 及派生内容的实际许可文件/署名/再分发范围。许可未核实只能测试隔离候选索引，不得把任何来源条目标为可售教学卡。

## 阶段 1：测试 D1 无损备份与回滚
- [ ] 检查迁移前 schema、行数、外键与迁移历史；建立带日期/SHA 的**测试 D1** 一致性备份，并独立恢复到新临时数据库验证。
- [ ] 运行 `db/013–017` 迁移（仅测试 D1），保留迁移前后表清单、索引、外键 `foreign_key_check=0` 的证据。
- [ ] 隔离运行完整上游候选索引导入；记录实际词头数、词形数、源 SHA、幂等重复导入表现，确认 `teaching_ready` / `license_approved` 等发布条件默认为关闭。
- [ ] 注入失败/中断演习，验证恢复到迁移前备份，不依赖“删库重建”替代用户数据恢复。

## 阶段 2：真实教学卡内容门禁
- [ ] 对 1,150 个待决义项逐项保留决议：目前 **0 项正式签核**；493 低冲突和 657 重点复核均不能凭类别自动放行。
- [ ] 每个允许发布的义项核实对应英文词头、词性、中文义项、音标、自然英文例句、中文例句释义、许可及历史义项关系；不存在的字段不得推断填充。
- [ ] 未审核/同形歧义/gloss 不符/来源冲突/伪造 `gdict_` ID 必须拒绝自动发布；每次拒绝要记录可复核原因。
- [ ] 主卡共用并不代表不同义项共享进度：同词头不同义项保持独立、稳定的 sense ID。无义项级映射的历史数据不得迁移。

## 阶段 3：真实小说端到端
- [ ] 从已上架 **四级 23 本** / 已制作 **六级 5 本** 的有权使用原始包中分别抽样；只创建测试草稿/测试账号，不覆盖现有发布版本。
- [ ] 新格式 V2 小说不传 `words[]` → 识别英文标注 → 匹配审核义项 → 显示异常清单 → 人工确认 → 草稿预览 → 已审导出与重新导入 → 显式上架；记录每步成功、拒绝和来源。
- [ ] 检查旧小说正文锚点、旧词卡 ID、中文释义、重复展示、跨书已学义项去重，以及已收藏/复习计划在刷新与跨设备后仍一致。
- [ ] 检查普通上传不能绕过 HTTP 409 版本化修订；已下架小说更新必须通过独立历史版本校验。
- [ ] OPS 权限、购买/撤销权限、手机/平板/桌面、夜间模式、词卡点击与关闭、朗读和异常人工复核均需真实预览验收。

## 阶段 4：发布闸门
- [ ] 测试 D1 真实备份恢复有证据，前述安全/权限/数据完整性用例全部通过。
- [ ] 真正可售的教学义项内容已签核，来源许可已确认；不能以“400,183 个候选词头”代替教学卡交付。
- [ ] B1.3 义项级收藏与复习迁移已完成模拟、测试数据库回放、回滚和多设备一致性验收。
- [ ] 再运行整个仓库测试、构建 dry-run，核对本次 commit SHA、预览 Worker 实际版本与生产基线差异。
- [ ] 形成测试报告，获得用户明确发布批准后，另行制作受保护生产发布计划。

## 目前结论
- 可作为起点：本地 SQLite 400,183 词头 / 56,898 词形零外键错误模拟；677 项测试中 676 通过、1 跳过、0 失败（详见专项报告）。
- **尚无可认定的远程测试 D1 迁移证据；0 个正式批准教学义项。不得把本清单勾选为完成，也不得将 Draft PR #206 合并上线。**

## 2026-11-10 安全门禁补强（代码已提交，远程尚未执行）
- 手动迁移 workflow `.github/workflows/global-dictionary-staging-migrate-manual.yml` 在申请写入前先用官方 `wrangler d1 export --remote` 导出 **测试 D1 完整 schema + 数据**，使用 SQLite CLI 恢复到独立文件，并检查完整性、外键与 4 张历史基础表；任意失败则停在写入前。
- 离线防回退测试 `tests/v12-dictionary-staging-export-gate.test.mjs` 已加入自动 dry-run 工作流；请以 GitHub Actions 实际结果为准，代码提交不等于 CI 已通过。
- **重要限制**：Runner 中的导出文件只在当前 job 短暂保存并于结束删除，**不是持久备份**；即使回放成功也不能替代事先安全保存的独立备份和 D1 Time Travel 恢复保障。现有 workflow 仅核实 bookmark 存在，尚未实际对远程隔离副本进行恢复测试。未补齐持久恢复证明和保护环境人工批准前，不应启动 `apply-on-test-only`。
- 本次没有使用 Cloudflare 密钥，没有触发远程导出/迁移，没有启动正式站部署。测试 D1 环境授权、实际备份保留、预览 Worker 验收依旧待完成。

## 2026-11-10 GitHub 环境授权后只读检查入口
- 用户已在会话中确认 `CLOUDFLARE_STAGING_D1_WRITE_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 保存于 `staging-d1-schema-approval` 环境；**此为用户操作确认，不等于工作流已成功读取、权限范围已证实**。
- 新增 `.github/workflows/global-dictionary-staging-authorized-readonly.yml`（SHA `75dca6c`）：在受保护环境获批准后，只读取测试 D1 的核心表/词典表数量和 Time Travel 元数据，不导出用户记录、不输出书籍内容、不执行 SQL DDL/DML 或部署。
- 此 workflow 通过对应文件变动的 feature 分支 push 触发；可在 Actions 找到 `Dictionary staging D1 authorized READ ONLY baseline`，若出现 `Review deployments`，由账户所有人审批。**勿启动** `Manual staging D1 dictionary schema 013-018 (never production)`，那是会写库的不同工作流。
- 审批后必须根据 CI 实际结论继续。即使只读成功，仍未满足持久备份、独立恢复、正式教学义项审核等上线条件。

## 2026-11-10 · 用户预览 D1 只读授权验收
- 用户提供 GitHub Actions 截图：`Dictionary staging D1 authorized READ ONLY baseline #1`，提交前缀 `75dca6c`，分支 `feature/v11-smart-vocab-preflight-20261109`；页面显示 `The deployments have been approved`、整体 `Success`、`readonly-test-d1` 绿色成功（job 15 秒）。
- 这证明环境审批与只读工作流运行成功；**未在此确认具体 D1 表计数与 Time Travel 输出的逐行日志**，应在后续阶段保留脱敏检查结果。
- 此次仍未操作 schema 013–018 远程迁移、完整 SQL 导出、持久备份、远程恢复演习、教学义项审核或 Worker 部署；上述项目持续未完成，禁止提前启动写库工作流。

## 2026-11-10 · 真实测试 D1 只读日志验收（截图核对）
用户提供的受保护 GitHub Actions 工作流 `Dictionary staging D1 authorized READ ONLY baseline #1` 详细日志显示：
- `STAGING_TEST_D1_CORE_TABLES_4`
- `STAGING_DICTIONARY_TABLE_COUNT_0`
- `READ_ONLY_NO_CUSTOMER_ROWS_OR_SECRETS_EXPORTED`
- `STAGING_D1_TIMETRAVEL_INFO_AVAILABLE_VALUE_REDACTED`
- `NO_EXPORT_NO_RESTORE_NO_MIGRATION_NO_DEPLOYMENT`
结论：隔离测试 D1 的四张核心表已确认、统一词典十表尚未迁移、Time Travel info 可读取，**无数据库写入**。检查结果符合预期。**尚未完成备份导出、持久化保存、独立恢复演练、词头导入、教学词卡审核或读者数据迁移；不可直接发布或绕过写入门禁。**

## 2026-11-10 · 备份演练已准备（需审批执行）
- 新增 `.github/workflows/global-dictionary-staging-backup-rehearsal.yml`（提交 `804c25a`），仅在受保护 GitHub Environment `staging-d1-schema-approval` 中运行，固定测试库名称及 UUID：`miaowu-english-test` / `88a817cb-23bb-4ae4-bcb8-92286c4165d4`。
- 使用官方 Wrangler `d1 export --remote --skip-confirmation` 导出完整测试库到 Runner 私有临时文件；使用 `sqlite3` 离线恢复，核验 `integrity_check`、`foreign_key_check`、4 张基础表及迁移前词典表为 0；核验 Time Travel 元数据，**不执行远程 D1 写入或恢复**。
- 敏感 SQL/SQLite 备份不放入 GitHub artifacts、不进日志、不进仓库；当前流程结束会删除临时文件。因此它是**可重复的恢复演练，不是持久备份**。下一步必须另行将加密的测试库备份存到受控持久介质，并验证读取与恢复后，方能启动写库迁移。
- 修正原人工迁移工作流导出参数由 `--yes` 改为官方明确支持的 `--skip-confirmation`（提交 `469e8c1`）；未启动该人工迁移工作流。
- 新的备份演练工作流设为 feature 分支 push 触发，需用户在 GitHub Actions 看到 `Dictionary staging D1 BACKUP and local restore rehearsal (no D1 writes)` 并按环境人工审批。必须查看真实 CI 日志，代码提交不能视为远程备份成功。
- 官方参考：https://developers.cloudflare.com/d1/wrangler-commands/ 与 https://developers.cloudflare.com/d1/reference/time-travel/ 。

## 2026-11-10 · 备份恢复演练实际运行状态（用户截图确认）
- GitHub Actions `Dictionary staging D1 BACKUP and local restore rehearsal (no D1 writes) #1`，运行分支 `feature/v11-smart-vocab-preflight-20261109`，源提交前缀 `804c25a`。
- 截图显示 `The deployments have been approved`、整体 `Success`、`export-and-replay` 绿色成功（job 16 秒；页面总耗时 1m28s）。
- 目前只有整体/Job 成功的截图，没有单独截取导出验证步骤的成功标记日志；只能按该工作流所提交的步骤推断，不将截屏当作持久备份证明。
- 该工作流在 `RUNNER_TEMP` 导出数据并临时 SQLite 恢复验证，结束删除文件；**没有 GitHub artifact、无外部加密持久备份、无远程副本恢复**。
- **上线阻断仍在**：先备份至受控持久介质，独立验证可恢复与数据一致性，再授权运行会写库的 `global-dictionary-staging-migrate-manual.yml`；不得合并 Draft PR #206 到正式站。

## 2026-11-10 · 持久加密备份的实际执行条件（未运行）
- 已新增 `.github/workflows/global-dictionary-staging-durable-encrypted-backup.yml`：测试 D1 完整 SQL 导出 → 使用 GnuPG AES-256 密码加密 → 解密比较 → 离线 SQLite 恢复并验证完整性和外键 → 将**仅加密后**的 `.gpg` 文件保存为 GitHub Actions Artifact（30 天），不将明文和密码上传仓库或 artifact。
- 环境还需设置第三个私有 Secret `STAGING_D1_BACKUP_PASSPHRASE`（密码必须是由安全随机数生成器产生、长度至少 32 字符；必须自行离线保存且不可发送到公开聊天）。现有两个 Cloudflare Secret 不适合作为可持久解密的备份密钥。未设置时备份工作流 **主动失败，不会上传未经加密的数据库**。
- 人工写库工作流 `.github/workflows/global-dictionary-staging-migrate-manual.yml` 已新增强制入参 `encrypted_backup_run_id`：必须通过 GitHub API 核验同一 feature 分支成功的加密备份工作流及未过期的加密 artifact，缺失则在远程迁移前中止。
- 现阶段无成功的持久加密备份运行号，也没有远程 D1 013–018 实际迁移。**切勿把代码写入当作已经备份或迁移**。需要用户自行批准受保护 Environment 并保存解密密码后，方可真正运行备份。
- Actions Artifact 30 天期限不是永久保存；备份成功后应下载加密 artifact 到独立私有存储，并保留解密密码；再开展隔离副本恢复验证。不得将备份文件或解密密钥公开发布。

## 2026-11-10 · 加密备份运行成功（用户截图核对）
- GitHub Actions `Dictionary staging D1 encrypted persistent backup (NO remote writes) #1`，源提交 `f2467e3`，分支 `feature/v11-smart-vocab-preflight-20261109`；截图显示 `Success`、`Artifacts: 1`、`backup-test-d1` 绿色（24 秒）；页面总历时 5m39s。
- 根据经审核的工作流，运行成功表明备份导出、GPG 加密/解密、离线 SQLite 数据完整性及外键验证步骤执行完毕，并产生至少一个 GitHub Artifact。**截图没有展示 Artifact 文件名、大小、到期日或逐步日志；这些仍须核验。**
- 目前加密备份仅确认保存在 GitHub Actions Artifact（配置保留 30 天），不能把这个等同于用户已下载离线持久保存；解密密码的唯一长期副本需要用户在密码管理器中安全保存。
- 人工词典迁移工作流含 `encrypted_backup_run_id` 门禁，待从 GitHub 运行详情取得真实数字 run ID；未执行 D1 013–018 迁移，未导入 400183 词头，未操作正式站。
- 下一操作：用户下载该加密 Artifact 至安全本地或私人备份空间（不得上传公开仓库），核实保存与解密密码已妥善留存；确认后再运行独立的受保护测试 D1 schema 迁移。对 GitHub CI 运行号不可猜测。

## 2026-11-10 · 用户确认持久加密备份已下载到本机
- 用户明确表示已经将 GitHub Actions 成功生成的加密备份下载并保存到个人电脑。此项为**用户确认**，不是工具对本机文件/备份密码的独立验证。
- 已核对人工迁移工作流需要四个输入：测试数据库名、测试 D1 UUID、确认文字、之前成功加密备份的 **GitHub Actions 数字 run ID**，并在写库前校验同一分支的成功备份 Artifact。
- 后续迁移仍需用户执行 GitHub 人工审批，不能将本地备份保存视作迁移已执行。

## 2026-11-10 · GitHub 迁移工作流入口修复
- 已在默认分支 `main` 注册同名 `.github/workflows/global-dictionary-staging-migrate-manual.yml`，提交 `a5aa549`。默认分支文件只会执行 `NO_DATABASE_WRITES_FROM_DEFAULT_BRANCH` 后失败关闭，**绝不修改数据库**。
- 真正的 013–018 测试库迁移实现仍然只位于 `feature/v11-smart-vocab-preflight-20261109`，须在 GitHub Actions 的 `Run workflow` 中**明确选择该开发分支**，填写目标、UUID、确认文字、真实加密备份的数字 run ID，之后通过 `staging-d1-schema-approval` 审批方可运行。
- 修复 `encrypted_backup_run_id` 在 GitHub API 返回的 `path` 可能是 `owner/repo/.github/workflows/...` 时的校验兼容性，改为安全的指定文件路径后缀校验，继续要求成功状态、同分支、非过期非空备份 artifact。
- 还未通过完整正式流水线验证入口是否在 GitHub UI 出现；默认分支注册并不等于远程测试 D1 已迁移。迁移前须确认关联 CI 红色检查的具体原因，且用户电脑备份和密码可恢复。

## 2026-11-10 · 首次手动迁移失败诊断（未写库）
- 手动运行 URL：`https://github.com/kim-1868/miaowu-english/actions/runs/42840559723`，job `129914345334`，整体 failure。
- 已直接读取 GitHub Actions job 步骤与原始日志：本地迁移/回滚演练 success；测试 D1 完整导出与独立 SQLite 回放 success；备份身份校验步报 `BACKUP_WORKFLOW_NOT_VERIFIED`；**实际执行六份 SQL 文件的步骤状态为 skipped，未进行 schema 013–018 远程写入**。
- 核实备份 run `42836917076` 的 GitHub API 真值：`status=completed`，`conclusion=success`，`head_branch=feature/v11-smart-vocab-preflight-20261109`，`path=.github/workflows/global-dictionary-staging-durable-encrypted-backup.yml`。旧门禁仅接受 `/.github/...` 后缀，拒绝了没有斜杠前缀的合法路径。此处是门禁误拒，不是备份失效。
- 已修复为**精确匹配路径或仓库前缀路径**两种 GitHub API 合法形式，同时保持备份运行成功、分支一致、未过期非空 Artifact 的条件；提交 `64e9040`。增加回归测试，提交 `22f0dfb`。
- 修复后的迁移 **尚未实际运行**，旧 run 仍然失败；下次必须从 `Run workflow` 发起**新运行**并选 feature 分支，不能点击旧失败 run 的 `Re-run jobs`（否则仍引用旧的 commit SHA）。

## 2026-11-10 · 第二次迁移任务被跳过（未写库）
- 用户截图显示手动迁移工作流 **#2**（提交 `7dd3947`）状态为 `Skipped`，任务 `apply-on-test-only` 未执行，因此不是 Cloudflare SQL 执行错误；并未发生本次远程 D1 写入。
- 实际 GitHub run `42841540964`，job `129917776248`，GitHub Jobs API 确认任务结论为 `skipped` 且无步骤记录。
- 当前工作流 job-level `if` 需要 actor、repository、分支、三个手动确认值全部精确一致。截图足以确认 actor 与分支，但**无法独立确认哪一个输入文本不匹配**；不能猜测或宣称一个确定的输错字段。
- 已将手动确认值检查从 job 级别转移到最前的独立 fail-closed 步骤，逐项输出脱敏错误类别（`STAGING_TARGET_CONFIRMATION_MISMATCH` / `STAGING_UUID_CONFIRMATION_MISMATCH` / `STAGING_APPROVAL_TEXT_MISMATCH` / `BACKUP_RUN_ID_MUST_BE_NUMERIC`），不会打印实际字段值；仓库/actor/branch 的 job 级门禁仍保留。错误时即停止，绝不进入 D1 导出或迁移。提交 `2ee037e`，增加回归测试 `ff512ee`。
- 请在新的 CI 通过之后从新版本手动创建一次新 run，不要 rerun 旧 SHA，保持正确 feature 分支以及此前加密备份 run `42836917076`。若任务红叉，再看具体首个失败步骤，而不是重复猜输入。

## 2026-11-10 · 真实测试 D1 013–018 schema 迁移通过（已验证 GitHub 原始日志）
- 运行：`https://github.com/kim-1868/miaowu-english/actions/runs/42843020562`，job ID `129922972396`，执行 commit `65de9a1`，整体成功。
- 审批环境 `staging-d1-schema-approval` 已通过；参数确认 `STAGING_INPUT_CONFIRMATIONS_VALIDATED_NO_DATABASE_WRITES`、加密备份 `42836917076` 验证 `APPROVED_ENCRYPTED_BACKUP_ARTIFACT_EXISTS`。
- 运行前再次成功 `STAGING_REMOTE_EXPORT_AND_DISPOSABLE_SQLITE_REPLAY_OK`，Time Travel `STAGING_D1_BOOKMARK_AVAILABLE_VALUE_PRIVATE`；恢复参考点为 `2026-11-10T15:19:12.619Z`（仅记录非私密 UTC，书签密文未外泄）。
- 远程测试 D1 日志分别显示：`STAGING_TEST_SCHEMA_FILE_013_APPLIED`、`014_APPLIED`、`015_APPLIED`、`016_APPLIED`、`017_APPLIED`、`018_APPLIED`。
- 工作流最终返回 `{"status":"STAGING_DICTIONARY_SCHEMA_APPLIED_TO_TEST_ONLY","files_applied":6,"tables":10,"triggers":5,"old_learning_rows_written":0,"production_d1_accessed":false}`。
- **已完成：测试 D1 结构部署。尚未导入候选词头或正式签核教学义项；尚未实施历史小说配卡、历史用户学习义项迁移、预览 Worker 部署和前端端到端验收。** 不得将「迁移成功」误写成「统一词典全量教学卡已完成」。
- 下一阶段先执行迁移后只读数据完整性核查（10 张表、5 个触发器、4 张基础表存在、Foreign key、未经审核项未发布）；其后再进行候选索引导入与审核词义，并保证测试草稿隔离与生产站零影响。

## 2026-11-10 · 迁移后只读安全验收工作流
- 追加 `.github/workflows/global-dictionary-staging-postmigration-readonly.yml`（提交 `82a33966`）；严格固定测试 D1 数据库名称/UUID、仓库/分支，使用同一个受保护审批环境。`push` 触发该 workflow，但仍需用户在 GitHub Actions 审批，才能用已保存的 Environment Secrets 读取 D1。
- 仅通过 SELECT 查询真实测试 D1：4 张历史核心表、10 张统一词典表、5 个约束触发器，记录历史 `books/words/user_words/chapter_words` 匿名行数；在正式导入之前，要求词典候选、词形、审核课卡、义项为空，并且 `teaching_ready=0`、启用词源为 0。
- 任务绝不执行 INSERT/UPDATE/DELETE/DDL，不导出用户数据、密钥、不部署 Worker；若不一致主动失败并阻断下一阶段导入，等待核查。
- **尚无本次新只读审计的执行结果**，需要查看 `Dictionary staging D1 post-migration READ ONLY integrity audit` 的 GitHub Actions 运行结果并审批。只有其通过后，才开始隔离候选词头索引导入与审核义项的读写方案。

## 2026-11-10 · 测试 D1 迁移后只读验收通过（原始 GitHub 日志核实）
- Run `https://github.com/kim-1868/miaowu-english/actions/runs/42843538233`，job `129924799260`，状态成功；源提交 `82a3396`。
- 原始日志：`POSTMIGRATION_READONLY_TEST_D1_IDENTITY_OK`、`STAGING_POSTMIGRATION_CORE_TABLES_4_DICTIONARY_TABLES_10_GUARD_TRIGGERS_5`、`STAGING_POSTMIGRATION_PREIMPORT_DICTIONARY_EMPTY_AND_PUBLICATION_DISABLED`、`STAGING_POSTMIGRATION_READ_ONLY_NO_D1_WRITE_NO_DEPLOYMENT`。
- 匿名表行数快照：`{"books":4,"words":59,"user_words":9,"chapter_words":262}`。此为**测试 D1 的运行后行数**，不能推断生产库中的小说总数、词汇覆盖率，也不能独立证明迁移前后表行数一致；程序内的旧表写入数为 0。
- `global_dictionary_entries/forms/lessons/senses` 在导入前为空，`teaching_ready` / `enabled_sources` 未启用。结构迁移完成，但全量词条导入、义项审核、旧书/新书绑定均未完成。
- 下一阶段先核对候选上游数据的来源许可、数据量和导入分块/幂等方案；不允许直接导入未经许可的词典字段为已审核教学词卡。
