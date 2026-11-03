# 《雨夜档案》正式内容审核交接包（私有）

**本资料并非正式已上架作品，也未授权对生产数据库执行SQL。**

## 此压缩包包含

- `rainy-night-ipa-offline-review.html`：用 Chrome 本地打开的188词逐词审核台，不联网、不上传文件
- `rainy-night-188-IPA-PREFILLED-OWNER-SIGNOFF-REQUIRED.json`：包含英美音标和词卡信息的预填表，**未获得真实人工批准**
- `rainy-night-188-IPA-AI-DRAFT-NEEDS-REVIEW.json`：音标来源、英式发音合成候选、英文重音选型和可疑词说明
- `rainy-night-12-chapter-high-density-UNREVIEWED.json`：12章完整私有高密度正文候选
- `rainy-night-sentences-REVIEW-ONLY.json`：长句级待审查清单；包含完整原句，不得放到公共网页
- `release-review-summary.json`：词卡、正文、章节与发布前质量门禁摘要

## 对站长的具体操作

1. 在有安全浏览器的设备**解压此包**，本地打开 `rainy-night-ipa-offline-review.html`。
2. 在工具中载入 `rainy-night-188-IPA-PREFILLED-OWNER-SIGNOFF-REQUIRED.json`。
3. 核对188个单词在真实原文中的词性、UK/US音标、中文释义和双语例句。特别注意 record/suspect/insert/separate/duplicate 等音标不同的词性，以及7个英式缺源词。
4. 只在**真实核验原始词形和商业使用许可**后填写来源、审核记录、审核身份，点击该词的「确认本词已人工审核」。可分批导出 JSON；尚未审核完毕不得认为整批通过。
5. 通读12章候选，逐条检查 `rainy-night-sentences-REVIEW-ONLY.json` 的句子自然度问题、小说细节、词汇解释及习题。证据不足的项目不能人工签字。
6. 审核真正完成后，将**私下保存的最终 JSON**交给安全的生产D1受控更新流程。勿把私有正文、运营密钥、核验信息上传公开网站或粘贴到聊天中。
7. 更新 D1 的12章和章节词汇索引，保证用户账户/收藏/购买权益不受影响；重新核验正式运营后台就绪报告，再做线上发布。

## 发布前硬阻断

- 当前D1正式图书仍是12章/733锚点的旧草稿，未升级为本包1892锚点的高密度稿
- 188个词条的英式美式音标在生产D1中仍缺失
- 自动化句子质量测试已诊断出尚未通过的长句，**审核或编辑不能靠增加无意义词汇刷数字**
- 正式运营后台尚未生成版本绑定的真实原创版权、语言、产品范围审批

**不要单靠本包中的 `reviewedAt` 时间戳作为真实语言校对证据；审核是人的实际行为。**
