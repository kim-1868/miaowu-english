# 妙屋英语 WordLetter V1.1 · 正式上线前执行与回滚手册

> 状态：**准备就绪检查文件，不代表已批准上线**。截至本文件创建，用户已认可 P1–P4 的测试站体验，但未授权向正式站部署 V1.1，也未核验正式 D1 真实备份。本手册不包含真实密码、订单号、Token 或用户隐私数据。

## 一、目前已核对证据

- **完整功能分支**：`feature/v11-phase1-mobile-and-install-guide-20261106`，PR #154 保持 Draft；基线 `release/v11-baseline-v42-20261106`。不得从默认 `main` 发布。
- **隔离测试站**：`miaowu-english-staging` + `miaowu-english-test`；P1–P4 已通过站长验收。验证预览 Worker 没有路由到正式 D1。
- **正式绑定应保持不变**：Pages `miaowu-english-web` → Worker `miaowu-english-production` → D1 `miaowu-english-prod`。务必对照控制台和 `deploy/production.wrangler.jsonc` 的数据库 ID，不能仅凭名称。
- **测试库 009/010/011/012/013**：已分别创建引导、个人书架、统一复习计划三张独立表；正式 D1 未执行这些迁移。
- **离线迁移演练**：`npm run db:dry-run-v11`，在全套 001–008 旧 schema 和虚构用户数据上重复执行 009/010/011/012/013 两轮，核对旧表列、所有原有行 SHA-256、外键和完整性；不会联网或修改原始数据。
- **静态内容审计**：`npm run content:check-release-packages`，当前两个 JSON 导入包字段/引用通过；不替代线上全库和人工语义审核。
- **正式全库只读 SQL**：`docs/v11-p5-production-library-readonly-audit.sql`，返回各书词卡资料空值和格式问题汇总；**目前尚未在真实生产 D1 执行**。

## 二、正式发布前强制阻断条件（有任何一项未满足，不得发布）

1. 站长明确批准**正式网站**发布本次 V1.1，且批准的是固定完整提交 SHA，不是泛称「继续」或「测试通过」。
2. 核对 **Cloudflare 帐号、Worker、Pages 路由、D1 名称和 UUID** 均指向正式资源；单独校验 `node scripts/check-production-config.mjs deploy/production.wrangler.jsonc`。
3. 生产 D1 取得可恢复的、带时间点记录的备份（Cloudflare Time Travel bookmark 或可信 SQL export），确认可以恢复；私人备份**不提交 GitHub，也不出现在 CI 日志**。
4. 在隔离本地 SQLite 中对该真实备份进行 **009/010/011/012/013 增量迁移演练**，对照旧表和行指纹，验证没有重复执行、字段冲突或外键错误。
5. 实际在**正式 D1**只读核对 `users`、`categories`、`books`、`chapters`、`activation_codes`、`entitlements`、`reading_progress`、`user_words`、`review_events` 和已经存在的运营台审计表，核对 schema 历史，切勿使用盲目的 `wrangler d1 migrations apply --remote`。
6. 运行只读的全库学习元数据汇总；完成用户关心的已发布小说抽样检查：同词义跨书重复、自然英语释义、UK/US IPA、双语例句、常用搭配。数据字段存在不代表语言内容准确。
7. 完成全部自动化回归、真实登录/兑换码/付费墙/购买类别权益、订单发码和后台核对、阅读进度/生词本/统一复习跨设备回归；**不使用真实购买码做破坏性测试**。
8. 提前明确回滚负责人、完成窗口和回滚后的读者通知策略；不要假设只回退代码就能恢复数据库。

## 三、建议的正式发布顺序（仅限上述条件全部满足后）

- **冻结版本**：记录 feature 提交 SHA，备份当前正式 Worker 部署版本和 Pages 部署版本；保持现有发布工作流不自动跟随 `main`。
- **确认真实备份**：记录生产 D1 的 Time Travel 恢复点、备份体量和可用性；核对现有 `009`、`010`、`011` 表是否已存在及结构（可能曾人工部署，必须逐表判断）。
- **先数据库增量、后应用代码**：对经过备份核对的正式 D1 精确执行只新增表的 009、010、011、012、013 SQL；每执行一条都核对 `PRAGMA table_info`、旧数据计数及外键结果。**不要重跑 001–008**。
- **受控发布**：发布已确认 SHA 的 Worker 及网站资源；保持正式环境原 Secret/账号/授权，保持测试环境隔离。
- **上线后只读验收**：检查未登录用户、已购/未购账号（使用单独合规测试账号）、书架、章节续读、生词本、三玩法复习间隔、用户已掌握状态、移动端词卡、兑换、运营台；检查接口状态码和错误率，不记录敏感凭证。
- **持续观察**：出现无法登录、激活码错误作废、越权访问、掌握状态丢失、词义重复或大范围 5xx，应立即停止继续发布并启动回滚判断。

