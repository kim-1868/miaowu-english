# 妙屋英语：面向中国大陆的无 VPN 可访问方案（2026-11-01）

**新上线硬门槛：面向中国大陆读者时，手机和电脑在不使用 VPN、代理或加速器的普通网络下，可稳定打开网站、登录、读章、保存进度、收藏、完成剧情回声。**

状态：**域名与大陆可达性尚未验证，不得声称已解决。** 当前私有测试 URL 为 `https://miaowu-english-staging.kim10086a.workers.dev/`，用户明确反馈在当地需要 VPN 才能打开。旧的 staging 运行正常，不能以电脑在海外或开 VPN 通过代替大陆本地验收。

## 技术现状（已查代码）

- Cloudflare Worker `miaowu-english-staging`，`APP_ENV=staging`、`ASSETS` 同 Worker 处理静态站点和 API，D1 绑定 `miaowu-english-test`（UUID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`）。
- 现有 `src/worker.js` 不依赖 `workers.dev` 写死的外部主机名，前端 `public/app.js` 的业务 API 使用同源相对路径（`/api/...`），预览 cookie 与读者会话 cookie 也是 host-only；所以挂新的 Worker Custom Domain 通常不需改动业务源代码或迁移 D1。
- 但**域名换了，原旧域名下的登录 cookie 不会自动带到新域名**。测试读者需在新域名重新登录；这不代表原账户或云端学习数据丢失。
- 目前的页面仍受到 staging reviewer 预览口令保护。绑定域名不会默认将其变成公开正式产品，不能直接去掉防护。
- Cloudflare 全球网络不保证大陆可达性与延迟。Cloudflare China Network 要 Enterprise + 额外服务 + 备案/ICP 及内容审核，不符合本阶段低成本路线。不能把“用了 Cloudflare”误判为“中国境内加速”。

## 用户提供的直接竞品参考：story-verification.pages.dev

参考：https://story-verification.pages.dev

可直接从域名形态确定：这是 **Cloudflare Pages 的默认 `pages.dev` 项目域名**，无需为此默认域名单独付费购买独立域名；它不能证明该网站已配自有域名，更不能证明在中国大陆网络可以免 VPN 使用。

此前产品对标观察：分类故事书架、试读、章节阅读、朗读/词卡、注册、订单号或兑换码激活等业务模式。属于可借鉴的产品流程，但**不能在未获得网站源代码或网络响应检查的情况下断定竞品的数据库、支付、登录权限、设备绑定真实实现**。当前外部检查未能成功读取目标站页面 HTML 或源文件，因此不要把该站后端技术细节当成已核实事实。

妙屋英语当前已实现 Worker 静态页面 + D1 私有正文/权限 + 云端收藏、完成进度与剧情回声，且已有 staging 账号实机联调记录。为了模仿 `pages.dev` 域名而转到 Cloudflare Pages 不会自动改善中国大陆访问，更没有必要重做已有学习后端。

**注册商选择**：优先从阿里云万网或腾讯云购买可自由修改 NS 的自有品牌 `.com`，不要现在就迁移注册商至 Cloudflare Registrar；后者更换权威 DNS 时必须先迁出注册关系，不利于验证失败时快速改换运营商或服务。参考：https://developers.cloudflare.com/dns/nameservers/update-nameservers/

2026-11-01 查询价格：阿里云万网英文 `.com` 标准 **注册 85 元 / 首年，续费 95 元 / 年**（依实际结算、具体名字是否属于溢价域名会变）；腾讯云标准 `.com` **续费 90 元 / 年**。来源：https://wanwang.aliyun.com/help/price.html 和 https://buy.cloud.tencent.com/domain/price?type=renew 。避免用超低首年价格、次年几百的后缀，仅为节省首年费用而选择非品牌后缀。

**域名命名备选**：`miaowuenglish.com`、`miaowu-english.com`、`readmiaowu.com`；仅为查询候选，尚**未证明可注册，也没有核查商标冲突或溢价**。选定后可用 `test.<根域名>` 指向 staging，主域名保留给未来正式线上产品；用子域名不会额外增加域名注册费。购买前须完成注册商域名可用性及续费价格核对。

**真实大陆连通试验**：

- 首先用户关闭 VPN 直接尝试参考站 `https://story-verification.pages.dev/`，说明「能打开 / 不能打开」及网络类型。参考站如果能打开，只说明该 URL 在该网络当下可达，不能直接证明 Pages 平台长期可达。
- 为妙屋英语自己的域名开 `test.` 子域名绑定现有 Worker Custom Domain，真实关闭 VPN 测网站与 API。如果只看首屏、未检查账号登录与云端保存，不得确认业务可用。
- 若域名后 4G/5G/宽带仍无法稳定连接，继续按本文第二阶段考虑非 Cloudflare 入口/同源后端部署。不能简单通过换域名后缀或从 Workers 切换 Pages 宣称免 VPN 保证。

