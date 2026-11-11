# 妙屋英语 V1.2 · 正式站当前小说元数据独立只读导出

现状：正式站配置 `deploy/production.wrangler.jsonc` 绑定 `miaowu-english-prod` / `649c71b3-340c-49bf-b806-3d39256851d3`，预览库 `miaowu-english-test` 完全不同。之前 staging 019/020 权限不可用于读取正式站。

已创建 **manual-only** `.github/workflows/v12-production-publisher-metadata-readonly.yml` 和独立 schema 检查。只 SELECT 三类元数据：书ID/分类/书名/状态与总计；章节ID/序号/发布时间/内容字节数；chapter_words 的章节ID/旧word ID/context_anchor。**不导出**小说正文 content_json、context_sentence、用户/订单/购买记录、密码或密钥。原始行不显示在 CI 日志，AES256 GPG 加密私密 JSON，仅保存加密 artifact 7天，需用户私密保存备份与解密口令。不得将加密秘钥发在聊天里或写入公共仓。

执行安全前置：
1. 设置 GitHub Environment `production-d1-readonly-approval` 的 Required reviewers（仓库owner）和限定 `feature/v11-smart-vocab-preflight-20261109` 分支；**如果没有配置 reviewers，环境并不会自动强制审批**。禁止在保护配置前运行。
2. 在 Cloudflare 为正式库创建**只读专用最小权限 API token**，保存 GitHub Secret `CLOUDFLARE_PROD_D1_READ_TOKEN`。不可借用拥有生产写权限的原有部署Token；若Cloudflare原生权限无法收窄到SELECT，则必须采用独立受控的只读代理，不应运行本流程。
3. 配置 `CLOUDFLARE_ACCOUNT_ID`（如果已经有则复用）和仅用于此用途的 `PRODUCTION_D1_METADATA_PASSPHRASE`（至少32字符、本人另外保存）。
4. 默认分支的 GitHub Actions workflow_dispatch 注册需要独立main安全占位且不可触库；开发分支真实脚本需按本PR审查，不能自动触发；人工确认后才会出现选项。

导出后仍**不是完整的小说内容快照**：它能判断线上确实有哪些书、章节及原词卡锚点；仅有字节数不能建立内容 SHA256、验证一段英文的上下文对应义项。要正式绑定义项仍须通过授权 Publisher 单独只读导出必要上下文，经过编辑签核并在预览站验证；本阶段不修改正式库、用户学习或已上架书，也不启用020写入。
