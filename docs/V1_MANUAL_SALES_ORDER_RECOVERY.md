# 妙屋英语｜人工售卖与订单密码找回 V1

## 已实现的产品行为

- 商品选择：在操作者本地执行 `node scripts/issue-manual-paid-order.mjs`，选择允许发码的类目（CET4/CET6/考研/雅思）。只有**已经可以兑现实际内容**的类目才允许实际售卖；类目出现在选择菜单不代表已经上架或内容完成。
- 一个真实确认收款的订单只对应一枚高随机性分类激活码；新的订单同时有独立的 `MW-REC-` 订单找回凭证。
- 激活码在生产 D1 的 `activation_codes` 表中初始为 `unused`，使用成功后标记 `redeemed`，记录 `redeemed_by`、`redeemed_at`；已使用的码不能再次兑换。数据库的唯一订单索引可拒绝同订单二次发行。
- 找回：用户输入自己注册的用户名、真实小红书订单号、该订单的独立找回凭证、新密码。**不能仅凭订单号修改任何账号密码。**
- 重置成功后，所有旧设备会话失效，旧找回凭证失效，新凭证只向用户展示一次。已购分类权限和学习记录不会变化。旧订单无找回凭证时，采用人工核验。
- 不接入短信、邮箱或小红书订单 API；确认付款仍由商家在小红书官方订单界面人工完成。不可把付款截图当作真实到账证明。

## 关键生产部署阻断条件（按顺序）

1. 不要重新初始化生产 D1，不要更换现有 `ACTIVATION_PEPPER`。
2. 确认生产 D1 为 `miaowu-english-prod`，先备份，再经审查**只执行一次**增量迁移 `db/production/003_paid_order_recovery.sql`。若表已存在，只做只读校验，不再重放。**不得对测试 D1 执行此生产迁移**。
3. 在操作者自己的安全终端中使用**与生产 Worker 完全一致的现有** `ACTIVATION_PEPPER`。不要将密钥发送到聊天、GitHub、截图、命令历史；如果没有安全保存密钥，不要尝试猜测、读取 Secret 或重置生产密钥。应先开发/启用使用 Worker 内部密钥的受保护商家发码操作。
4. 实际确认小红书订单已付款且商品可交付后，在本地仓库运行：

   ```bash
   node scripts/issue-manual-paid-order.mjs
   ```

   工具询问商品类目、订单号，并要求输入 `PAID` 确认。它在 gitignore 的 `private-output` 中写入三类数据：
   - `voucher-inventory-<批次>.csv`：**含明文**订单号、分类、激活码、独立找回凭证，必须妥善保管，只私下发送给对应买家
   - `voucher-d1-import-<批次>.sql`：只含 HMAC 哈希，用于安全导入**生产** D1
   - `fulfillment-ledger.json`：不含明文码，防止本台电脑重复发同订单

   注意：**脚本生成文件不等于成功入库或发货。**
5. 审核并在 Cloudflare D1 的 **正式生产库**中导入本笔订单的 SQL。随后执行只读校验：

   ```sql
   SELECT a.category_id,a.status,a.redeemed_at,a.redeemed_by IS NOT NULL AS assigned,
          a.order_reference,r.reset_count
   FROM activation_codes a
   LEFT JOIN order_recovery_credentials r ON r.code_id=a.id
   WHERE a.order_reference='ORD-在此填写经核对的真实订单号';
   ```

   只返回这一笔订单的对应分类，`status=unused`，且存在 `reset_count=0` 的找回凭证记录后，才可发码。不能把用户密码、激活明码或找回明码保存到共享数据库/文档。
6. 代码正式发布后，只有在迁移完成并验收后，才将 Worker 生产变量 `ORDER_RECOVERY_ENABLED` 设为 `true`；否则找回 API 返回 503，不对用户开放。部署仍按已有手动审核 SHA 流程，**不由脚本自动部署**。
7. 上线前必须进行生产级人工验收：两笔不同类目订单、重复订单、重复激活、未激活订单不能找回、错误订单号、错误凭证、旧凭证重放、旧会话失效、已购权益及收藏学习进度保持不变、频率限制、断网后状态核对。正式订单明码不要用在测试日志里。

## 用户发货文案（私聊使用）

```
你好，已收到妙屋英语商品订单，以下信息请仅自己保存：

学习网址：https://miaowu-english-pages.pages.dev/
购买商品：<已核实的分类名称>
激活码：<仅本订单专用的一次性激活码>
订单找回凭证：<仅本订单专用的MW-REC凭证>
小红书订单号：<购买时的真实订单号>

首次使用：打开网站，选择「注册并激活」，设置用户名和密码，输入激活码。
之后使用：使用用户名和密码登录。
忘记密码：在登录页点击「忘记密码？订单找回」，输入用户名、订单号和找回凭证重新设置密码。

请保存订单号和找回凭证；每次重置密码后原找回凭证会自动作废，并产生新的凭证。
如找回凭证遗失，请联系官方售后人工核验。
```

## 退款、异常与旧订单

- 已交付但未兑换与已经兑换的订单需采用不同售后核验；退款和撤销用户权益**尚未做自动化**，不能擅自删除已使用码或用户数据。
- 工具本地的 `issued` 状态是已经生成私有库存，不代表 SQL 入库、消息已发出或者买家已兑换。要以生产 D1 与小红书消息记录进行核验。
- 旧订单若之前只发过激活码，没有 `order_recovery_credentials`，不能绕过安全校验，也不能通过订单号单独重置。继续人工核验。
- 生产密钥不匹配、迁移缺失、支付未确认、订单台账不一致，任何一项存在时立即停止发码。

## 相关文件

- `scripts/issue-manual-paid-order.mjs`：按类目选择并生成单订单私有发货文件
- `scripts/fulfill-voucher-orders.mjs`：底层离线订单发码，含独立找回凭证
- `db/production/003_paid_order_recovery.sql`：生产增量迁移
- `src/worker.js`：`POST /api/auth/recover-by-order`，受生产配置开关保护
- `public/app.js`：忘记密码订单找回界面，失败可选择人工找回
