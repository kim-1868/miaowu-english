# WordLetter｜私人 Actions 减额执行记录（2026-11-07）

> 本文件说明私人 V1.1 活动分支 `feature/v11-phase1-mobile-and-install-guide-20261106` 的高频 CI 触发优化。**不是正式网站发布批准。**

## 只读观察
- GitHub 最近 100 次私人仓库 Actions 运行（2026-11-07 抽样）：`S1 checks` 37、`Production dry-run` 36、`V1.1 staging preview deployment` 27。
- 100 次运行全部围绕同一 V1.1 活动分支；数字是运行次数，不是实际计费分钟，不能由此推出准确节约金额。
- 旧的 S1 与生产构建模拟每次 PR 更新都跑完整 `npm test`、Wrangler 依赖安装/离线打包，导致大量重复检查。

## 已转移到公共仓库的公开更新检查
公共 `kim-1868/miaowu-english-public` 的 Actions 负责经过审查的 18 个公开 UI 文件及相关样式/交互的测试；通过后生成 `wordletter-public-ui-<完整 SHA>` Artifact，`manifest.json` 中为各文件附 SHA-256 校验。

该公共交付产物**不是网站正式可发布包**，更没有自动读取私人 Git 内容或真实 D1。

## 本轮私人工作流修改
- `.github/workflows/s1-checks.yml`：删除高频 `pull_request`，保留 `workflow_dispatch` 和原历史分支的 `push` 检查。
- `.github/workflows/production-dry-run.yml`：删除高频 `pull_request`，保留历史集成分支 `push`、`workflow_dispatch`。
- 这两项配置本身仍在私人 V1.1 活动分支，旧 workflow_dispatch 入口可能因不在默认分支而无法在 Actions UI 独立显示。**正式可用的手动入口是私人默认 `main` 上的 `Private candidate integration and production build QA (manual; no deployment)`**，工作流 `.github/workflows/private-candidate-integrated-qa.yml`。
- 私人默认分支的手动工作流需要输入准确的 40 位候选 Git SHA，运行 `npm run check`、`npm test`、生产配置审计、Pages/Worker 离线构建，**没有 Cloudflare Secrets、远程 D1 或任何实际发布**。
- 当前 V1.1 staging 部署工作流**不改变自动触发**，以免用户同时开发/验收中的预览站发生静默失效。它部署前继续执行 `npm run check` 和 `npm test`，为实际预览版本保留完整安全检查。

## 不能跳过的验收门禁
1. 公共 UI 先在公共仓库通过测试，选定明确的完整 SHA 及逐文件 manifest；
2. 对照最新私人候选文件逐项安全审阅与集成，不直接覆盖正在完善的私人站；
3. 准备正式发布之前，通过私人默认分支上的手动 SHA 固定整体验收；
4. 预览仍需要 staging/test D1 隔离和用户实测；
5. 正式发布仍必须取得用户明确批准、完成备份恢复/回滚准备，不能仅凭公共 CI 通过或私人离线 dry-run 推出已安全上线。

## 回滚与后续
- 若私人 PR 检查策略出现兼容性问题，可将两个工作流恢复到此前 `pull_request` 触发方案（版本差异审阅后再提交），并保留手动 gate。
- 私人仓库 Actions 2,000 分钟月度免费额度**依然存在**；目标是减少不必要的私有 runner 执行，而非解除额度限制。
- 下阶段继续在公共仓库承接无敏感前端更新；正式部署、真实权益和 D1 永远走私人受控链路。

## 追加：P5 PR 触发去重与浏览器 Runner 修复（2026-11-07）

- 将 13 个原本监听 `pull_request → feature/v11-phase1-mobile-and-install-guide-20261106` 的 P5/公告/词卡专项工作流，改为只在各自归属的功能开发分支 push 时继续运行。它们的测试和源代码继续**全部留在私人仓库**，不会移入公共。
- 这是为避免新 PR 指向 V1.1 活动分支时一次性并发十几套重复的私人回归；私人关键候选通过默认 `main` 的 `private-candidate-integrated-qa.yml` 手动 SHA 固定门禁统一验收。准备正式发布前必须检查整体验收结果。
- 发现原浏览器 QA 在 GitHub `ubuntu-latest` 现为 `ubuntu-26.04` 时，Playwright 1.56.1 安装 Chromium 因不支持 Ubuntu 26.04 报错（示例失败运行 42383967270，并非业务测试断言失败）。三个仍使用 Chromium 的私人测试工作流明确 pin 到 `ubuntu-24.04`，避免运行器升级造成重复失败和浪费分钟。
- **特意保留**已有 `v11-preview-staging.yml` 自动部署与其完整 `npm run check && npm test`，以保护用户同时开发中的测试站显示和安全门禁。若未来将预览切为手动，还需单独确认实际预览更新流程。
- 影响范围仅私人工作流与记录，不改任何小说、词卡/阅读器代码、生产配置、测试 D1 或真实数据库。
