# 妙屋英语生产免费试读部署（不再依赖浏览器会话）

本方案为一次性配置、以后可重复使用的 GitHub Actions 手动发布通道。它明确部署 **《雨夜档案》第一章免费试读**，而非 12 章完整付费书。

## 为什么要这样操作

- Cloudflare 的浏览器登录状态并未保存在可供执行部署的 TinyFish 会话中；重复让用户登录不是可持续的交付方式。
- GitHub 上的 S73 代码已完整测试并合并，但原有 workflow 全部 dry-run，不会部署到 Cloudflare。
- 这条 workflow 仅在 GitHub Actions **手动输入 `DEPLOY_FREE_PREVIEW`** 时运行；无 push/PR 自动发布，不操作 D1 数据库或现有用户。

## 用户仅需一次性添加两个 GitHub Secrets

GitHub 私有仓库 → Settings → Secrets and variables → Actions → New repository secret：

<https://github.com/kim-1868/miaowu-english/settings/secrets/actions>

1. **CLOUDFLARE_ACCOUNT_ID**：Cloudflare 账户 ID。可从 Cloudflare dashboard Workers & Pages 的账户详情找到；不是站点 Zone ID。
2. **CLOUDFLARE_API_TOKEN**：在 Cloudflare 控制台创建一枚**限权 API Token**。推荐 `Workers Editor`（仅作用于已存在的 `miaowu-english-production` Worker，如果账户提供细粒度角色），或 Cloudflare 官方 `Edit Cloudflare Workers` 模板。无需 D1 编辑、删除和账户管理员权限。请将其**只粘贴进 GitHub Secret**，绝不要发到聊天框、放入仓库、记录到 issues。

Cloudflare 官方指南：<https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/>

## 用户手动执行一次发布

打开仓库 Actions → `Deploy Miaowu free preview (production Worker)` → Run workflow（选择 main）→ 在 confirmation 输入 `DEPLOY_FREE_PREVIEW` → Run workflow。

该工作流使用固定、已审核源提交 `7538a730fe693240b1d396be87814b8199e7783d`，即 S73 merged production release。**不会自动跟进后续 release 变更**；未来新的完整小说必须再次审核并调整 pin SHA。

自动执行：Node 22 → 完整 npm test → 生产配置审计 → 仅构建第 1 章独立页面及已授权的站点资源 → Wrangler dry-run → Pages proxy 可用性检查 → 检查两个 Secrets 是否存在 → Wrangler deploy `--keep-vars`（保留现有 dashboard vars，且 Cloudflare 明确表示部署不会删除现有 secret）→ 匿名探针验证 `/rainy-night.html` 确实返回 64 次英语标注的第一章。

若 GitHub Actions 失败：不要反复点击部署，不要修改/重置 D1 生产数据库。将失败步骤文字（不可含 token）贴给开发者排查。

## 发布验收链接

- 正式站点书架：<https://miaowu-english-pages.pages.dev/>
- 第一章试读：<https://miaowu-english-pages.pages.dev/rainy-night.html>

只有 **Actions 成功 + 实际页面可匿名阅读** 两者都成立，才可声称网站已经上架免费试读。

**尚未发布：** 12章付费小说、音标、词卡、剧情回声、四种题材 AI 生成的新书。它们都有独立的审核和业务要求。
