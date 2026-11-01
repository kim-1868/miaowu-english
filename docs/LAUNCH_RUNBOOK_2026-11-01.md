# 妙屋英语｜上线前安全接管与测试部署清单（2026-11-01）

> 状态：代码开发候选，**不是公开上线声明**。该文档是 Cloudflare 用户授权后的人工执行手册，不会自行部署、收费、发布小说或迁移数据库。

## 1. GitHub 状态和本次合并的功能

当前原有测试站来源分支 `dev/s1-auth-and-entitlements`；新开发为依次叠加的 Draft PR：

- #4 S9-A 运营人员权限隔离与审计；
- #5 S9-B 单人两步审核、按版本批准与原子发布（默认关闭）；
- #6 S9-C 运营出版台 UI、撤回影响检查、原子下架（默认关闭）；
- #7 原创《雨夜档案》12章规划 + 前2章36词私有校对包（**不可售，标题含【测试】**）；
- #8 V0.3 首页云端回声提示与夜间“返回书架”对比度。
  
仓库测试站原有的 S1–S8 不重做。**当前只合并为独立的测试候选分支，不更改 `main` 或 `dev/s1-auth-and-entitlements`，也不自动修改 Cloudflare**。请在 staging 实机确认后再按审查流程合并对应 PR。

## 2. 将 Cloudflare 测试站升级前的先决条件（需要用户 Cloudflare 控制台操作）

1. 确认 GitHub 候选分支最新 SHA 的 Actions 全绿。进入 Cloudflare → Workers & Pages → `miaowu-english-staging` → Settings → Builds。核对当前 GitHub 构建来源，**不能改成 main 或正式生产分支**。
2. 先在 D1 `miaowu-english-test` 核实数据库 ID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`，以及 `001–006` 的已有表与列。谨防与其他 D1 或未来正式生产 D1 混用。
3. 在安全的控制台查询：`PRAGMA table_info(books);`、`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;`、`SELECT name FROM sqlite_master WHERE type='table' AND name='d1_migrations';`。**不要通过聊天发回账户密码、Token 或用户数据**，只需告知是否存在 `last_release_request_id`、`ops_operators`、`ops_publication_approvals`、`editorial_revisions`、`word_categories` 与迁移历史。
4. 确认 D1 Time Travel 可用，保存恢复书签/备份；需要针对测试库做非破坏性恢复演练。生产库操作前必须有独立备份恢复方案和验证。
5. 只有确认还未执行 007/008 且依赖 004–006 表都存在之后，按顺序、**仅对测试库**应用 `db/007_ops_identity_audit.sql`、`db/008_ops_release_workflow.sql`。008 含一次性 `ALTER TABLE`，不能重复执行或盲用 `migrations apply --remote`。如历史不明确，停止并对比 schema。
6. 将测试 Worker 的 GitHub build branch 指向经 CI 校验的独立测试候选分支，确认 `wrangler.jsonc` 中 `DB` 仍是 `miaowu-english-test`、`APP_ENV=staging`。等待 Cloudflare Deployments **Ready**，而不是仅看 GitHub Actions 成功。
7. 先保持 `OPS_CONSOLE_ENABLED` / `OPS_PUBLICATION_ENABLED` / `OPS_WITHDRAWAL_ENABLED` 都不设或 `false`。确认旧阅读、授权、复习、剧情回声、S8 速记正常后，再按专项安全演练流程启用运营权限。
8. 在 staging 单独配置 `OPS_TOKEN_PEPPER`（至少32字符的随机 Secret，与 ACTIVATION_PEPPER、S3_EDITOR_SECRET、production 都不同）。经密码管理器生成和保存；使用本地 `scripts/create-ops-operator.mjs` 临时生成测试运营人员及待检查的 SQL，在**测试库**插入身份。原密钥只在操作者本地保存，**绝不能发到聊天、GitHub、浏览器 localStorage**。
9. 若进行出版台 UI 演练，必须先为后台入口配置 Cloudflare Access 或等效二次入口保护，并验证无法由无权者直访后台静态页面及 `/api/ops/*`。随后才在**测试环境**逐一打开开关，使用完全原创、经实际核实、明确为测试的数据进行 publish/withdraw 演练。
10. 退出后关闭测试用发布与撤回开关，留存审计记录；绝不能发布 demo/QA/“【测试】雨夜档案”包。

## 3. 网站正式面向用户前不可省略

- **内容**：完整《雨夜档案》第一季12章，并校验发音、例句、词性、CET4适配、版权、插图、剧情逻辑；目前仅有2章私有校对稿，不得收费。
- **前端**：实测 V0.3 原版对照、夜间模式全站、封面原色、手机、目录→云端正文→点词发音→速记→藏书票→剧情回声→跨设备；检查真实账号未经授权的付费直链返回拒绝。
- **收款**：先核实支付渠道、适用小红书类目准入与官方平台允许的交付流程；明确订单号→分类授权码发放→唯一兑换→退款/撤销的链路。无实际支付验证前不能显示“支付成功”、承诺自动发货或接入假支付界面。
- **商家与法律**：需站长填写真实运营主体与有效联系方式、服务有效期、商品内容清单、使用范围、隐私政策、用户数据删除/权利请求流程、售后退款与应急下架补偿规则。不要无依据承诺永久更新或必过考试。
- **生产安全**：独立生产 Worker/D1/Secrets；不要把 staging QA 书籍、账号和 reviewer 密码迁过去。生产管理员入口应启用 Cloudflare Access/MFA 并限制身份；排查错误日志是否泄漏个人信息。
- **备份恢复**：D1 Time Travel 书签和按实际套餐可用的恢复窗口，生产迁移前预演；备份需要可恢复性验证。
- **灰度**：可以先免费试读与少量真实体验反馈，完整商业支付和售后核验前不得公开售卖。

## 4. 已查阅官方规则（需在正式售卖时再次核对）

- 小红书《电子资源类商品管理规范》，2026-02-10 生效：
  https://school.xiaohongshu.com/rule/detail/26/119683
  对数字交付可追溯、权益/期限、知识产权和宣传有明确要求；并不保证本网站的“在线阅读权限＋激活码”可以归到普通电子资料类目。
- 小红书《电子资源定向准入及退出规则》：
  https://school.xiaohongshu.com/rule/detail/66682
  所列电子资源类目包括模版、课件教案和头像壁纸，并实行定向准入。必须以店铺后台实际可选类目与平台答复为准。
- Cloudflare D1 Time Travel：
  https://developers.cloudflare.com/d1/reference/time-travel/
- Cloudflare Workers Secrets：
  https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Access：
  https://developers.cloudflare.com/workers/configuration/cloudflare-access/

## 5. 当前首先需要用户协助的单一步骤

**只在 Cloudflare 控制台检查测试 Worker 的构建来源、最新部署状态及测试 D1 的 007/008 表/列状态，不执行迁移、不改主分支、不打开新开关**。返回截图时遮挡所有密钥/真实用户信息。确认后才执行上述 staging 更新和浏览器验收。

以用户提供的实际 Cloudflare 页面/结果为准，不能仅凭 GitHub 代码推测线上已部署。
