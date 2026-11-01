# 2026-11-01｜Cloudflare D1 测试库私有导出与离线恢复验收

**此阶段操作员：Cloudflare 账户拥有者本机。** GitHub 仓库/ChatGPT 仅保存检查工具和说明，不保存任何备份数据或鉴权材料。

## 当前事实

- 已保存 D1 `miaowu-english-test` 的 Time Travel bookmark，但书签不是长期离线备份。
- 截图确认 `editorial_review_signoffs` 已存在；`ops_operators`、`ops_book_content_versions` 和 `books.last_release_request_id` 尚不存在。
- D1 的 `d1_migrations` 表不存在，**绝对不要执行完整远程 migrations apply**。
- 当前 Cloudflare Worker 的 build branch 不应改变，直到本轮备份和安全预检结束。

## 第一步：下载最新私有仓库（如果本地没有仓库）

GitHub 打开 `kim-1868/miaowu-english`，切换到 `dev/local-d1-backup-verification`，选择 **Code → Download ZIP**，在 Mac 解压后用终端 `cd` 到含有 `wrangler.jsonc` 的项目根目录。

该步骤只是取得项目配置与离线校验脚本；不要把 SQL 备份保存到这个 GitHub 仓库目录。

## 第二步：本机 Cloudflare 登录并核对目标

打开 Mac 终端（Terminal），在**项目根目录**依次执行：

```bash
node --version
npx wrangler login --device
npx wrangler whoami
npx wrangler d1 info miaowu-english-test
```

- 需要 Node.js。此版本仓库的本地检查需要 Node.js 支持 `node:sqlite`；建议使用近期 LTS 版本。
- `login --device` 使用 Cloudflare 官方设备 OAuth，不需把 API Token/密钥交给 ChatGPT 或保存到 GitHub。
- `d1 info` 确认是正确的测试库，数据库 UUID 应对应 `88a817cb-23bb-4ae4-bcb8-92286c4165d4`。
- 如果显示其他 Cloudflare account、数据库名或 UUID，**立即停止**，不要运行导出或迁移。

## 第三步：导出到仓库外的私有目录

导出是**读取远程完整 schema + 数据**，可能短暂阻塞该数据库的其他请求。选业务低峰时执行。

```bash
umask 077
mkdir -p "$HOME/Documents/MiaowuPrivateBackups"
npx wrangler d1 export miaowu-english-test --remote --output="$HOME/Documents/MiaowuPrivateBackups/miaowu-english-test-2026-11-01.sql"
```

*如果 CLI 提示确认数据库 ID，请再次核对数据库名称、UUID 与当前 Cloudflare 测试库一致。*

- 备份文件可能包含登录密码哈希、用户数据、激活码和其他敏感信息：**不能**上传至 GitHub、聊天、邮件正文或公共网盘；由本人加密保存。
- 禁止 `--no-data`：那只导出空表结构，不是可恢复备份。
- 不要将导出文件放到 `public/`、`content/`、`docs/` 或项目工作目录内。
- 如 Wrangler 报错，停止并检查具体错误；不要改为执行其它远程 SQL 指令尝试修复。

## 第四步：独立离线恢复到内存数据库核验

导出完成后运行：

```bash
npm run db:verify-backup -- "$HOME/Documents/MiaowuPrivateBackups/miaowu-english-test-2026-11-01.sql"
```

该命令在你**本机内存**里重新执行备份 SQL，检查 15 个必需历史表、SQLite integrity_check、foreign_key_check，并计算备份 SHA-256。仅输出各关键表**记录总数**与成功/失败状态；不会打印账号、密码、激活码或正文。需要 Node 版本支持 `node:sqlite`（与仓库 CI 使用的 Node 一致）。

理想输出包含 `verified: true`、`integrity: "ok"`、`foreignKeys: "ok"`；如果未通过：**不能进行 007/008 迁移**。请只告知错误代码，切勿粘贴导出的 SQL、Token 或数据。

验收成功后，把备份文件转存至加密存储（例如 macOS FileVault 加密磁盘/私有离线设备），保留文件 SHA-256 与导出日期。

## 第五步：远程操作的安全门槛

只有完成：
- [ ] 书签已由用户保存；
- [ ] 完整独立 SQL 导出存在；
- [ ] 离线完整性、外键和必需历史表检查全部通过；
- [ ] 已再次核对测试 D1 UUID、007/008 尚不存在；
- [ ] staging 迁移流程与回滚设计由用户确认；
才允许进入下一阶段——**仅测试库**的 007/008 定向增量升级；仍不允许 `wrangler d1 migrations apply --remote`。

正式生产、付费、发布开关不在此操作范围内。

## Cloudflare 官方参考

- [D1 导出与导入](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
- [D1 的 Wrangler 命令](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Wrangler OAuth 登录](https://developers.cloudflare.com/workers/wrangler/commands/general/)
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