## 第一阶段（推荐）：独立域名挂到原 staging Worker，零数据库迁移

**前置必须由用户提供或完成：** 确认是否已有自己控制的独立域名；如果没有，则选域名注册购买（费用/可注册性须另行确认），不要注册与他人商标冲突的名称。

安全步骤（需用户在 Cloudflare 域名控制台执行或者授权已连接的相关工具）：

1. 添加自有域名为 Cloudflare Zone 并按向导配置 DNS；如域名注册商与 Cloudflare 不同，则遵从向导切换权威 NS；切换前核对现有邮箱、其他站点记录是否会受影响。已有 Zone 则不必重复添加。
2. Workers & Pages → **仅** `miaowu-english-staging` → Settings → Domains & Routes → Add → **Custom Domain**，选择专门的测试子域名，如 `test.你的域名.com`。以上域名只是示例，不是已经注册或部署的真实域名。
3. 等 Cloudflare 自动创建 DNS 与 SSL 证书。**不修改 Worker GitHub build branch、不动数据库、不重复执行 007/008、不改已有 `workers.dev` 路由、不取消 reviewer 保护、不配置收费或发布开关**。
4. 在新域名上访问 `/`：若未带 reviewer cookie，显示 Basic 身份认证或 HTTP 401，说明服务端已可达（不代表已完成登录）；通过原预览口令，然后重新用读者账号登录，再测试 `/api/auth/me` 和 QA 读写链路。
5. 真实中国大陆**关闭 VPN/代理**，至少覆盖中国移动、电信、联通的三个出口；用手机 4G/5G 与宽带及不同城市复测，并记录 DNS 解析、HTTPS 建连、首屏加载、API 的 `/api/auth/me`、合法授权的 QA 阅读与保存。三网测速参考 https://www.itdog.cn/ 和 https://www.17ce.com/get （**不要把任何带会话 Cookie、密码、激活码或未公开章节的 URL 提交给第三方测试**）。
6. 成功标准：在多个时段/运营商中**不需要 VPN**，完成上述端到端读写流程，且没有明显超时、资源加载错误或频繁断连。单次测速 200/401 不足以证明整个产品稳定；`/api/health` 在 staging 下也会先被 reviewer gate 阻断（401 属于预期保护）。
7. 未通过时保留现有 staging 别名并停止域名上线，不把登录/支付/教材导入挪到未验收环境。

官方：Cloudflare Workers Custom Domains https://developers.cloudflare.com/workers/configuration/routing/custom-domains/；Cloudflare 官方推荐生产 Worker 使用自定义域名/Route 而非 workers.dev：https://developers.cloudflare.com/workers/configuration/routing/workers-dev/ 。

## 第二阶段（仅在第一阶段失败时）：可访问线路与架构迁移

- 优先评估香港/亚太面向中国大陆优化的稳定供应商，并以**真实大陆三网连通性测试**选择，不因机器位于香港就假定全部可达。
- 核心提醒：仅将 `public/` 静态文件放到其他服务器，而浏览器继续调用当前 `workers.dev` / D1 API，**登录、阅读、收藏、复习仍可能失败**。前端和身份/学习状态 API 必须通过中国大陆真实可达的 HTTPS 同源地址提供服务。
- 迁出 Cloudflare 时需规划完整等效后端与数据迁移：用户密码哈希 + 原 `ACTIVATION_PEPPER` 密钥保管/验证策略、会话迁移或重新登录、分类权益、书籍与章节、`reading_progress`、`user_words`、`review_events`、撤销/发布审计等；加密导出、隐私评估、备份/回滚和双环境比对。**严禁直接转存敏感数据到不明第三方服务，未经用户确认不进行任何搬迁。**
- 如果明确改为中国内地服务器或使用境内 CDN，则先按接入商流程完成 ICP 备案；涉及在线销售、学习服务及个人信息处理的资质与合规要求应再按实际商业模式核实。香港/海外主机通常不需要内地服务器的 ICP 备案，但不等于没有其他适用法规。参考华为云 https://support.huaweicloud.com/qs-icp/icp_07_0004.html ；Cloudflare China ICP https://developers.cloudflare.com/china-network/concepts/icp/ 。

## 关于上线时间顺序

- 开发与 S10 功能验收可以继续进行，不因目前仅 `workers.dev` 受限而丢弃已测试架构。
- **商用前必须真实完成**独立域名、无 VPN 多网络验收、版权/内容审核、权益/支付/售后与相应合规。不能把自定义域名当作绕过网络限制的保证。
- 当前第一项用户配合：**是否已经购买/拥有一个准备给“妙屋英语”使用的域名？** 若有只需提供域名文字（不提供登录凭证）；若无先讨论品牌域名与低成本采购。此问题决定能否继续配置真实 Worker Custom Domain。
