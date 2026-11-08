# 妙屋英语 V1.1（01–04）正式部署：生产 D1 准入与人工操作记录
> 2026-11-08，禁止将实际 Time Travel Bookmark ID、API Token、运营密钥、订单、读者数据写入本文件或 GitHub。

## 状态
- 用户授权正式站同步 01–04；独立 V42 生产候选为 Draft PR #192。
- 离线验证 466 项 / 465 通过 / 0 失败 / 1 跳过，默认 43 资源，公告版 47 资源；正式 Worker 编译 dry-run 通过。
- GitHub 已有 CF 凭证可以读取生产 Worker 元数据，但 D1 Time Travel CLI 读取失败；**未执行任何生产 D1 SQL、备份导出、Cloudflare 生产发布**。
- 用户已通过 Cloudflare Dashboard 的 D1 Time Travel 页面生成恢复书签。**书签只由用户私下保存，不得回写到源码、issue、CI 输出；7 天有效窗口以用户的 Cloudflare 页面为准。**
- 必须分别通过 ① D1 读写前置检查 ② 持久独立备份/恢复方案 ③ 增量 015 公告表创建 ④ 限定正式发布静态+Worker+公告开关 ⑤ 发布后游客/运营/学习全链路验证。任何一项不能完成则不声称全站上线。

## A. 站长在 Cloudflare Dashboard 对真实生产 D1 做只读核对（不修改任何数据）
1. Storage & databases → D1 SQLite Database → **miaowu-english-prod**。核对名称、UUID 为 `649c71b3-340c-49bf-b806-3d39256851d3`，不要操作 miaowu-english-test。
2. 进入 Console，仅执行下面这条只读 SQL（只返回表存在状态，不返回用户数据）：
```sql
SELECT
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_operators') AS ops_operators_present,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='ops_audit_events') AS ops_audit_present,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='site_announcements') AS notices_present,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users') AS users_present,
  (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='books') AS books_present;
```
3. 正常预期 `ops_operators_present=1`、`ops_audit_present=1`、`users_present=1`、`books_present=1`；公告表如还没有，应为 `notices_present=0`。不符合则**停止**并先审查数据库，不执行 DDL。
4. 用户无需发送 Time Travel Bookmark 原值；只上传此只读结果截图即可。

## B. 真正执行 DDL 前的回滚保护
- Cloudflare 的 Time Travel 是当前账号原生恢复机制；书签是短期恢复位置，不应视为永久的单独 SQL 备份。恢复将覆盖从书签到恢复时刻间的**整个生产数据库**，包括后续订单和学习记录，故须在没有未处理写入风险的发布窗口操作。
- 建议在管理员有权限的本机导出一份加密保存的正式 D1 SQL 副本，文件不要上传公开 GitHub：
```sh
npx wrangler d1 export miaowu-english-prod --remote --config deploy/production.wrangler.jsonc --output=./miaowu-english-prod-backup.sql
```
  此命令需本人授权账号与足够的 D1 Read 权限；导出可能暂时影响数据库查询，需选择低流量窗口。确认文件非空并可解析；绝不能把备份、授权 Token 或用户信息放到 Actions artifact / PR。
- D1 Console 的 Time Travel “Restore database”按钮**绝不能作为备份操作**使用。

## C. 经人工核对和备份后，才创建独立公告表
- 已审核的加表脚本仅为 `db/015_v11_site_announcements.sql`，包含 1 张表和 2 个索引；无任何 UPDATE/DELETE、DROP 或用户/书籍/订单表的写入。
- 站长可在确认真实生产数据库、备份就绪、A 检查正常后，由 Cloudflare D1 Console 人工粘贴脚本执行。不能通过当前 GH Token 自动迁移。
- 执行后仅运行只读查询：
```sql
SELECT name,type FROM sqlite_master
 WHERE name IN ('site_announcements','idx_site_announcements_public','idx_site_announcements_admin')
 ORDER BY name;
```
  预期 3 行：1 table + 2 index。还可 `PRAGMA table_info(site_announcements);` 检查列结构。
- 不能复制预览站演示公告或预览 Secret 到正式库。

## D. 发布顺序及可逆策略
- 核对当前线上 Worker 活动版本确实来自 V42 或与 PR #192 适配；若不一致重新做合并差异和验收。
- 将独立版 GitHub 最终 SHA 锁定并复跑完整 CI。
- 确认 OPS_CONSOLE_ENABLED 与正式发布者权限。公告 API `OPS_ANNOUNCEMENTS_ENABLED` 默认未启用；未授权前返回 404/403。
- **必须显式使用** `node scripts/build-production-assets.mjs --approved-announcements` 构建 47 资源，否则默认 43 资源会移除公告 UI。
- 确认 015 schema 和安全配置后，再由经过授权的生产发布入口部署 `miaowu-english-production`；发布时确保 `OPS_ANNOUNCEMENTS_ENABLED=true` 已在生产绑定显式启用。禁止将 staging vars/D1 绑定复制进生产。
- 先检查游客页面显示（初始无公告时前台不错误）、更新日志、正常小说页、下章进度、词卡发音、生词本、已购和付费墙；再经正式发布者密钥创建/发布**新公告草稿**并验证可关闭/历史和撤回。
- 故障优先回滚 Worker 静态资源与 feature flag，停止新公告写入；只有在确认不会丢失其它生产增量数据且其它办法失败时，才在授权下考虑 Time Travel 全库恢复。恢复动作不在此 PR 授权范围内。

## 需保存的审计信息（只保存非敏感元数据）
- 最终部署时间、正式 Worker 部署 ID、发布 SHA、CI URL、公告开关状态、DDL 是否执行/校验结果。
- **绝不**记录 D1 Bookmark 原文、用户敏感数据、密钥或 Pepper。

## 发布状态
**PRODUCTION_NOT_DEPLOYED / D1_SCHEMA_NOT_MIGRATED / USER_BOOKMARK_RECORDED_PRIVATELY.**
