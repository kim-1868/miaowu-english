# V1.1 P5：恢复后的订单/兑换权益一致性检查（网站 A 线）

状态：本地自动化开发完成，待完整 CI 与隔离测试验收。**没有访问或修改正式 D1，也没有获得 V1.1 正式发布批准。**

## 目标

前一批磁盘备份恢复工具已经能核对旧表原始记录、009–013 增量迁移和再次独立恢复，但尚未将订单、兑换及权益运营判定纳入恢复证据。本批新增严格只读的恢复权益审计，复用已经审查过的 docs/v11-p5-rights-reconciliation-readonly.sql，而不构造新的运营数据库写入路径。

## 实现

- scripts/v11-restored-rights-audit.mjs：读取本地 SQLite 已恢复数据库，返回八项匿名聚合计数，不暴露用户、订单、兑换码、IP 或密钥。原 SQL 为 SELECT/UNION ALL 查询，不包含写入语句。
- 若历史备份还没有 self_service_claims 表，只计算七项指标，第八项返回 null，强制标识为待人工补充审核，不能显示“全部正常”。
- 数据中如存在“作废兑换码仍有关联旧授权、授权用户/类目不一致、已兑换无匹配权益、核验过的领取记录却关联已作废码”等问题，仅返回指标名和数量；不自动修复或下架。
- scripts/rehearse-v11-backup-restore.mjs 的本地备份恢复流程现在会在源副本、009–013 增量迁移后及独立恢复后的三个时间点比较权益汇总：**允许保留原有异常，但禁止迁移产生新的异常数量差异**。
- 测试使用虚构账户、虚构兑换码、本地数据库和只读查询；返回结果始终标记 productionReleaseApproved=false。

## 离线执行

    node --experimental-sqlite --test tests/v11-p5-restored-rights-audit.test.mjs
    npm run db:restore:rehearsal
    node --experimental-sqlite scripts/rehearse-v11-backup-restore.mjs --sql /PRIVATE/TRUSTED/backup.sql

最后一条仅适用于将来经过核实来源、严格私有保存的可信 SQL 导出；本轮没有真实正式库导出，因此不能称为“实际生产 D1 备份恢复通过”。

## 正式上线的剩余阻断项

- 确认正式 Cloudflare Worker、Pages、D1 UUID 和受控访问权限。
- 正式 D1 实际备份及 Time Travel 可用恢复点，独立恢复演练。
- 私有只读权益审计和异常人工处理，旧订单/发码/兑换/作废/恢复的非破坏性验证。
- 跨设备读者实测、词义候选人工审核和 V1.1 冻结 SHA 版本检查。
- **用户对固定正式发布版本的独立明确批准**。不能将“继续开发”视为正式迁移或发布授权。

特别注意：出现权益历史异常时不允许自动取消客户权益；数据库整体回滚可能覆盖备份时间点之后新增订单和学习记录。
