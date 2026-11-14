# V1.2 · 020 义项级测试库迁移人工流程

019 已在 TEST D1 成功完成（run #43050271102）。020 的只读核验（run #43051777498）及独立加密备份（run #43051777598）成功。

## 020 执行前必须满足
1. 仅 TEST 库 `miaowu-english-test`，ID `88a817cb-23bb-4ae4-bcb8-92286c4165d4`。
2. 下载备份 Artifact `v12-staging-020-post019-encrypted-full-backup`、**真正保存离线副本与口令**，不要把密码交给 GitHub issue / 聊天 / 公开仓。备份 run 与 artifact ID 必须属于同一成功、尚未过期、完成时间在24小时以内的 POST-019 backup；过期必须重新做新备份。
3. 使用分支 `feature/v11-smart-vocab-preflight-20261109`，工作流 `v12-sense-020-staging-manual-migrate.yml`，必须经过 `staging-d1-schema-approval` 独立审批。main 只能有无写入占位工作流。
4. 工作流启动后严格核验权限、备份 provenance、commit 祖先、安全备份时效、测试库 UUID、020 SQL 合成复演、远程迁移前 post-019 baseline、time-travel bookmark，才会执行一次 `db/020_global_dictionary_sense_study.sql`。
5. 迁移后校验 020 新两表、两索引、三条审核触发器，**0 新用户义项学习行**，旧书/旧词/旧用户学习/权限/订单汇总数完全一致，FK/quick_check 没有报错。

## 迁移后仍需继续
020 只是 schema，词头级019表仍处关闭状态；禁止自动对所有已有旧卡升级为已掌握。先商用词卡/例句/IPA和许可审核，后验证 Publisher 最新全书锚点；只有通过 sense_id 级审校，才能单独评估启用真实读写 API。正式站没有更新。

如果 GitHub 返回 Failed 或部分通过，**不要重跑或手动 D1 SQL**；先核查具体阶段与 Cloudflare time-travel。
