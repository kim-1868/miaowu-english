# S66｜《雨夜档案》逐项审核记录：可验证的私有进度表

**日期：2026-11-02。状态：基础网站已验收；小说及任何收费权限仍未获批准。**

已有离线审校台能浏览词卡、原文和练习题，但无法严谨区分“看过”、“要求返工”与“有证据完成了人的审核”。本轮新增**与原稿指纹绑定**的 JSON 审校进度表，面向后续真实编辑审核。

## 真实审校单位

- 188 条 `word:` 记录：覆盖词卡中的拼写、词性、中文释义、英中例句及词表来源候选（英/美 IPA 候选仍不等于授权）。
- 733 条 `context:` 记录：精确到 `rns1-chXX:pXX:sXX` 的实际单词片段，保留段落原文、义项及审查提示。
- 36 条 `echo:` 记录：精确到实际选中词汇锚点，包含题干和答案提示相关来源。

**总共 957 条，开始全部 `PENDING`；本轮没有伪造任何人的签名。**

## 在本机使用

在项目目录运行 `node scripts/build-rainy-night-review-ledger.mjs --summary`：只输出计数和来源摘要，不产生带原文的文件。

运行 `node scripts/build-rainy-night-review-ledger.mjs --write-private`：写入 `private-output/rainy-night-s1-HUMAN-REVIEW-LEDGER.json`，该目录不纳入 Git。为保护先前审校结果，如果文件已经存在，工具**拒绝覆盖**。

审稿人在本地 JSON 文件里逐条填写 `decision`（`PENDING`／`REVIEWED_OK`／`CHANGES_REQUESTED`）。`REVIEWED_OK` 或 `CHANGES_REQUESTED` 必须同时有可识别的 `reviewer`、UTC `reviewedAt`、至少12字符的具体 `note` 和 `evidenceRef`。不能修改稿件源字段、词条 ID 或源指纹。

完成后使用 `node scripts/build-rainy-night-review-ledger.mjs --validate-private private-output/rainy-night-s1-HUMAN-REVIEW-LEDGER.json` 审查是否漏条、重复、错 ID、过期版本、改动 sourceHash、补签痕迹不足等；只输出统计与错误，不传播私有正文。

## 核心风险控制

1. 每条记录单独计算 SHA-256 指纹，总稿件清单亦有指纹。修改任何对应源文案后，旧文件不可直接宣称属于新稿，必须重新核对受影响条目。
2. 校验仅验证**字段结构、来源绑定和审稿人员自填证据的完整性**，不能认证真实审稿人员身份或自动确认 IPA 的商业授权，也不排除主观错误。
3. 即使全部957条显示 `REVIEWED_OK`，**不会改变正式 `evaluateRainyNightPublicationGate` 的 BLOCKED 状态**，也不会给 Cloudflare 发任何请求、导入 D1、放行支付或公开新书。
4. **不要将私有JSON及带付费稿件内容的HTML上传 GitHub public、公开 Pages、客服附件或在线文档。** 可在受控本地进行后续编校。

后续可把浏览器里的人工审稿操作、安全导入/导出连接到同一版格式，审核过程不必再散落在零碎备注中。
