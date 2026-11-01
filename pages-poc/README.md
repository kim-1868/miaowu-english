# 妙屋英语 · 中国大陆无 VPN 入口实验（Cloudflare Pages PoC）

> 2026-11-01：用户确认 `story-verification.pages.dev` 在同一网络下关闭 VPN 仍可以访问，而 `miaowu-english-staging.kim10086a.workers.dev` 需要 VPN。**此结论仅代表用户实际测到的这两个 URL，不推导到所有 Pages 服务。**

## 目标和安全边界

- 创建**一个全新的 Pages 项目**，例如 `miaowu-english-access-check`（仅候选名称；新建完成后由 Cloudflare 确定实际 `*.pages.dev` URL）。
- **不**切换已经在使用的 `miaowu-english-staging` Worker 的部署分支，不创建/修改用户数据，不跑 SQL，不动原 D1 与其备份。
- `pages-poc/wrangler.jsonc` 仅将 `DB` 绑定到已验证的**staging D1**（`miaowu-english-test`），`APP_ENV=staging`。这里不存在生产数据库绑定。
- 全部网页与 `/api/*` 经过 `src/staging-gate.js`；**只有两个完全不含账号/数据的探针路径公开**。缺少预览口令时，其他路径 fail-closed 返回 503；有预览口令但未登录读者账号时，付费正文继续被 401 阻断。
- 该分支不写正式激活码，不启用 S9 `OPS_PUBLICATION_ENABLED`、`OPS_CONSOLE_ENABLED`、`OPS_WITHDRAWAL_ENABLED`，更不能收款。

## Cloudflare Pages 创建项目（需要账号持有者在后台操作）

进入 **Cloudflare → Workers & Pages → Create application → Pages → Connect to Git**，选择已经授权 GitHub 的仓库 `kim-1868/miaowu-english`，但要**创建新的 Pages 项目**而不是编辑原 Worker。

| 字段 | 输入 |
|---|---|
| 项目名称 | `miaowu-english-access-check`（如名称已被占用，可自定义） |
| Repository | `kim-1868/miaowu-english` |
| Production branch | `dev/pages-access-network-poc` |
| Framework preset | `None` |
| Root directory (advanced) | `pages-poc` |
| Build command | `npm install --no-audit --no-fund && npm run build` |
| Build output directory | `dist` |

根目录内的 `wrangler.jsonc` 是 **Pages** 配置，不要选择仓库根部的 `wrangler.jsonc`（那是旧 Worker 配置）。此 Pages 项目在首次构建后还需核对 Settings → Bindings 是否绑定到 **`miaowu-english-test`**，而不是生产库，变量 `APP_ENV=staging`。如配置不一致则**停止，不做登录/测试数据写入**。

## 第一步：只做网络探针（还不需要敏感密钥）

等待**新 Pages 项目**显示 Ready，复制 Cloudflare 给出的 **实际 `https://...pages.dev`** 地址，分别在关闭 VPN 的中国大陆手机网络和电脑宽带测试：

1. `https://<Cloudflare 实际域名>/__miaowu_pages_function_probe`：应该显示 `"ok":true,"layer":"pages-function"`，这是 **动态 Pages Function** 的连通性测试。
2. `https://<Cloudflare 实际域名>/__miaowu_pages_asset_probe.txt`：应该显示 `MIAOWU_PAGES_STATIC_ASSET_OK`，这是由 Pages Function 转发的 **静态文件**连通性测试。
3. `https://<Cloudflare 实际域名>/`：此阶段未安装预览口令时可能显示 `Staging is not ready` 的 503，**这是预期的保护**，并非代表页面无法正常部署。不要为了让首页变成 200 而改掉 Gate。

**关键测试结论**：如果动态 Functions 探针在大陆仍打不开，即使 `pages.dev` 静态站参考页面可以打开，也不能直接采用此方案用于妙屋英语有数据库的完整产品；应回退到自有域名/其他稳定入口。

## 第二步：仅第一步 Functions 探针通过才做端到端验收

Pages 项目 Settings → Variables and Secrets 设置以下两个原有用途的**测试环境**密钥（保持强度与现有测试 Worker 一致，但不需要发给助手）：

- `STAGING_PREVIEW_PASSWORD`：仅用于 reviewer 预览访问；满足代码最低长度。
- `ACTIVATION_PEPPER`：若希望同一 D1 原有测试读者密码仍可验证，必须在 Pages 环境中设置与现有 staging Worker **一致**的值；此密钥绝不通过聊天、GitHub、网页或者截图展示。如无法安全配置，停止同库账号验收。
- **不添加** `OPS_TOKEN_PEPPER`，也不启用任何 S9 运营开关。

需要重新部署 Pages 项目使绑定和环境变量生效。切记：**不要将这两个密钥作为 Pages 构建命令参数、GitHub 环境变量或仓库文件**；只用 Cloudflare Pages 的加密 Secrets。

此时：
- 使用原 `reviewer` 预览身份进入新 Pages 站点；
- 再使用现有测试**读者账号**登录；
- 检查四级 QA 试读、已授权章节、`promise` 云端收藏与「本章已读完」状态、剧情回声答题。新域名的 host-only Cookie 与原 Worker 不共享，读者需重新登录，云端 D1 数据仍在。

## 结果判定

| 情况 | 意义 |
|---|---|
| 静态探针和 Functions 探针都可在大陆免 VPN 打开 | 具备继续进行真实账号/读写测试的条件，**尚不能宣称商用稳定** |
| 只有静态探针能打开 | 说明静态资源与动态服务路径可达性不同；不应仅迁前端后继续依赖无 VPN 不可达的后端 |
| 探针均不能打开 | 当前 Pages 平台入口在该网络不能解决问题，考虑独立域名和其他服务商 |
| 探针可打开但登录/读写超时 | 仍不符合商业上线条件；需检查 D1 延迟、域名/网关、TLS 和 Functions 执行 |

需测中国电信/联通/移动，以及不同时间段的手机流量与宽带。域名注册放在确认可行之后，避免用户提前支出。

## 来源

- Pages Advanced Mode `_worker.js`：https://developers.cloudflare.com/pages/functions/advanced-mode/
- Pages D1 绑定：https://developers.cloudflare.com/pages/functions/bindings/
- Pages Wrangler 配置：https://developers.cloudflare.com/pages/functions/wrangler-configuration/
- Pages 同一 Git 仓库多项目：https://developers.cloudflare.com/pages/configuration/monorepos/
