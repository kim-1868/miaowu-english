# S13：分类权益兑换码发货与订单核对（离线安全工具）

更新时间 2026-11-01。**此文是开发/验收说明，不代表已接入真实支付或已经发出任何商业兑换码。**

## 产品边界已确定

- **按学习类别授权**（不是按小说单本卖）：四级 `cet4`、六级 `cet6`、考研 `postgrad`、雅思 `ielts`。
- 一枚兑换码只开通一个类别；同一读者账号可以积累多个类别权益。同类别未来新增已发布小说，按现有服务器权限规则自动可读，须在商品页说明更新范围及有效期限。
- **高中英语 `high-school`、专升本 `zhuanshengben` 仍是未来规划**。已在 `config/activation-categories.json` 标注 `salesEnabled:false`，不允许离线工具发码。真正上架新分类时，需要先独立审核类别内容、D1 中类别记录与商家承诺，再把它改为 true。
- **当前注册流程必须使用兑换码；尚未提供无需激活码的免费账号注册。** 尚不能据此销售或宣称网站具备账号找回。

## S13 新增的离线发码流程

0. 必须先有**已实际确认收款**的商户订单；此脚本不会请求银行/支付通道，`payment_confirmed=YES` 只是运营人员对外部收款的人工确认，不是自动支付验证。
1. 在开发机本地生成 `private-input/paid-orders.csv`。只能包含不携带姓名、手机号、邮箱等敏感个人信息的**商家自定义匿名订单编号**。内容严格如下（示例均虚构，**不可认定真实已付款订单**）：

```csv
order_reference,category_id,payment_confirmed
ORD-20261101-EXAMPLE001,cet4,YES
ORD-20261101-EXAMPLE002,ielts,YES
```

2. 用与**目标数据库后端 Worker 完全一致**的 `ACTIVATION_PEPPER` 在安全的操作者终端执行；**不要把密钥打到 ChatGPT、GitHub、截图、日志或 Windows/Mac 的命令历史里**。推荐先通过本地、被 gitignore 的私密环境设置方式，把密钥以环境变量提供给当前进程，勿把它直接写进展示命令；不要使用 staging 密钥生成正式码。

```bash
node scripts/fulfill-voucher-orders.mjs --orders private-input/paid-orders.csv
```

3. 生成在**本地** `private-output/`：`voucher-inventory-<run-id>.csv`（**唯一含明码文件**，仅供安全交付）、`voucher-d1-import-<run-id>.sql`（仅 HMAC 摘要、分类与匿名订单编号）、`fulfillment-ledger.json`（**不含明码**，记录订单已经发码）。这两个目录全部被 `.gitignore` 忽略。
4. 正式导入 SQL 前必须验证：(a) 新建生产 D1 的 schema 和对应分类已经存在，(b) 在**仅生产库**部署 `db/production/001_one_paid_order_one_code.sql` 唯一索引，确保数据库拒绝同一 `order_reference` 两码，(c) 脱离公网页面审批，(d) 严格审核导入命令和目标 **database_name/database_id**。**工具不会替你执行任何 D1 导入或收款、不会在新项目自动部署。**
5. 用户收到私有兑换码，在自己的网页账号注册/激活后，服务端只读取 code_hash 兑换并关联对应分类。不得在公开订单页面、截图、社交媒体、群聊公开明码。

## 安全策略与故障恢复

- 仅允许已明确批准发码的四个类别；重复订单、未人工确认付款、CSV 内容异常、订单编号包含疑似邮箱/注入字符串，均失败停止。
- 每个运行批次**先写入私有 ledger 并把订单保留为 prepared**，之后才生成库存/SQL，全部成功后标记 issued。对已 issued 或 prepared 的订单禁止直接重新发码。
- 已存在 `fulfillment.lock` 时，工具拒绝并发运行或未经核验重复操作。**进程崩溃后可能留下锁或 prepared**；应由运营人员核对输出文件与 D1 记录，不能随意删除锁/ledger 或重复发码。工具的 prepared→issued 不是跨文件与 D1 的原子事务；不能替代运营事故恢复步骤。
- `fulfillment-ledger.json` 仅在这台电脑/工作区内防重；**若另一台电脑也发同一订单，必须依靠生产 D1 的订单唯一索引和统一运营台账防重**。不要把本地脚本的“幂等”误认为已接入支付平台。
- 当前设计是一笔商家订单最多发一枚分类码；多类别购买，应由外部订单系统拆成多个唯一匿名订单引用。退货/售后、未兑码作废及已兑权益撤销需要后续管理员流程。
- 对库存 CSV/私有 ledger 做设备访问控制、备份与定期核对；一旦遗失含明码文件，不可从 HMAC 恢复，须按订单核对并办理安全撤销/重新发货。
- 上线前仍需完成正式 D1 隔离、商品说明、账号恢复、用户协议、完整教材校对及国内多运营商访问测试。

## 自检

```bash
npm run check
npm test
```

自动测试使用完全虚构的假订单与强度达标但无效的测试 Pepper，只在临时目录和内存 SQLite 里生成票据，不操作 Cloudflare、不暴露真实用户/付款记录。用 `db/production/001_one_paid_order_one_code.sql` 的真实 SQLite 唯一约束再次验证相同 SQL 不能重复导入。
