# 妙屋英语 V1.1 · P5 备份独立恢复演练（网站 A 线）

状态：仅完成本地虚构历史数据的恢复演练代码。正式 D1 真实备份及 Time Travel 恢复尚未核验。

本任务只处理 V1.1 网站上线安全门禁，不修改 Agent V2、小说内容或真实生产数据库。

## 两种不同验证

### 一、虚构测试库（自动化）

执行：
    npm run db:restore:rehearsal
    node --experimental-sqlite --test tests/v11-p5-backup-restore.test.mjs

流程生成虚构历史账号、授权、兑换码、小说、阅读进度、已掌握词卡及复习事件。在受限临时目录中创建真正的 SQLite 备份，关闭、重新打开，从备份复制一个独立迁移库，执行 009–013 并重复执行一遍；核实旧表全部行的指纹不变、外键及完整性正确。最后使用未改动的原始备份创建第二个独立恢复数据库，核对旧数据完整保留。退出时删除临时数据库文件。

### 二、可信私有 SQL 导出（未来需要正式来源）

执行：
    node --experimental-sqlite scripts/verify-d1-backup.mjs /PRIVATE/TRUSTED/backup.sql
    node --experimental-sqlite scripts/rehearse-v11-backup-restore.mjs --sql /PRIVATE/TRUSTED/backup.sql

仅当备份来自已经独立核实的真实 D1、数据完整且版本匹配现有 001–008 schema 时才可以运行。脚本不会下载或上传备份、不会请求 Cloudflare，也不会修改源 SQL。脚本执行的是本地 SQLite SQL，因此不要传入来源不明的脚本。临时文件夹为私有目录，生成的 SQLite 文件用 0600 权限，退出后清理。

自动化报告只包含整体指纹、表数量、结果标识及新增表名，不输出账号、订单、密码、兑换码和学习明细。运行私有 SQL 导出并不等于已经证明 Cloudflare Time Travel 真实恢复成功。

## 正式上线前的阻断清单

1. 单独确认当前正式 Cloudflare 账号、Worker、Pages 和 D1 UUID，锁定前后两个网站版本 SHA。
2. 通过官方 D1 备份/Time Travel 得到真实可恢复的数据版本；记录恢复点和负责人，不能把真实数据上传 GitHub 或发到聊天。
3. 在私有受控环境离线验证真实 SQL 导出与磁盘恢复，核实 users、activation_codes、entitlements、reading_progress、user_words、review_events 的完整行指纹。
4. 对历史权益运行 docs/v11-p5-rights-reconciliation-readonly.sql，仅汇总异常并人工审核，不能自动作废或恢复任何权益。
5. 完成人工发码、查单、作废/恢复、领取对账、账号协助恢复的业务回归；真实客户不得被破坏性测试影响。
6. 实际生产部署仍必须有用户针对固定发布 SHA 的独立明确批准；普通“继续推进”不是生产迁移授权。

## 边界

本地虚构库的磁盘恢复、重开、外键与旧数据保留由本轮自动化验证；真实正式 D1 本轮没有读取、下载、修改，正式备份恢复仍然是上线前强制阻断项。不要未经核对直接用旧备份覆盖生产库，因为那可能覆盖恢复点之后新增的真实订单和学习记录。
