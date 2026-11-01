# 妙屋英语 Pages 免 VPN 访问验证｜Service Binding 版

更新时间：2026-11-01。**只在测试环境使用，不代表已正式上线。**

## 已获真实浏览器验证的事实

用户反馈其中国大陆手机网络在**关闭 VPN**时：

- 竞品参考站 `https://story-verification.pages.dev/` 可以正常打开；
- 妙屋英语旧测试入口 `*.workers.dev` 需要 VPN；
- 新建的 `https://miaowu-english-access-check.pages.dev/__miaowu_pages_function_probe` 和 `/__miaowu_pages_asset_probe.txt` 均返回预期。

这仅证明 Pages **静态资源与动态入口**在一次实际测试中可达，不代表后端登录、云端阅读或跨 ISP 稳定性已经通过。

## 更安全、更省事的最终 PoC 架构

```text
中国大陆浏览器（不使用 VPN）
    ↓ https://miaowu-english-access-check.pages.dev/
Cloudflare Pages Advanced Mode（pages-poc/_worker.js）
    ├─ /__miaowu_pages_function_probe  → 无用户数据的公开 Function 测试
    ├─ /__miaowu_pages_asset_probe.txt → 无用户数据的公开静态测试
    └─ 其余任何路径 → Service binding STAGING_ORIGIN
                             ↓ Cloudflare 内部调用
                  Worker: miaowu-english-staging
                             ├─ 已有 preview reviewer 密钥
                             ├─ 已有读者身份/授权
                             ├─ 已有测试 D1: miaowu-english-test
                             └─ 原有阅读/单词/复习 API
```

Cloudflare 官方明确支持 **Pages Functions → Worker Service Binding**，无需通过公网调用原 `workers.dev`，也无需在 Pages 设置第二份 `ACTIVATION_PEPPER`、`STAGING_PREVIEW_PASSWORD` 或 D1 绑定：
https://developers.cloudflare.com/pages/functions/bindings/#service-bindings

安全收益：
- Pages 不持有任何密码哈希 Pepper、预览口令或 D1 直接读写权限；
- 原 staging Worker 负责统一保护、审核与访问控制；
- Pages 缺少 `STAGING_ORIGIN` 绑定时，除了两个无敏感信息探针，所有请求**503 默认拒绝**；
- **不要**在 Pages 项目上额外设置 D1 绑定或复制 Worker 密钥，避免造成多个地方持有敏感凭据；
- 不修改现有 Worker 的部署分支、原 D1 数据、任何密码或运营开关。

## 已创建的 Cloudflare Pages 项目

`miaowu-english-access-check` （URL 上文），Git 分支 `dev/pages-access-network-poc`，构建根 `pages-poc`、输出目录 `dist`。

**下一步用户只需要核对或添加一个 Service binding：**

1. 打开 Cloudflare → Workers & Pages → **`miaowu-english-access-check`** → **Settings** → **Bindings**。
2. 查看是否有 `STAGING_ORIGIN`，且指向同一账号下的 Worker **`miaowu-english-staging`**。
3. 如没有，选择 **Add → Service binding**，Variable name 填 `STAGING_ORIGIN`，Service 选择 `miaowu-english-staging`；不要选错成其它 Worker。
4. 保存后在 Pages Deployments 中 **Redeploy** 当前版本，以使运行时绑定生效；不要修改旧 Worker，不运行 D1 migrations。
5. **不用设置新的密码/密钥、也不用填写 Pages D1 Binding**。

从 Git 自动部署时，根目录内的 `pages-poc/wrangler.jsonc` 亦指定了上述 service 绑定。Cloudflare Wrangler 配置若已自动注入，步骤3**不用重复添加**。若 UI 与该配置不一致，应截图核对并停止后续账户登录。

## 配置正确的验证

关闭 VPN，通过手机流量重新访问：

`https://miaowu-english-access-check.pages.dev/__miaowu_pages_function_probe`

输出应包含：
```json
{ "ok": true, "layer": "pages-function", "serviceBindingPresent": true }
```

注意第一次部署的旧版本只有 `ok` 和 `layer`，没有 `serviceBindingPresent`；必须确认最新 Pages 自动部署成功后再判断状态。如果 `serviceBindingPresent:false`，先检查 Settings → Bindings 是否设置并 Redeploy。

若 Service binding 已注入，接着访问根路径 `/`：

- 尚未经过 reviewer 的浏览器：原 staging Worker 应返回 HTTP 401、要求 reviewer 预览验证；
- 使用原有 reviewer 预览密钥（仅在自己的设备输入，不在聊天公开），之后用原测试读者账号登录；
- 新域名首次登录需重新设置 host-only Cookie，**不会删除原 D1 里的收藏和阅读进度**；
- 验证 `/api/auth/me` 是否显示已登录（不分享账号身份）、四级 QA 章节（游客 401 / 有权限 200）、`promise` 云端藏书票、QA 第3章已读完状态；
- 回到剧情回声，验证练习可提交、成功反馈，适当核对后台 D1 只读记录。无需创建新账号或兑换码。

## 上线判定

上述实际读写验证通过后，才做三网（电信、联通、移动）不同时间段的稳定性测试；实际运营仍需要自有域名、合规隐私和内容/支付审查。

Pages 自有 `pages.dev` 域名虽然可能在某网络可达，**不保证长期中国大陆全部地区稳定可达**；始终保留独立域名及其他网络入口的备选路线。
