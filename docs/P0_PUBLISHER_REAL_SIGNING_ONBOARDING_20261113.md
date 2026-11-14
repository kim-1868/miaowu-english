# P0 首个真实 Publisher 签核：最短操作手册（TEST Only）

**进度依据**：TEST D1 的 021 结构已 [真实成功](https://github.com/kim-1868/miaowu-english/actions/runs/43397904258)，隔离预览站包含未启用 OPS 签名代码。本文不代表已审批任何词卡。原付费材料仍留在受保护环境。

## 最短执行路径

1. **真实 Publisher 身份已经存在且有效**：有实际 `ops_operators` 表中 `role=publisher`、`environment=staging`、`is_active=1` 的账户及其自己的 `mwops_...` 私密凭据。受控启用工作流会对 TEST D1 只读核对这项，绝不替用户新建账号或伪造审核人员。现有 Reviewer、顾客登录、预览 Basic 密码不能冒充 Publisher。
2. **Publisher 在自己的电脑本地生成 Ed25519 密钥**：从本仓库 checkout 到包含本功能的 feature 分支，在安装 Node 22 的自己电脑上运行：
   ```bash
   node scripts/v12-ops-publisher-local-onboarding.mjs init "$HOME/.miaowu-ops-publisher-20261113"
   ```
   该工具仅创建私密目录及 `publisher-private.pem`、`publisher-public.pem`、`publisher-public-fingerprint.txt`。**不要提交私钥到 GitHub、Cloudflare、聊天、或发给 AI**。单独备份并限制其他用户读取。命令输出的一行 SHA256 指纹是**公开信息**，可用于下步手工配置。绝不能对未授权内容执行签名。
3. **受保护部署，激活 TEST 预览站桥接**：GitHub Actions 的 `P0 real OPS Publisher signing bridge STAGING enable (protected)` → `Run workflow` → 选 `feature/v11-smart-vocab-preflight-20261109`，填本地 `publisher-public-fingerprint.txt` 的 64 位小写指纹、`confirm_target=miaowu-english-test`、`confirmation=ENABLE_TEST_ONLY_PUBLISHER_BRIDGE`。通过 GitHub `staging-d1-schema-approval` 审批后，工作流会**先用真实 TEST D1 只读验证有有效 Publisher 及 021 已安装**，然后仅部署 **miaowu-english-staging**（固定 TEST UUID）、将 OPS bridge 标志设 true；SRS 写入仍 false。没有真实有效 Publisher 或已登记其他活跃公钥，工作流拒绝部署。该流程不执行数据库迁移、批准任何词卡或触及 PROD。
4. **Publisher 自己在本地注册公钥**（只有成功启用预览桥接后）：
   ```bash
   # 在本地 shell 设置两个凭据，避免写入命令历史、Git 仓库和聊天。
   export MIAOWU_OPS_PUBLISHER_TOKEN='(自己的 mwops_... Publisher 凭据)'
   export MIAOWU_STAGING_PREVIEW_PASSWORD='(自己的预览站密码)'
   node scripts/v12-ops-publisher-local-onboarding.mjs register "$HOME/.miaowu-ops-publisher-20261113"
   ```
   在本地 shell 用安全的交互方式输入环境变量是更好的选择；不要复制真实凭据到任何远端或发给我。注册 API 必须同时验证预览 Basic、OPS Publisher 身份、独立配置的公开 Ed25519 哈希 pin，并在 TEST 的 `ops_audit_events` 创建可追溯审计。私钥不出本机。
5. **仅当首个义项真实完整审核后执行正式签收**：在拥有合法访问权限的机器上，将先前受保护加密审稿单解密到 Git 仓库外的私密目录。独立审核编辑/来源权利，在真实证据支撑下完成 7 类素材许可和 10 项语言准确性记录，确保任何疑问项保持 HOLD。审核完成才能执行：
   ```bash
   node scripts/v12-ops-publisher-local-onboarding.mjs sign-reviewed "$HOME/.miaowu-ops-publisher-20261113" "/PRIVATE/source-packet.json" "/PRIVATE/review-attestation.json"
   ```
   该命令先用既有 `evaluateRealPublisherClearance` 对所有权利与内容逐项做完整 fail-closed 检查；验证受信公钥已经实际登记；再以真实 OPS 身份取得不可变审核审计 ID，**只在本地**使用私钥产生 Ed25519 签名，然后由 TEST Worker 验证和保存收据摘要。命令不会上传付费正文，不会把签名私钥送往服务器。
6. **下一交付节点**：即使真实 Publisher 收据验证成功，它仍只具备 `TEST_PREFLIGHT_ONLY` 效力，不是词卡已上线。必须经独立的真实词义来源/语言/碰撞、可恢复备份和 TEST 写库批准，才能将那一个义项真实绑定双书并在 staging 阅读器 A 学 → B 读同一 `sense_id` 做 E2E。

## 安全与故障快速定位

- 开关默认关闭 → `OPS_PUBLISHER_BRIDGE_DISABLED`；没有指纹 → `OPS_PUBLISHER_TRUST_CONFIG_REQUIRED`；没有已授权 Publisher → `OPS_AUTH_REQUIRED` 或 `OPS_PUBLISHER_ROLE_REQUIRED`；公钥不匹配 → `OPS_PUBLISHER_KEY_NOT_IN_INDEPENDENT_TRUST_CONFIG`。
- 新增审计绑定 **审核摘要 + 来源摘要 + 具体义项 SHA + 编辑身份 + TEST D1 UUID**。即使签名数学上有效，不能挪用审计 ID 去签别的义项、来源或审核人。
- 不能从正式站执行；`APP_ENV=production` 一律 404。不得改读者端 SRS、用户学习状态、小说原始数据。
- 如果需要撤销 Publisher 密钥，应由有权管理员独立进行不可逆的 `is_active=0` 等审计处理；不能删除已存审计。
