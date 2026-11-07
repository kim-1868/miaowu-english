# 妙屋英语 V1.1｜双仓库调整、并行开发保护与后续交付记录

> 记录日期：2026-11-07；项目状态：**公共组件迁移及公共 CI 已落地；跨仓库正式整合尚未实施**。
> 本记录是私人核心仓库的项目交接入口。网站同期仍有独立开发修改，务必按下述对照方式保护最新成果。

## 一、确定的架构决定

- 私人核心库：`kim-1868/miaowu-english`，继续保存完整网站业务及受限资产、敏感发布配置、D1/Workers/Pages 正式发布责任。
- 公共研发库：[miaowu-english-public](https://github.com/kim-1868/miaowu-english-public)，只负责可公开的前端模块、组件演示、合成测试数据与无需云端凭据的 Actions 质量检查。
- **绝不将私人库直接设为公共、fork 或镜像完整提交历史。** 跨仓库同步只接受逐文件审核的干净提交和版本对齐。
- 不得把用户、订单、激活码、真实内容及数据库备份放进公共仓库；这些内容继续留在原有私人/Cloudflare 数据边界内。

## 二、已经执行的变动及验证结果

| 类型 | 具体结果 | 状态 |
| --- | --- | --- |
| 公共仓库初始化 | 独立仓库、README、安全范围规则、禁止历史镜像 | 完成 |
| 前端文件迁移 | 18 个文件：公告与添加桌面的 JS/CSS、阅读/书架/词卡等样式、基础样式、5 个 SVG | 完成 |
| 内容一致性 | 对比私人开发 `135abf94579f10619974572dde78a4110fbc030e` 与公共基线对应文件，18/18 blob SHA 一致 | 已验证（2026-11-07，后续变更需重新比较） |
| 公共演示与测试 | `showcase/` 合成数据组件演示、`npm run check`、`npm test`、公共 GitHub Actions | 已通过 |
| 私人高频 CI 优化 | 私人 V1.1 开发分支新增旧检查取消机制、避免仅改预览工作流说明引发再次部署，提交 `135abf...` 的 S1/dry-run 均通过 | 已在开发分支完成；未代表所有私人 Actions 已迁移 |
| 正式站发布 | **未改动** Pages/Workers/D1、真实用户数据、订单、权限、词卡状态和线上内容 | 保持不变 |

公共记录：[迁移文件清单](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/PUBLIC_MIGRATION_MANIFEST.md) · [并行开发与公共更新路线图](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/PARALLEL_DEVELOPMENT_AND_ROADMAP_20261107.md)

## 三、正在完善网站时的冲突风险与保护规则

**目前不会互相自动影响**，因为公共库只是独立组件副本，并没有接管线上发布。但是同一个前端文件可能被私人网站开发与公共任务同时修改，如果无审查地同步，容易覆盖后完成的版本。执行以下锁定规则：

1. 原私人开发分支和当前预览/正式站仍是运行真相。并行开发期**不修改、不回退、不强推**正在使用的功能分支；本轮项目规范只写入私人 `main` 的文档。
2. 公共文件 18/18 的一致性只对记录的提交有效，不能认为未来一直一致。每次集成重新读取两仓库 HEAD 与修改文件的哈希。
3. **碰撞文件**：如公共侧与私人侧同时修改 `site-updates.js`、`styles.css`、`install-guide.js` 等文件，停止直接替换，按功能差异手工整合；保留私人最新改动。
4. 禁止自动同步 `public/index.html`、`public/app.js`、`public/ops*`、`src/**`、`db/**`、`content/**`、`deploy/**`。混合功能将公共 UI 与私人 API 分拆进行。
5. 公共交付需有源 commit SHA、文件清单、合成测试及公开检查结果；私人整合须记目标基线、差异审阅、业务回归和部署审批。
6. 保持用户正在验收的 V1.1 需求优先级，不把已记录但尚未上线的 UI 要求当作已发布功能。

## 四、下一步任务归属

| 顺序 | 任务 | 仓库 | 验收/交接 |
| --- | --- | --- | --- |
| 1 | [PUBLIC-01 公共组件演示](https://github.com/kim-1868/miaowu-english-public/issues/1)：合成书架、公告、桌面教程及多设备展示 | 公共 | 本地演示 + 公共 CI，通过后记录版本 SHA |
| 2 | [PUBLIC-02 公告回归](https://github.com/kim-1868/miaowu-english-public/issues/2)：关闭、换新公告重现、历史记录、异常与无注入 | 公共 | 合成 API 的测试通过；真实运营发布仍私人 |
| 3 | [PUBLIC-03 响应式阅读样式](https://github.com/kim-1868/miaowu-english-public/issues/3)：移动端书架/词卡/阅读器、字号与夜间模式 | 公共 | 合成内容、尺寸与无障碍测试通过 |
| 4 | PRIVATE-INT-01：依据公共固定 SHA 审阅差异并回合私人当前开发版本，避免覆盖用户新修改 | 私人 | 真实后端/权益/书房/词卡/复习/公告/订单全链路回归 |
| 5 | PRIVATE-STAGE-01：仅对候选版本执行受控预览环境验收 | 私人 | 测试 D1 和预览站确认，不动正式 D1 |
| 6 | PRIVATE-REL-01：产品功能/业务安全检查通过后再准备正式发布 | 私人 | 保留独立发布和回滚记录 |
| 7 | CI-COST-01：对比 GitHub 账单中私人 Actions 分钟和执行次数，继续消除冗余测试 | 私人策略 + 公共测试 | 真实计费验证，不假设已经解决全部 2,000 分钟限制 |

以上是按依赖排序的执行任务，**不是定时发布安排**。网站正被同时修改期间，公共任务独立推进；私人集成必须在最新版本核对后进行。

## 五、公开与私人内容的判定例子

- **放公共**：前端公告显示与展开、关闭按钮逻辑、首页 Banner 周边间距、桌面安装教程、响应式样式、阅读字号/夜间对比、纯展示词卡、可重用 SVG、合成数据 UI 测试。
- **留私人**：运营台实际公告发文/撤回、真实公告数据接口、会员登录与激活码、权限/付费墙、词卡义项标识与掌握状态、小说和词汇资料、Cloudflare 数据库与正式发布。
- **拆分开发**：例如公告功能＝公共 UI/合成测试 + 私人公告写入/真实权限与数据；需要共同的非敏感接口契约，但不得以模拟测试代替真实权限测试。

## 六、每次交付与交接的固定格式

- 公共分支及完整提交 SHA、修改的文件列表；
- 私人目标分支及最新完整 SHA；
- 对应文件基线是否一致 / 发生何种冲突；
- 测试执行结果、未覆盖或需要人工验证的部分；
- 是否仅离线验证、是否已进入预览、是否真实部署；
- D1、正式账号、订单与付费权限是否触及（默认：没有）。

**提醒：** 单纯建立公共仓库不会清除以前的 Actions 额度消耗，也不代表私人仓库不再受 2,000 分钟限制。只有把日常 UI 检查留在公共、私人 CI 限量运行，后续再核对账单，才能验证改善。


## 七、PUBLIC-01 已经开始实施（2026-11-07）

- 公共 PR [#4](https://github.com/kim-1868/miaowu-english-public/pull/4) 已合并，公共主分支合并 SHA `5919925e95bddc2ded6a4aaa2a02fd4b5675770c`。
- 新增合成书架与日间/夜间阅读排版演示（`showcase/reading-shelf.html`、`showcase/reading-shelf.css`），并补充安全白名单、自动测试和公共演示入口。
- 公共 GitHub Actions 已通过；没有迁入真实用户、小说、词库、订单、数据库信息或私人提交历史。
- **尚未完成**：真实设备浏览器视觉验收、与私人网站最新样式对齐、正式/预览部署；Issue #1 仍开放。
- 本次只修改公共开发文件及私人 `main` 中的项目记录，**未改私人正在使用的 V1.1 功能分支和云端生产环境**。


## 八、PUBLIC-02 公告展示与历史记录回归（2026-11-07）

本次用户确定：**以后每次开发更新完成，都必须同步写入项目记录**，包括变更范围、完整提交 SHA、测试状态、是否部署、跨仓库差异与剩余问题。此要求成为所有后续开发和交接的固定流程。

- **公共 PR**：[PUBLIC-02 #5](https://github.com/kim-1868/miaowu-english-public/pull/5)，已合并，公共版本 `e582a234a3eeb8fab850b5a859c22b748c3b0e1c`。
- **更新文件**：`public/site-updates.js`、`tests/announcement-regression.test.mjs`、`scripts/audit-public.mjs`、`docs/UPDATE_LOG.md`、`README.md`、`docs/PARALLEL_DEVELOPMENT_AND_ROADMAP_20261107.md`（均为公共仓库路径）。
- **代码效果**：处理旧请求覆盖新公告、历史公告去重、历史独立页面失败后的重试、键盘方向键/Home/End 标签切换与焦点行为；继续以纯文本输出公告，避免把公告当 HTML 运行。
- **验证**：公共 PR Actions [42381193701](https://github.com/kim-1868/miaowu-english-public/actions/runs/42381193701) 成功，合成公告自动测试已覆盖关闭状态、发布新 ID 重现、加载失败重试、同页去重和请求竞态。
- **部署范围**：**仅公共开发仓库**；没有修改私人运行中的 V1.1 分支、私人生产代码、正式或预览 Pages/Workers/D1，也没有接触真实订单/用户数据。
- **并行保护**：公共仓库的 `public/site-updates.js` 已与私人开发基线产生新差异，**不得直接整文件覆盖私人站**。待统一整合时先读取私人最新 SHA，逐项对照并回归检查运营台公告发布/历史查看/关闭后重新发布。
- **未完成**：真实移动端视觉与无障碍验收、与私人 V1.1 网站的实际集成、私有 GitHub Actions 运行分钟持续优化。公共 Issue #2 保持开放到相应验收完成。
- **更新日志入口**：[公共持续记录](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md)。

### 以后每次更新的必要记录字段

`日期 / 需求或 Issue / 修改仓库 / 源分支与完整 SHA / 文件清单 / 变更摘要 / 测试与 Actions 结果 / 当前线上是否受影响 / 私人集成风险 / 待办`。  
公共研发在公共更新日志中写公开部分，涉及核心业务的更新只写入本私人记录；无论哪个仓库，都**不能只在聊天中说完成而不留仓库记录**。


## 九、PUBLIC-03 跨设备排版与词卡可读性优化（2026-11-07）

### 本轮已完成

- **工作归属**：公共仓库 [Issue #3](https://github.com/kim-1868/miaowu-english-public/issues/3) / [PR #6](https://github.com/kim-1868/miaowu-english-public/pull/6)，Squash 合并到公共 `main`，合并提交 `82facd627376b2dbb81cfa109375a5bfb2adcdd7`。
- **实际改动**：公共 `public/v11-responsive.css`、`public/v11-reader.css`、`public/v11-wordbook.css` 增加 320–430px 排版保护、44px 移动触控、长词义/标题换行、字号滑块伸缩与夜间按钮/标签对比；合成书架预览新增移动端展示微调。
- **新增离线设施**：`showcase/responsive-contract.html`、`showcase/responsive-contract.css`、`showcase/responsive-contract.js` 使用真实公共 CSS 选择器，提供虚构书架、词卡、阅读字号 12–24px 和日夜切换演示；`tests/responsive-layout.test.mjs` 增加 CSS/断点/对比度/虚构界面/字号交互测试，并更新公共白名单和 npm 检查。
- **验证**：公共分支 Actions [42382105946](https://github.com/kim-1868/miaowu-english-public/actions/runs/42382105946) 及 PR Actions [42382144682](https://github.com/kim-1868/miaowu-english-public/actions/runs/42382144682) 均通过。**此为离线自动合同测试，不等于真实设备截图、点击体验已验收。**
- **未发布**：未更改生产或预览 Pages/Workers/D1，未动私人活动功能分支及用户、订单、小说/词库/词卡主状态、阅读进度、正式部署。
- **日志已写**：[公共逐次更新日志](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md)，合并版本及测试信息已固定记录。

### 并行开发差异保护（2026-11-07 当前快照）

- 公共当前提交（日志更新后）：`9b8adb9fd0bafc16b9dba56118a2a2679c2cd0cc`。
- 私人持续开发分支当前提交：`feature/v11-phase1-mobile-and-install-guide-20261106` / `135abf94579f10619974572dde78a4110fbc030e`。
- 两仓原先迁移的 18 个公共文件中，**14 个 Git blob SHA 仍一致，4 个因公共优化已出现预期差异**：`public/site-updates.js`、`public/v11-reader.css`、`public/v11-responsive.css`、`public/v11-wordbook.css`。
- **严禁把这四个公共新文件直接整份覆盖到私人运行站**；要先读私人最新提交、三方审查 CSS/公告逻辑差异，保留用户另一开发流程中新完成的功能，之后在私人受控测试环境做端到端验收。
- 检查私人 `main` 时发现另一条并行工作新增了独立交接文档；本次仅向本交接文件追加记录，没有重置或覆盖其他人/Agent 的提交。

### 后续任务顺序

1. PUBLIC-03：真实浏览器 320/375/390/430px + 平板/桌面视觉、触控与夜间对比验收；保留 Issue #3 直到完成。
2. PUBLIC-01 / PUBLIC-02：处理此前待做的真实浏览器回归与可访问性边角问题。
3. CI-COST-01：继续分析私人工作流高频触发和 GitHub Actions 月度实际消耗，把可公开的纯 UI 检查留公共；不要直接取消生产安全门禁。
4. PRIVATE-INT-01：在用户其他网站修改稳定后的受控候选版本中审阅跨仓库差异，验证登录/权益/词卡/学习记录/运营公告/订单，再决定是否进入预览部署。

**持续规则**：今后每次更新必须补充日期、文件清单、完整 SHA、CI 结果、部署范围、并行冲突与未完成事项。不得只在聊天中汇报。


## 十、PUBLIC-05 公共 CI 重复运行优化（2026-11-07）

- **公共任务**：[Issue #7](https://github.com/kim-1868/miaowu-english-public/issues/7)、[PR #8](https://github.com/kim-1868/miaowu-english-public/pull/8)，已合并到公共主分支，核心合并提交 `2656e0acdbcb77ab3c329b5776f81a72c2553c3a`。
- **实际改动文件（公共仓库）**：`.github/workflows/public-guard.yml`、`tests/workflow-triggers.test.mjs`、`scripts/audit-public.mjs`、`docs/UPDATE_LOG.md`、`docs/PARALLEL_DEVELOPMENT_AND_ROADMAP_20261107.md`。
- **变动**：公共仓库 feature 分支不再对每次 push 自动重复执行检查；PR 检查照常执行，合并到公共 `main` 时也检查一次；保留手动触发（workflow_dispatch）。只读权限、无密钥、CI 取消过期任务、安全白名单、Node 22 测试和超时不变。
- **验证**：公共 PR run [42382432358](https://github.com/kim-1868/miaowu-english-public/actions/runs/42382432358) 和合并后主分支 run [42382464164](https://github.com/kim-1868/miaowu-english-public/actions/runs/42382464164) 均成功；PR 创建前该 feature 最新提交没有新增重复的 push Actions。
- **用户在同步完善网站**：继续保护私人 V1.1 活动分支 `135abf94579f10619974572dde78a4110fbc030e`；本轮只修改公共 CI 与本私人交接文档，**未修改私人业务代码、数据库或任何线上部署**。
- **计费**：仅减少公共仓库重复检查，**不能**据此声称私人仓库每月 2,000 分钟限制消失。私人 Actions 需要未来继续按安全边界优化。
- **剩余事项**：PUBLIC-01/02/03 的真实浏览器视觉验收、4 个公共/私人文件的版本差异审阅、私人全链路集成验收；CI-COST-01 需用实际 GitHub 账单验证私有运行分钟消耗。

**公开更新留痕**：[docs/UPDATE_LOG.md](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md)。所有后续 PR 仍须留下版本号、差异、测试和部署状态后才能交付。


## 十一、CI-COST-01 / PUBLIC-06 / PUBLIC-08 双仓库更新流水线减额交付（2026-11-07）

### 需求与结论

用户确认“公开更新操作尽量都放公共仓库，私人内容留/迁入私人仓库”。本轮已真实调整仓库工作流；**不是将完整正式网站公开**，也绝不能让公共 Actions 持有私人小说、词库、用户/订单/授权数据或 Cloudflare 密钥。

### A. 公共研发仓库：可重复生成、可验证的更新包

- 公共 [PR #10](https://github.com/kim-1868/miaowu-english-public/pull/10) 已合并，提交 `199c9c4631f0e50f8646bfd46ef9d71ed88afbbf`。
- 新增公开 UI 构建脚本、SHA-256 manifest 单测与公共 Actions artifact；仅包含 18 个审核白名单中的 CSS/JS/SVG。
- [公共主分支 Actions 42383632259](https://github.com/kim-1868/miaowu-english-public/actions/runs/42383632259) 已成功，已核对实际交付 Artifact：`wordletter-public-ui-199c9c4631f0e50f8646bfd46ef9d71ed88afbbf`（ID 13578762144）。不自动回写私人代码，不部署 Cloudflare。
- 为取代私人日常前端视觉回归，公共 [PR #13](https://github.com/kim-1868/miaowu-english-public/pull/13) 已合并，提交 `323d7c470af5127be9175341e5a56954f9b5fc36`，增加 `ubuntu-24.04` + Playwright 1.56.1 合成 UI 浏览器矩阵。实际 [运行 42384640070](https://github.com/kim-1868/miaowu-english-public/actions/runs/42384640070) 成功：320/375/390/430/768/1024/1440px、夜间对比、44px 手机点击区、12–24px 演示字号、无页面横向溢出，并生成只含合成界面的截图 Artifact（ID 13578639161）。公共 [main 回归 42384719422](https://github.com/kim-1868/miaowu-english-public/actions/runs/42384719422) 成功。
- 另一条并行的公共“小说标注结构合成合同测试”由其他开发分支独立完成；在合并浏览器工作流时**保留**其 `scripts/annotation-contract.mjs`、`tests/annotation-contract.test.mjs`、`package.json` 与日志更改，没有覆盖对方的新功能。

### B. 私人核心仓库：减少重复 Actions，但保留真实安全验证

- 只读抽样：私人最近 100 次 Actions 中 S1 37 次、Production dry-run 36 次、V1.1 staging 部署 27 次。该统计是**运行次数，不是实际计费分钟或节省金额**。
- 私有 [PR #187](https://github.com/kim-1868/miaowu-english/pull/187) 已合并至默认 `main`，提交 `008eaa984b4778cedb81816a5ad6bb2e78e4eb79`：创建默认分支上可见的手动、固定 40 位 SHA 私人候选整体验收工作流，禁止部署和远程 D1。
- 私有 [PR #188](https://github.com/kim-1868/miaowu-english/pull/188) 已合并至 V1.1 活动分支，提交 `35fc21bfd8b44919bad404e2f76f02e4840dec6c`：S1 与 Production dry-run 不再因每次 `pull_request` 更新自动重复启动；保留原特定旧功能分支的 push 与 workflow_dispatch。
- 随后两个仅修改工作流/交接文档的提交 `9b3e7662e7b92e8f8774ece82de29e0393514f6c`、`14a8aa545802d4933926a90bafa3b67941f11fc0`：把 13 个 P5/公告/阅读专项检查的高频通用 `pull_request` 触发移除，保留对应专项功能分支的 push 检查；正式私有业务回归须在候选阶段通过统一 SHA 手动 Gate。
- 发现私人 [P5 浏览器失败运行 42383967270](https://github.com/kim-1868/miaowu-english/actions/runs/42383967270) 的原因是 `ubuntu-latest` 自动升级至 Ubuntu 26.04 后 Playwright 1.56.1 无法安装 Chromium，**不是业务测试断言错误**。已将 3 个相关工作流固定到 `ubuntu-24.04`，并通过私人 [Chromium 宽屏检查 42384312885](https://github.com/kim-1868/miaowu-english/actions/runs/42384312885) 验证。
- 默认私人 Gate 随后更新到 `6f9a697056b1ba54ca5d777fb429a333e3c8e6a2`：固定 `ubuntu-24.04`、执行 `npm run release:v11:offline-check`（包含账户/订单/数据库恢复模拟及网站单元回归）、私人实际 Chromium 阅读/词卡检查、生产 Worker/Pages 本地 dry-run。**此手动整体验收流程尚未实际运行，不能宣称已通过。**

### C. 未改动的生产/预览及必要后续

- 本轮没有迁移私人小说/词库/用户/订单/激活码/数据备份到公共，没有改 `public/` 业务代码、`src/` 后端、D1、Cloudflare 绑定或发布 Secrets；私人 V1.1 预览部署的自动触发和其部署前完整回归**仍然保留**，避免影响用户同期其他 Agent 的预览开发。
- 公开 UI 的 SHA 校验包**尚未自动集成**到私人正式站：必须先读取两个最新 SHA，审查公共/私人已有 4 个差异文件（公告 JS、阅读/响应式/词本 CSS），按差异合并，不得用旧公共完整文件覆盖私人当前修改。
- 进入正式发布之前必须在私人默认分支 Actions 里对**冻结的私人候选完整 SHA**执行手动 `Private candidate integration and production build QA`，再完成 staging/test D1、用户实际手机/电脑验收、真实权益/订单隔离、安全备份与回滚、得到用户明确的正式上线授权。
- 月度私人 2,000 分钟额度依然存在；真实节省需过一段时间查看 GitHub Billing 的实际计费分钟。当前只能确认触发规则已减少，并非额度本身被取消。
- 之后的默认执行顺序：公开 UI 开发 → 公共测试/真实 Chromium → 公共 18 文件 SHA-256 artifact → 私人按固定版本差异整合 → 私人单次 SHA Gate → 受控预览验收 → 用户授权生产发布。

### 记录与相关文档

- [公共逐次更新日志](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md)
- [私人 CI 调整明细与回滚](V11_PRIVATE_ACTIONS_COST_REDUCTION_20261107.md)
- [私人 SHA 候选手动 Gate](PRIVATE_CANDIDATE_INTEGRATION_GATE_20261107.md)

每次更新继续填写完整提交 SHA、文件清单、测试、是否部署、与并行分支差异、遗留问题，不允许只在聊天中宣布完成。

## 十二、PUBLIC-09 公共交付只读整合预检 + CI-COST-02 私人预览减额（2026-11-07）

### 公共仓库交付工具（已通过）

- [PUBLIC-09 PR #15](https://github.com/kim-1868/miaowu-english-public/pull/15) 已合并，提交 `1cc2f465889a306e0240651ee3c06be65fc5f435`。
- 新增公共 `scripts/plan-public-ui-handoff.mjs`、`tests/public-handoff.test.mjs`，并更新 `package.json`、白名单、README 与公共日志。CLI 只读核对 PUBLIC-06 18 文件交付包的完整来源 SHA（必须独立指定）、SHA-256、长度、额外文件、符号链接；读取**本地**私人 checkout 时仅报告相同/版本差异/缺失，**绝不自动写回**。
- [PR Actions #42385304701](https://github.com/kim-1868/miaowu-english-public/actions/runs/42385304701) 和 [main Actions #42385335370](https://github.com/kim-1868/miaowu-english-public/actions/runs/42385335370) 均成功。该工具不能单凭 manifest 自述的 SHA 证明来源可信，正式整合仍须人工核对已审阅的公共完整 SHA 和 Actions Artifact。
- **最新对照快照**：公共 `1cc2f465889a306e0240651ee3c06be65fc5f435` ↔ 私人 V1.1 `0cf00b37ffa029997436fa3c0b2c67e35b114aa4`。18 个同名公共文件，14 个 Git blob SHA 完全一致，4 个存在预期差异：`public/site-updates.js`、`public/v11-reader.css`、`public/v11-wordbook.css`、`public/v11-responsive.css`。无文件缺失。后续只允许逐项审阅并安全整合，不得全量替换。

### 私人预览 Actions 触发微调（已合并）

- [私人 CI-COST-02 PR #189](https://github.com/kim-1868/miaowu-english/pull/189) 已合并到 `feature/v11-phase1-mobile-and-install-guide-20261106`，提交 `0cf00b37ffa029997436fa3c0b2c67e35b114aa4`。
- 私人 `.github/workflows/v11-preview-staging.yml` 移除 `tests/v11-announcements-preview.test.mjs` 作为 **push 自动部署触发条件**，因为仅修改测试不应重新发布测试 Worker；其它真实源代码路径、手动 `workflow_dispatch`、完整 `npm run check && npm test`、密码保护及测试 D1 绑定均未改。
- 仅修改私人工作流和 `docs/V11_PRIVATE_ACTIONS_COST_REDUCTION_20261107.md`。没有修改小说/词库/订单/账号/真实 D1、正式或预览 Worker 内容；不触发预览部署。以后真实公告/首页代码变化时，预览按原逻辑安全部署。
- **验收范围**：PR 差异确认只有 2 个工作流/文档文件。由于没有执行真实预览部署，本次不能称预览已重新验收；也不能凭运行次数推算实际 GitHub Billing 减额金额。

### 执行边界和未完成

1. 公开 UI 和测试在公共仓库迭代；公共构建产物需人工确认具体 source SHA、manifest 和文件哈希。
2. 真实私人业务、授权、订单、小说和 D1 一律私人受控；公共 CLI 不自动读取 GitHub 私人账号或连接线上环境。
3. 下一步按现有四个冲突文件逐条审阅；未确认私人版本稳定前不执行自动覆盖、生产或预览部署。
4. 正式上线前还要执行私人固定 SHA 手动候选 QA、测试 D1 与权益/订单等全链路回归；该门禁尚未实际触发。
5. 月度私人 2,000 分钟配额仍存在，是否降低消耗需用后续 GitHub Billing 真实统计核验。

公开更新台账：[公共 UPDATE_LOG](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md)。


## 十三、PUBLIC-10 扩大公共前端归属到 24 个文件（2026-11-07）

**用户进一步确认**：网站开发期间尽量让所有公开前端更新在公共仓库完成，避免消耗私人 Actions 分钟；私人仓库只保留真正敏感资产、业务逻辑和最终发布。此规定已在公共仓库单独形成 [公开前端代码所有权规范](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/PUBLIC_FRONTEND_OWNERSHIP_20261107.md)，以后相关开发会话依照此文档选择默认仓库。

### 已落实

- **迁移方式**：严格从本私人 V1.1 固定提交 `0cf00b37ffa029997436fa3c0b2c67e35b114aa4` 的 **6 个公开浏览器文件**建立公共独立提交，不镜像私人 Git 历史、不回写或删除私人原有文件。
- **新增公共文件**：`public/index.html`、`public/updates.html`、`public/flashcards.js`、`public/chapter-words.js`、`public/echo-cloud.js`、`public/onboarding.js`。这些是用户可见的页面标记/客户端展示和 API 调用代码，不含真实用户数据或后端权限实现。
- **公共交付包**：24 个精确白名单文件，公开构建脚本、SHA-256 manifest、只读交付差异检查工具及源接口合同测试均已升级。公共 [PR #17](https://github.com/kim-1868/miaowu-english-public/pull/17) 合并 SHA `0105b212b226a9898e7696cd314b999785826278`。
- **公共验证**：补齐原先固定 18 文件的测试断言后，[PR 安全/单测 42386170949](https://github.com/kim-1868/miaowu-english-public/actions/runs/42386170949)、[真实 Chromium 合成浏览器验收 42386170973](https://github.com/kim-1868/miaowu-english-public/actions/runs/42386170973)、[合并后 main 检查 42386247604](https://github.com/kim-1868/miaowu-english-public/actions/runs/42386247604) 均成功。
- **已核实 Artifact**：`wordletter-public-ui-0105b212b226a9898e7696cd314b999785826278`，GitHub Actions Artifact ID `13579168592`，只含公开 UI 交付源码和哈希。
- **文件对照**：合并后 24 项公开 `public/` 文件与私人 V1.1 `0cf00b37ffa029997436fa3c0b2c67e35b114aa4` 比对，20 个 Git blob SHA 一致、4 个待按差异整合：`public/site-updates.js`、`public/v11-reader.css`、`public/v11-responsive.css`、`public/v11-wordbook.css`；零缺失。不能因首次迁移时一致而忽略今后的版本变化。
- **新规范已落公共**：`docs/PUBLIC_FRONTEND_OWNERSHIP_20261107.md`（公共基线、允许/禁止范围、混合需求拆分、CI/打包/差异审查/上线关口），并同步更新公共 README、迁移清单、路线图与更新日志。

### 仍然私人、严禁迁走的内容

- 任何 `src/**` 中的真实账号、订单、激活权益、鉴权/付费判断、学习状态数据库持久化、D1 迁移与 Workers 生产配置；
- `content/**` 小说/词库/审核资料、真实数据库备份与订单/用户记录；
- `public/app.js`、`public/ops*`、`public/editor*`、`public/claim.js`、`public/novel-file-parser.js`（含尚未拆分的业务或运营流程），以及所有 Cloudflare Token/密钥、Pepper 等；
- **公共 `index.html` 仍引用私人 `/app.js` 和受控业务接口，因此公共 24 文件包本身不是完整可部署网站**。

### 并行开发与上线边界

- 本轮**只修改公共仓库及私人 `main` 的交接文档**；私人开发分支未覆盖、未重置、未进入预览或正式发布。
- 以后公开 UI 优先公共 PR + 免费标准托管 CI；需同步到私人网站时，按固定 SHA 校验 public artifact，在最新私人分支审阅 4 个差异文件，再进行私有权益/订单/词义身份与进度回归。
- 私人固定 SHA 手动候选整体验收和真实预览业务验收尚未执行；不能宣称已经上线或 2,000 分钟限制已解除。
- 公开组件和私有业务同时开发时，以最新受控私人候选为最终整合基线，不能直接整份用公共 HTML/JS/CSS 覆盖，避免阻塞其他 Agent 进度。

公共项目更新台账：[docs/UPDATE_LOG.md](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md)。


### PUBLIC-11 后续并行任务已排期（2026-11-07）

已在公共仓库创建 [Issue #18](https://github.com/kim-1868/miaowu-english-public/issues/18)，专门分模块抽离当前私人 `public/app.js` 中的可公开 DOM/UI 与交互展示。**不会直接整体公开 app.js，更不会触碰账号权限、词卡持久化、内容或订单后端**。每步独立公共 PR、公开离线/合成浏览器测试、固定 SHA 只读差异核对，私人候选验收后才可能同步给预览站。此任务只是已安排，尚未宣称代码拆分完成。


## 十四、PUBLIC-11-01 将真实阅读 UI 控制逻辑从私人 app.js 模块化（2026-11-07）

- **公共源基线**：查看私人 `feature/v11-phase1-mobile-and-install-guide-20261106` 的 `public/app.js` 固定提交 `0cf00b37ffa029997436fa3c0b2c67e35b114aa4`；只审阅/提取 `applyTheme`、`applyReadingPrefs` 和字号/主题事件控制逻辑。
- **公共 PR**：[PUBLIC-11 #19](https://github.com/kim-1868/miaowu-english-public/pull/19) 已 Squash 合并，公共核心提交 `627326c6ad63807d69840b58ced5a9000d14812a`。
- **公开新增**：`public/reader-preferences.js`、合成独立页面 `showcase/reader-controls-contract.html/css`、`showcase/reader-controls-demo.js`、`tests/public-reader-controls.test.mjs`，并更新公共白名单、构建包、只读交付预检和 Chromium 脚本，**公开交付包从 24 扩至 25 个文件**。
- **原有体验保持**：字体默认 18px、12–24px 范围、标题按正文 1.75 倍缩放、原本的局部显示偏好存储键，以及全站/阅读器夜间样式联动。新增显式 `create().mount()` 与 `unmount()`，没有自动绑定或读取私人业务。
- **公开 CI**：[Node 安全及单元 42387193020](https://github.com/kim-1868/miaowu-english-public/actions/runs/42387193020)、[Chromium 42387193140](https://github.com/kim-1868/miaowu-english-public/actions/runs/42387193140) 和 [main 42387278052](https://github.com/kim-1868/miaowu-english-public/actions/runs/42387278052) 全部通过；25 文件交付 Artifact `wordletter-public-ui-627326c6ad63807d69840b58ced5a9000d14812a` ID `13579903426`，包含每文件 SHA-256 清单。
- **并行开发保护**：此轮没有修改任何私人 `public/app.js`、真实小说/词库/订单、D1 或 Cloudflare；正式、预览均未部署。未来私人集成必须**先审阅最新 app.js 并移除旧日夜/字号双重监听**，否则不能简单把新的浏览器脚本叠加到已有页面。
- **未完成**：真实网站用户流程与跨设备集成、私人候选 Gate；公共 Issue #18 仍开放，继续逐步拆分下一块不涉及用户权限的 UI。公共文档： [UPDATE_LOG](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md)。



## 十五、PUBLIC-11-02 书架分页显示层拆分到公共仓库（2026-11-07）

- **参考私人代码**：活动分支 `feature/v11-phase1-mobile-and-install-guide-20261106` 当前源提交 `0cf00b37ffa029997436fa3c0b2c67e35b114aa4`，只审阅 `public/app.js` 中 `renderShelfPagination` 纯 DOM 分页显示逻辑。
- **公共 PR**：[PUBLIC-11 #20](https://github.com/kim-1868/miaowu-english-public/pull/20) 已合并，公开组件的合并提交为 `bc3de0fe82c275204d26c5a2ffa1f4800e7ac6a3`。
- **新增公开文件**：`public/shelf-pagination.js`（`MiaowuShelfPagination.create({document}).render({container,meta,currentPage,onPageChange})`），合成 `showcase/shelf-pagination-contract.html/css/js` 与 `tests/public-shelf-pagination.test.mjs`。公开接口仅负责页码、上一页/下一页、总数、无障碍标签及回调，不实现任何书籍获取、会员/章节权限或真实数据读写。
- **验证**：公共 [Node/白名单单测 42387700757](https://github.com/kim-1868/miaowu-english-public/actions/runs/42387700757)、[Chromium 手机/桌面 42387700804](https://github.com/kim-1868/miaowu-english-public/actions/runs/42387700804)、[main 构建 42387778840](https://github.com/kim-1868/miaowu-english-public/actions/runs/42387778840) 均成功；公共源码交付包 `wordletter-public-ui-bc3de0fe82c275204d26c5a2ffa1f4800e7ac6a3`（Artifact ID `13580371015`）包括 26 个完整白名单文件和 SHA-256 校验清单。
- **最新文件对照**：公共 26 项与私人 V1.1 固定基线比对，20 项 Git blob SHA 一致、4 项因公共优化产生待审阅差异（`public/site-updates.js`、`public/v11-reader.css`、`public/v11-responsive.css`、`public/v11-wordbook.css`），另外 2 个为公共新组件（`reader-preferences.js`、`shelf-pagination.js`），私人原分支没有同名文件是**正常待整合状态**。
- **并行开发保护**：本轮**没有修改私人活动分支**的 `app.js`、书架查询、用户权益、小说内容、订单、D1、预览/正式 Cloudflare 绑定或部署。实际站点仍采用原 `app.js` 的分页逻辑；未来整合需删除原重复 DOM 渲染、将页码回调绑定最新私人书架 API，并验证切换分类、书架状态和权限隔离。
- **完成范围**：PUBLIC-11 已成功拆分了第一批阅读主题/字号与第二批书架分页展示层；仍需继续拆解可公开的 UI 模块。**私人固定 SHA 业务候选 Gate 与正式/预览端到端验收尚未运行**，不能将公共组件通过当作已上线。
- **后续规则**：公共前端优先、固定 SHA 与 manifest 校验、私人差异逐文件审阅、私有验收后才可安排上线，并继续每轮留下双仓库日志。

[公共完整更新记录](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/UPDATE_LOG.md) ｜ [公共代码归属与集成规范](https://github.com/kim-1868/miaowu-english-public/blob/main/docs/PUBLIC_FRONTEND_OWNERSHIP_20261107.md)
