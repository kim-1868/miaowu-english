# P0 首批真实双书商用词义｜OPS 终审签发执行说明（2026-11-13）

## 为什么需要

真实两书/两旧词卡的技术来源与跨书关联已经确认。此前商业审核门禁只有“验证签名”，没有“给真正审核完成的材料签发凭证”的工具，导致即便内容经过审核也缺少进入 TEST 前置审计的可执行步骤。新增 scripts/v12-first-real-ops-receipt-issuer.mjs，运行于私有工作区，不连接 Cloudflare D1、不部署、不改旧卡，也不会自动填写任何审核项。

## 操作条件

只有在以下条件同时成立时才可签署：
- 原始私密的两书审稿 JSON 与独立编辑完成的 attestation；必须由本人实际校验双书同词义、英文/中文例句、US/UK IPA、原创与商业使用权的7类证据及10项检查。用户已确认故事与教学例句一般由妙屋/ChatGPT AI协助创作，这并不证明每张旧卡以及UK/US音标的具体来源。
- 受信任 OPS 服务已真实登记有 Publisher 角色的 Ed25519 公钥，私钥仅保存在受控操作工作站或秘密管理器；不能上传仓库、CI日志或聊天。
- 已由真实 OPS 服务签发审核事件的审计ID、实际操作者身份和审核UTC时间；测试/伪造审计ID不能使用。
- 如果 TEST 词典新来源尚不存在，可选择经过编辑签署的 new_owner_original_source 待登记方案，正式 TEST 创建前仍需现场冲突核验、数据库备份和明确写入权限。

本命令签名绑定原始正式词卡来源 SHA256、所选义项摘要、所有权利和编辑检查摘要、OPS审稿人员身份、实际审计事件、以及固定的 TEST 数据库 UUID。内容有改动或签名与独立可信公钥不对应，即不通过。

## 私密操作示例

从受保护的、未提交到Git的本地文件夹运行：

    export MIAOWU_OPS_ED25519_TRUST_ANCHOR_REGISTERED=true
    node scripts/v12-first-real-ops-receipt-issuer.mjs sign \
      /private/real-source-packet.json \
      /private/completed-attestation.json \
      /private/registered-ops-public.pem \
      /private/private-ops-signer.pem \
      ops_真实签核服务审计ID \
      2026-11-13T00:00:00Z \
      real_authenticated_publisher_identity \
      /private/signed-receipt.json

    node scripts/v12-first-real-ops-receipt-issuer.mjs verify \
      /private/real-source-packet.json \
      /private/completed-attestation.json \
      /private/signed-receipt.json \
      /private/registered-ops-public.pem \
      /private/verification-summary.json

注意：环境变量只表示调用者的声明，**本身不是OPS身份认证**。必须从可信 OPS 服务独立确认公钥、Publisher角色和对应审计事件，不能让签字人直接提交自己临时生成的公钥冒充已经授权。该工具生成的是受约束的签名凭证，其实际受理权利必须由服务端二次验证。CLI 的最终结果只是“具备 TEST 写前预检资格”，并不表示词义已在D1审批、入库或激活。生成收据绝不替代真实版权/编辑审核。

## 当前状态

真实词义权利与人工审校仍处于 HOLD。原32本加密来源与两卡精确核验、US IPA候选核验已完成。UK Britfone候选已经通过固定源码和MIT文件验证，但首批真实私密UK/US合并审稿作业仍在 #43278046192 的受保护环境等待；不要把公开合成数据通过当成实际私密词卡完成终审。

从现在起只需要 **一条商用词义内容审核与一个真正的OPS签核**（对应两本小说的2个旧卡链接），不必重复审两本小说相同例句。步骤1真正通过后才执行步骤2真实TEST D1导入，正式库不受影响。
