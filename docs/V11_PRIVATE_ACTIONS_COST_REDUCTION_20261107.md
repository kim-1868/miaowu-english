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
