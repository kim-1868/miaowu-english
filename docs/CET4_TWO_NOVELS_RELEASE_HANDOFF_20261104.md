# 妙屋英语｜首批两部四级小说上线准备交接（2026-11-04）

**当前：两部含完整英美 IPA 字段的内容包已生成并通过逐章节结构一致性检查；仍属私有待审候选，尚未导入或发布生产 D1。不可把格式校验当成教学/版权审批。**

## 已交付待审内容包

| 书名 | 私有JSON文件 | 章节 | 免费章节 | 正式权益章节 | 去重词卡 | 英文目标词锚点 |
|---|---|---:|---:|---:|---:|---:|
| 离婚后，前夫公司成了我的客户 | content/review-packages/20261104-ex-husband-business-client-PRIVATE-UNAPPROVED.json | 6 | 0 | 6 | 49 | 177 |
| 替嫁当天，我撕了婚约 | content/review-packages/20261104-substitute-bride-tears-contract-PRIVATE-UNAPPROVED.json | 6 | 0 | 6 | 56 | 171 |

两书共67个不同英文 headword，合计99个正文自然段；其中4个和12个段落少于每段3词，多为短对白/结尾，不构成自动拒绝。两书平均每段英文锚点分别约3.77和3.29，符合原约定的段均3–6（自然度仍需人工复核）。

## 完成的可复用教学资料

- 英美音标来源与手工候选选择：content/editorial/20261104-71-IPA-REFERENCE-SELECTIONS-UNAPPROVED.json（71词，含未实际进入本批两书的4个下一批备用词）。
- 原新增45词的中文义项、英文例句、中文翻译及常见搭配：content/editorial/20261104-shared-45-word-cards-WORKING-COPY-NOT-APPROVED.json。
- 本轮两部内容包全部49/56个词卡均有中文释义、词性、英美IPA、双语例句；无占位音标。
- 复核了contract、project、record三个名词的重音；job排除专名Job的读法；其他有多个候选读音的词保留来源数组与审校状态。
- IPA 来源1：Jose Llarena / Britfone 3.0.1, MIT, Copyright (c) 2017 Jose Llarena, https://github.com/JoseLlarena/Britfone 。已根据来源候选规范化英国IPA与重音标注。
- IPA 来源2：open-dict-data / ipa-dict en_US, MIT, Copyright (c) 2016 dohliam, https://github.com/open-dict-data/ipa-dict 。从源候选中挑选美国发音，不复用任何未获许可的词典音频。
- 商业展示正式发音数据时需要保留上述来源的许可证和版权声明，并完成编辑批准，不能把候选来源或浏览器TTS当作人工终审。

## 正文编辑进度

- 《离婚后》补上旧包装设计权利归属的收尾，修复report名词当动词和打phone等中英混排，避免误称完成版权法律核验。
- 《替嫁当天》新增与书名相符的“撕婚约复印件”情节，保留正式文件证据；修正confirm、phone、calculate的语境衔接，并说明投资方与评标隔离。
- 最新Markdown原稿已同步生成对应JSON段落和词汇位置；全部6章无免费试看，未删除正文。

## 本轮确已跑通的离线检查（不等于正式站端E2E）

- JSON结构检查：两书均6章、章节号连续、全部标注与词卡ID一致。
- 目标词顺序和正文段落内容与最新版Markdown完全一致；没有悬空wordId。
- 词卡全部具备UK/US IPA、词性、中文释义、英文例句、中文例句；英美IPA与来源候选账本一致。
- 不存在free preview；相同wordId在两书里词卡内容一致。
- 自动化回归用例已编入 tests/s146-cet4-two-novel-release-candidates.test.mjs；尚未以GitHub Actions实际运行此新增测试。

## 正式上架前的明确剩余关卡

1. **四级等级归属**：来源记录中旧26词完成2016大纲的词形级初核，但词性/语境未审定；新增45词尚未独立逐词核对官方PDF原文（两书实际用到其中41词）。不能声称达到“经核实四级词”或“完整覆盖”。带音标的内容包仍不能绕过这一关。用户给过2016版大纲PDF，但当前文件权限仅支持部分检索，无法批量复核扫描原页。
2. **音标终审**：候选已按义项、词性挑选，但18个词含多读音或词性变化来源记录，须额外复核。商业使用需保留来源授权和归属。
3. **既有D1词卡冲突**：两书复用原雨夜稿rns1-* 全局词卡ID。现有运营导入器会严格拒绝同ID但音标/义项/例句不同的记录（WORD_CARD_ID_CONFLICT）。导入前应以publisher只读拉取四级现存词卡，检查并做受控词库协调；不可换ID绕过造成学习进度重复。
4. **人工真实签审**：来源版权、故事完整度、中英混排、封面授权及商品说明需人工确认。不要伪造人工审核记录。
5. **网站功能验收**：用已购/未购账号校验整本付费保护、点词词卡、英美发音、浏览器speechSynthesis整章朗读、收藏、进度和剧情回声；目前没有独立合成MP3文件。
6. **发布操作**：在运营台 /ops.html 用publisher账号检查readiness，确认APP_ENV和OPS_PUBLICATION_ENABLED配置，保存版本绑定的真实审批后按完整书名二次确认；不得把私有JSON放入public静态资源。

## 上架入口

正式审核通过后：从GitHub私有分支下载JSON → 在妙屋运营台上传新小说(JSON) → 识别与检查 → 导入为草稿 → 检查readiness及游客/会员权限 → 人工批准 → 二次确认上架。当前两份文件是待审内容包，未经这六项核验不要直接发布。
