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