## 四、回滚与事故处置边界

- **仅前端/Worker 错误**：优先回退到冻结的上一稳定 Worker 和 Pages 版本；先保留新增表，不自动 `DROP TABLE`，以免破坏已经产生的 V1.1 学习数据。
- **数据库写入错误、权限泄露或复习状态损坏**：停止相关写入入口，备份事故时刻状态。根据 D1 Time Travel 与部署期间新增合法业务数据量判断是否可整体回滚，不能擅自恢复到旧快照并覆盖事故期间的订单、兑换或用户学习记录。
- **09/10/11/12/13 新表有异常**：兼容回退路径由旧版本 Worker 控制；不允许自动删除新增表。特别注意旧版和新版可能同时写 `user_words`，要先核对数据再选恢复方案。
- **发生越权访问**：立即隔离异常路由，核实任何已泄露数据，必要时轮换相应凭证；不得在聊天/公共工单发出 token 或账号密码。
- **无真实备份、无恢复演练、无明确用户正式上线授权**：本次**只能继续预览和离线验证**，不可执行生产 D1 迁移或发布。

## 五、目前的开放项目

| 项目 | 状态 |
|---|---|
| P1–P4 预览体验 | 用户已确认通过 |
| 两份仓库小说包字段/ID 引用 | 自动化通过 |
| 009/010/011/012/013 基于虚构历史数据的离线演练 | 自动化通过 |
| 生产全部小说数据只读审计 | 待执行；工具/SQL 已备 |
| 生产 D1 真实备份与恢复验证 | 待执行 |
| 真实订单/兑换/账号在正式环境的非破坏性核查 | 待执行 |
| 正式 V1.1 发布 | **尚未批准** |


## 六、V1.1 内部例句补充词典（新增核查）

- 已在独立测试 D1 运行受控增量建表 `012_v11_supplemental_dictionary.sql` 和 107 条试用词数据 `013_v11_supplemental_starter.sql`。GitHub Actions：https://github.com/kim-1868/miaowu-english/actions/runs/42170337666（成功；原 staging Worker 和 401 门禁恢复）。
- `src/internal-dictionary.js` 只为读者已授权、来源可验证的**词卡英文例句**提供字典释义补充，查词不创建词卡，不改变掌握状态；妙屋正式词卡优先。
- 本轮 107 条是初始数据，不等于已经导入 ECDICT 全量数据。大规模来源数据可通过 `scripts/prepare-ecdict-dictionary.py` 离线预处理，需保留上游许可、校验词义、限制导入量，再独立执行**测试库**批量导入。
- 正式上线时不能只迁移 009–011，必须单独评估 012 表和 013 数据、确认生产 D1 备份并执行**完整 009–013 迁移演练**。只部署代码而不建表时，查词安全降级为原行为。
- 用户尚未对本次新增词典功能单独给出验收通过，不能将上轮 P1–P4 的认可自动扩展到此模块。

## 七、前台跨端 UI 发布门禁

- 用户要求首页每本小说的“继续阅读 / 已收藏”操作区完整贴合按钮宽度、不要出现按钮文字折成两行；其他关键操作区也要自适应。
- 已新增 `public/v11-responsive.css`（最后加载）：首页窄栏按钮采用同宽上下排列，不改变封面 3 列书架的整体视觉；601–820px 平板双列和 320–370px 窄屏分别适配。个人书架、词卡、剧情回声、闪卡、阅读工具条和分页区的按钮文字保持单行。
- 新增 `tests/v11-responsive-actions.test.mjs` 与 `scripts/test-v11-responsive-browser.mjs`。本地 Chromium 在 17 种 320–1920px 宽度下测量按钮内容宽度、行数和页面横向溢出，**全部通过**：GitHub Actions https://github.com/kim-1868/miaowu-english/actions/runs/42176454688（`V11_RESPONSIVE_BROWSER_MATRIX_PASSED`）。
- 上述自动化是**本地 DOM 夹具的 Chromium 测试**，不能替代用户对真实小说封面、手机 Safari、Android、夜间模式与账号各状态的实机截图审查。生产发布前建议进一步按真实内容做视觉抽样。
- 按产品发布门禁要求，正式环境不随 UI 预览更新；须验收 staging 后再进行独立生产发布。

