# S39 《雨夜档案》美式发音来源候选入库（仅供编辑审核）

**状态：PRIVATE_UNVERIFIED / 不代表188个IPA已审核、不向读者展示。**

上一轮使用 Britfone 的英国词典，取得 **181/188** 个英式发音候选（7个没有精确匹配，14词有多种候选）。本轮进一步使用 CMU Pronouncing Dictionary 已安装的只读资料文件，给 **188/188** 个目标词找到美式 **ARPAbet 音素转写来源候选**。47个词在源词典中存在不同发音写法，示例：`record`（含记录名词／动词重音差异）、`suspect`、`transfer`、`duplicate`、`address` 等。

文件：
- `content/editorial/rainy-night-us-arpa-UNVERIFIED.json`：每个目标词独立存储所有来源读音候选及 `selected:null`，`reviewStatus:UNVERIFIED`。
- `docs/third-party/CMUDICT_DATA_LICENSE.txt`：保留CMU原始数据版权声明、许可条件及免责声明。CMU源仓库 https://github.com/cmusphinx/cmudict ；源词典 sha256 `81917843c7f44ce2b094ac63873c2c7a4cf802040792c455ba3ca406891c3d22`。
- `scripts/prepare-rainy-night-vocabulary-review.mjs --write-private`：生成的私有 CSV 新增 `sourceUsArpaCandidates`、`sourceUsArpaCount`、`sourceUsProvenance` 字段。

**必须区分：ARPAbet 是CMU词典使用的音素代码，**不是**可直接显示给学生的IPA音标；此文件只是发音候选，未选定重音与含义，不能直接映射到 `phoneticUs` 或拿来生成真实音频。** 自动把音素代码逐字替换为IPA很容易把重音放到错误的音节或混淆 noun/verb 义项，必须根据具体语境和权威辞书复核，并统一英美音标风格。

## 上线门槛仍然存在

- 188个词的英美IPA、词性、义项和搭配尚无人工终审；不能声称已核验188个音标。
- 需要按英美发音源分别选定规范IPA、进行两源比对；对于英式缺失的7个词和US多读音的47个词优先审校。
- 原创语境中词性不自然的句子，必须先完成文本编辑再校正词卡与配音；不能在错误句子上制作剧情回声题库。
- 本轮仅改变私有编辑数据、私有审核导出字段、测试和版权记录；未改动线上应用、D1、用户账号、收藏或试用权益。

