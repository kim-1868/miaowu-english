# S47《雨夜档案》188词美式IPA来源核对（2026-11-02）

这次与S39不同：此前收集的是 **ARPAbet 音素代码**，不能直接展示在读者的音标栏；本轮从公开的 **open-dict-data/ipa-dict** General American `en_US.txt` 中筛选出与本书188个目标词精确匹配的**真正IPA格式**。该项目的 en_US 数据基于 cmudict-ipa/CMU，可追溯但**并不构成独立于S39的语音学验证**。

数据源：
- https://github.com/open-dict-data/ipa-dict/blob/master/data/en_US.txt
- Git blob: `f7cdfe30714777ad3f928977586e7425881687b4`
- 许可：本项目US数据采用 MIT（原始LICENSE copyright 2016 dohliam）。署名与完整许可记录在 `docs/third-party/OPEN_DICT_DATA_IPA_DICT_LICENSE.txt`；来源词库注明 CMU / lingz。
- 只保存我们的188个候选词，不复制完整英文词典，也不加入网站可公开访问的 `public/` 目录。

## 实际成果

| 指标 | 已获得 |
|---|---:|
| 目标词 | 188 |
| 在来源 US IPA 数据中命中 | **188** |
| 只有一种美式IPA候选 | **141** |
| 有两种或以上候选 | **47** |
| 正式批准写入线上词卡的IPA | **0** |

例如 `record` 在来源中有 `/ˈɹɛkɝd/`（名词）和 `/ɹəˈkɔɹd/`、`/ɹɪˈkɔɹd/`（动词可能变体）。`suspect`、`separate`、`duplicate` 等都需要按上下文辨义项/词性，不能直接取第一条。

## 下一步的实际审校路径

1. **141词单候选优先核对：** 每个词的IPA、发音重音、词性、中文释义和原文使用逐条核对。可以批量节约来源检索时间，但“有一个候选”不代表已经经过编辑终审。
2. **47词多候选单独处理：** 词卡呈现的词性与故事原文义项需要一致；如果同一个词在不同句中有不同词性，应明确选择教学义项，或让词卡承载不同读音。
3. **英式仍有7词未精确匹配：** 使用另一可合法商用且可靠的英语发音来源补充，避免混用RP与General American习惯记号。
4. **发布原则：** 不改变 `phoneticUs`、`phoneticUk` 正式字段，也不将任何单词标记为 `verifiedCET4`。质量完成并核对版本后才能解除 `draft-` 与【测试】发布锁。

内部词审工具 `scripts/prepare-rainy-night-vocabulary-review.mjs --write-private` 已加入 `sourceUsIpaCandidates`、`sourceUsIpaCount`、`sourceUsIpaProvenance` 三列，可以直接生成供审稿人选择的私有CSV。全量733处正文语境、36个剧情回声候选和运营付费安全仍受原有审核控制。
