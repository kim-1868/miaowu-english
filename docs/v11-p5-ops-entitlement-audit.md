# 妙屋英语 V1.1 · P5 运营台实际权益一致性门禁

范围：网站 A 线；运营台用户与激活记录、自助领码对账、读者套餐权益。**不改 Agent/小说、不迁移 D1、不改码、不触发正式站。**

## 问题

早期运营列表只查看 entitlements.revoked_at，但阅读权限实际还判断来源兑换码 activation_codes.status='revoked'。如果历史数据出现「兑换码已作废但旧授权行仍未同步撤销」，读者端已经不能阅读，运营列表却可能误报权益有效。

## 修复

- 用户列表 packages 使用与读者 userEntitlements 同样的来源已作废排除规则；没有来源兑换码的合法人工授权仍可保留。
- 激活记录 entitlement_active 同时要求授权存在、未撤销、来源兑换码未被作废。
- 自助领取对账 entitlement_active 同理；原 code_status、review_status、审核/作废/恢复动作不变。
- 与现行读者服务保持一致：来源未被标记 revoked 时沿用旧授权判断；若数据中来源 unused 却已有授权，属于独立人工核对问题，本次不擅自取消客户权益。

## 自动化验证

在完整 V1.1 开发代码执行：
- node --experimental-sqlite --test tests/s158-customer-redemption-view.test.mjs tests/s159-self-service-claims.test.mjs tests/v11-p5-rights-reconciliation.test.mjs
- npm run check
- npm test

新增测试用虚构订单、虚构账号、内存 SQLite 和实际 worker.fetch 请求，覆盖注册、领取、作废与恢复后读者权限和运营报告一致的判定。不读取真实用户资料，不创建可销售真实兑换码。

配套 docs/v11-p5-rights-reconciliation-readonly.sql 是只读八项汇总异常指标，包括遗留活跃授权、授权用户/类目不匹配、已兑换却无有效授权、异常审核状态等。不输出用户名、订单号、兑换码和密钥。SQL 依赖现有 self_service_claims 表，执行前先确认目标架构，不要直接对未知版本的 D1 执行。

## 上线门禁

1. 不能依据聚合审计自动作废/恢复/改绑权益，也不能删除旧客户订单和学习数据。
2. 不能将生产 SQL 导出或用户资料写入 GitHub 或 CI 日志。私有备份应在安全位置校验和隔离恢复。
3. GitHub 全部自动化通过，不等于生产真实备份可恢复；仍需实际恢复演练和运营抽样核查。
4. staging Worker 与正式 D1 隔离。部分运营端点只在 APP_ENV=production 条件下启用，因此针对运营 API 的离线测试以合成数据库运行，不能宣称 staging 操作过真实订单。
5. 正式发布须用户批准冻结的 V1.1 版本 SHA。普通“继续推进”不是生产部署授权。
