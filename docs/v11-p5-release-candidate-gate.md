# 妙屋英语 WordLetter V1.1 · P5 发布候选版本检查门禁

状态：网站 A 线离线发布预检，**并非正式发布批准**。不涉及小说 Agent V2、真实 D1 读写、账号数据或线上部署。

## 为什么需要

先前 009–013 迁移、SQLite 磁盘级恢复、匿名权益报表及完整回归都已在**虚构数据**上验证，但无法替代真实生产备份、读者/运营验收、内容义项审核及版本冻结。仓库 V1.1 总 PR #154 仍为 Draft；词义影子审核 PR #169 和 Agent 导入预检 PR #168 尚未合并。必须防止误将 CI 绿色视为已获正式发布许可。

## 已实现

- scripts/v11-release-readiness.mjs：直接重用代码库的 staging 和 production 配置验证器，核对 D1 UUID 不混用、preview/production 路由隔离、正式 workers.dev 关闭；仅检查仓库文件，不请求 Cloudflare。
- 输入候选版本的完整 40 位 commit SHA，输出当前缺少的七类证明：真实正式库备份、真实备份独立恢复、正式库只读数据与权益审核、词义人工审校、运营发码/兑换/恢复完整验证、iPhone 和 Android 真实学习流程、上一稳定版本及回滚负责人。
- 单独传入私有 JSON 元数据时，仅验证字段的结构、版本 SHA 和正式 D1 UUID、备份 SHA-256 引用是否相互一致。绝不输出原始账号、订单、备份本地路径或 API 秘钥；**不能验证填报来源是否真实**。
- 状态 BLOCKED_PRE_RELEASE（缺证据）或 METADATA_COMPLETE_REQUIRES_INDEPENDENT_VERIFICATION（字段齐备但来源未独立核实）；任何情况下均返回 productionReleaseApproved=false 和 permissionToDeployProduction=false。
- repo 的 release:v11:offline-check 增加 staging/production 静态配置隔离，继续运行本地备份→恢复、009–013 迁移、两份小说包引用检查、构建语法和完整单元回归。
- GitHub Actions v11-p5-release-readiness-offline.yml 在**不使用 Cloudflare 密钥**的前提下执行完整离线检查，并核对当前 CI SHA 仍标记真实生产证据缺失。

## 命令

在已完整检出的 V1.1 代码目录：

    npm run release:v11:offline-check
    npm run release:v11:readiness -- --candidate-sha <40位完整提交SHA>
    npm run release:v11:readiness -- --candidate-sha <40位完整提交SHA> --strict

第二条预期为“尚未达到正式发布条件”但退出 0，以便产出审计记录；--strict 在缺少任何证据时退出 1。可选 --evidence /PRIVATE/REVIEWED-METADATA.json 仅用于私有、人工审核后记录**证据元数据**，不要上传真实备份、账号、订单、验证码、用户名或密码，更不能将填写元数据当作用户批准。

对比路径：用户如果已经完成某项真实证据，必须在当前候选 SHA 对应的受控环境中重新核验。下一次推送改变 SHA 后，原账号/词义/UI/回滚验证不应被直接当作自动适用新版本。

## 剩余阻断

1. V1.1 的 PR #154 仍是 Draft；PR #168 仍在独立 Draft；旧 PR #169 已由合并的 #177 替代，但真实词义审核尚未完成，不能称发布候选已冻结。
2. 本轮没有获得真实 D1 的可恢复备份与 Time Travel 核验，也未在真实生产数据库执行只读审核。
3. 小说词义相同的候选不代表人工已经确认可合并；保留现有学习状态、词卡 ID 和读者权限。
4. 真实运营台与 iPhone Safari/Android 跨设备抽样仍需人工验收。
5. 正式发布必须对**固定 SHA、实际备份与回滚窗口**取得站长明确批准；不能由 JSON 元数据、GitHub CI 或泛称“继续推进”代替。

**安全规则：**没有明确的上线指令，不迁移生产 D1、不执行 Wrangler 远程命令、不触发 Pages 或 Worker 正式部署。
