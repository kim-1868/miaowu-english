# S49：补全《雨夜档案》最后7个英式IPA参考来源（仅供内部校验）

目标：在188个小说目标词中，Britfone有181词命中。剩余7词并非没有英式读音，而是**原来选用的Britfone词形库未收录**。本轮逐词查阅 Cambridge Dictionary 英式发音页，留下可复核来源：

| 缺失词 | 英式IPA参考 | 来源 |
|---|---|---|
| blurred | /blɜːd/ | https://dictionary.cambridge.org/pronunciation/english/blurred |
| discrepancy | /dɪˈskrep.ən.si/ | https://dictionary.cambridge.org/pronunciation/english/discrepancy |
| falsify | /ˈfɒl.sɪ.faɪ/ | https://dictionary.cambridge.org/us/pronunciation/english/falsify |
| handwriting | /ˈhændˌraɪ.tɪŋ/ | https://dictionary.cambridge.org/pronunciation/english/handwriting |
| outage | /ˈaʊ.tɪdʒ/ | https://dictionary.cambridge.org/pronunciation/english/outage |
| reunite | /ˌriː.juːˈnaɪt/ | https://dictionary.cambridge.org/pronunciation/english/reunite |
| watermark | /ˈwɔː.tə.mɑːk/ | https://dictionary.cambridge.org/pronunciation/english/watermark |

**审校/许可边界特别说明：** Cambridge University Press 对其词典内容保留版权。我们在本轮记录的是为内部词典校对所查阅的7个短IPA参考和来源网址；**没有获得将剑桥数据批量复制到付费网站词卡或重分发原站音频的授权**。不得把这七项直接变更为面向商业读者的正式 `phoneticUk`；后续可以独立形成词典编校的成品音标并完成来源和商用许可复核。

当前真实进度（来源候选 ≠ 商品已验证）：
- 英式有可复查读音来源：**188/188**（其中原Britfone 181/188，剑桥网页补充7/188）。
- 美式有实际IPA来源候选：**188/188**，其中141个单候选、47个有多个发音形式（S47）。
- 英美IPA正式审核批准并写入产品：**0/188**。
- 188词中的2016年四级候选词形仍为172个，其他9个六级标记词、4个形态派生词和3个剧情辅助词应区别显示，不可向用户宣传“188个四级大纲核心词”。

实施：
- `content/editorial/rainy-night-s1-uk-ipa-seven-gap-reference-UNVERIFIED.json` 按词逐个记录参考信息和明确的商用未授权、终审未完成状态；
- `scripts/prepare-rainy-night-vocabulary-review.mjs --write-private` 的私有词汇CSV带 `sourceUkGapReference`、URL与 `sourceUkGapCommercialApproved`；
- `scripts/check-rainy-night-publishing-gate.mjs --summary` 报告英式来源覆盖188个词，但**仍报告产品已通过审核音标数0**；
- 本次不写入生产D1、不发布《雨夜档案》、不更改已购买权益。

后续进入真正的词义/音标编辑选择与单词卡填充环节，严格按已审定语义和音节应力核验词条。词汇来源检索已不再是主要阻碍，**内容实际审校与真实测试D1验收**才是当前核心任务。