## 八、P5 本地磁盘恢复演练补充（2026-11-06）

- 新增 `scripts/rehearse-v11-backup-restore.mjs`：使用 Node 22 原生 SQLite backup API 创建**实际磁盘数据库文件**；备份后重新打开，复制到隔离迁移数据库执行 009–013 两遍；核对全部旧表 SHA-256 行指纹、既有 schema、外键和完整性。最后从未修改的原备份再次**独立恢复**，再次比对指纹，并清理临时文件。
- 新增 `npm run db:restore:rehearsal` 和 `tests/v11-p5-backup-restore.test.mjs`；5 项专门测试通过，完整 S1 回归 545 通过、0 失败、1 跳过。<https://github.com/kim-1868/miaowu-english/actions/runs/42246943333> 与 <https://github.com/kim-1868/miaowu-english/actions/runs/42247073319>。
- `npm run release:v11:offline-check` 已将上述磁盘恢复作为新增自动化门禁。通过可信私有 SQL 导出路径的运行方式另见 `docs/v11-p5-backup-recovery-gate.md`。
- **此验证所用历史数据均为虚构，未验证真实 Cloudflare D1 Time Travel 恢复能力，也未取得生产备份。正式 D1 的独立真实备份、受控私有恢复演练和运营历史记录抽样核查依然阻断正式 V1.1 发布。**

## 九、P5 本地恢复后权益一致性核验（2026-11-06）

- V1.1 开发分支已整合 PR #175；新增 `scripts/v11-restored-rights-audit.mjs`，在**本地恢复数据库**中运行 `docs/v11-p5-rights-reconciliation-readonly.sql` 的八项匿名计数（兑换码、授权、订单自助领取异常）。`rehearse-v11-backup-restore.mjs` 已对**源数据库、增量迁移后的副本、独立恢复数据库**三处计数做一致性核验；若数量发生变化则阻断恢复演练。
- 当历史备份还没有 `self_service_claims` 时，脚本明确显示七项可用、第八项 `null`、需要人工核验；不会将缺少数据当作“零异常”。已有异常不做自动变更/纠正，仅输出异常类别与数量。
- 本次全部使用虚构数据：新增 5 项独立测试，连同上一批磁盘恢复测试，10/10 项通过；完整 S1 测试 551 项，其中 550 通过、0 失败、1 跳过。<https://github.com/kim-1868/miaowu-english/actions/runs/42248394687>。
- **真实正式 D1 的备份、Time Travel 恢复验证及私人订单核验依然没有执行**。本次不改变线上发码、兑换、权益或学习数据；不能因此将正式发布门禁标记完成。

## 十、V1.1 发布候选版证据门禁（2026-11-07）

- 新增 `scripts/v11-release-readiness.mjs` 和 `npm run release:v11:readiness -- --candidate-sha <固定完整SHA>`。其输出明确列出**七类正式发布证据的缺口**：正式 D1 真实备份、真实备份独立恢复、正式库只读/权益审核、词义审校、运营订单/兑换验收、双端读者验收、回滚方案。真实验证信息只能在受控私有记录中核验。
- `release:v11:offline-check` 已增加生产/测试路由与 D1 UUID 静态隔离检查；新 GitHub Actions `v11-p5-release-readiness-offline.yml` 会运行本地 SQLite 备份恢复、导入包校验和完整网站回归，明确输出 `BLOCKED_PRE_RELEASE` 作为当前**正确结果**。
- 把私有 JSON 证据记录填齐**不等于**已经核验 Cloudflare 真实备份或站长亲自批准；自动化的 `productionReleaseApproved` 和 `permissionToDeployProduction` 固定为 `false`。
- GitHub 开发合并 PR #176 仅用于建设发布前检查，**没有**迁移/部署正式站。另有独立 Draft PR #168（Agent V2 导入预检）和 #169（词义影子审核）尚未合并或人工验收；总 PR #154 仍 Draft。V1.1 尚未冻结正式发布 SHA。
- 专用测试 8/8，通过全套离线检测：559 项中 558 通过、0 失败、1 跳过。<https://github.com/kim-1868/miaowu-english/actions/runs/42250661028>。完整说明见 `docs/v11-p5-release-candidate-gate.md`。
