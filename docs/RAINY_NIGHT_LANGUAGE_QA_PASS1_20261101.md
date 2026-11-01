# S31《雨夜档案》语言与教学词汇专项审计（第一轮）

**状态：内部初审；非全书人工终审；不得公开或销售。**

## 本轮发现并修复的确定问题

审读第3–12章的部分文本，修复了至少12处已确认的英文词性混用与叙事问题。

| 章节 | 问题 | 修正原则 |
|---|---|---|
| 3 | `reverse` 为动词，却被当作形容词修饰“比对” | 改成对图像执行reverse动作 |
| 3 | `confuse` 与被动汉语结构混接，缺少明确宾语 | 改成混淆人物判断的动词动作 |
| 4 | `predict` 当作“预测”名词 | 改成主语实际预测下一次停电 |
| 4 | `former` “前姓名”实际是校刊笔名，概念不符 | 改成先前使用的校刊署名 |
| 5 | `missing` 作为及物动词“故意missing记录” | 改成形容词修饰缺失的记录 |
| 5 | 另外两处 `missing` 词性模糊 | 改成描述缺失纸页的状态 |
| 7 | `proof` 与“作”生硬搭配 | 改成名词“证明材料”的语境 |
| 7、9 | `distribute` 动词被当成分配行为的名词 | 改成动词“分发物资” |
| 10 | `threaten` 后用“要把...”不清楚威胁对象 | 改成明确谁受到威胁 |
| 12 | `threaten` 动词被当作“威胁（n.）” | 改成有明确宾语的动词 |
| 7 | 先写代转信、后询问能否代联系姐姐 | 调整为先请求联络再写信 |

**特别提醒：** 这是混合中文叙事中的局部修复，不能仅靠正则或上述例子推断其余700多次嵌入完全自然。下一轮仍应逐章通读并检查同一词在不同语境中的含义。

## 188词逐项审核清单已工具化

`node scripts/prepare-rainy-night-vocabulary-review.mjs --summary` 输出从**当前真实12章正文**计算的词条总数、标注次数、重复章节数、复习优先级以及审核阻断情况。

`node scripts/prepare-rainy-night-vocabulary-review.mjs --write-private` 只在本机或 GitHub runner 的忽略目录 `private-output/` 写出：
- `rainy-night-s1-vocabulary-review-UNVERIFIED.csv`：每行词条ID、词性、释义、总标注、出现章节、首次上下文、双语例句、搭配条数、空音标以及未来审校签字字段。
- `rainy-night-s1-vocabulary-review-summary.json`：仅汇总计数。

此工具不能自动把词性视作已校验、不能生成官方CET4等级证明，也不会填造IPA或外部词典来源。当前188词全数仍有`IPA_NOT_VERIFIED`与`CET4_NOT_VERIFIED`标识；优先检查仅出现1次及仅在1章出现的词。

## 英式IPA来源候选（尚未经过审定）

新加入 `content/editorial/rainy-night-s1-britfone-uk-ipa-candidates.json`。候选数据通过英国发音词典 **Britfone 3.0.1** 的 MIT 授权文件 `britfone.main.3.0.1.csv` 按词形精确查找生成。来源仓库：https://github.com/JoseLlarena/Britfone；来源 SHA `51a54c553812b06a8f464f5aa85f4df2e6edb645`；源文件许可 MIT，使用及再发布须保留署名与许可。

| 项目 | 数量 |
|---|---:|
| 第一季候选词 | 188 |
| 找到英式发音候选 | 181 |
| 没有英式匹配 | 7 |
| 存在多发音候选（需按实际词性辨义） | 14 |
| 词性、词义与发音得到人工批准 | **0** |
| 有来源可核对的美式发音（本批） | **0** |

缺失匹配：blurred、discrepancy、falsify、handwriting、outage、reunite、watermark。多发音例如 record、document、contact；不能自动取第一个就称正确。Britfone 的一些音标记号与国内教材常见写法不同，日后需要统一展示规范。

`--write-private` 生成的逐词CSV已经带上 `sourceUkCandidates`、`sourceUkCandidatesCount` 和可追踪的 `sourceUkProvenance`，但绝不写入正式词卡的 `phoneticUk` 字段，也不会改动对应的 D1 数据或把任何单词标记 `verifiedCET4=true`。

**词汇分布的新发现：** 708次标注中，97个候选词只出现于一个章节、25词只出现一次。这暴露了“总频次达标不等于每词有足够复现”的教学风险。下一轮要优先安排同词在隔章/后续小说中的自然复现，而不是继续堆高 record、confirm 等已经频繁出现的词。

## 上架仍需完成

1. 对全书所有标注位置逐句审核中英混排自然度、表义准确性、词性与读者认知负荷；修正重复场景与时间线。
2. 从可核验来源核查英美IPA、发音与CET4范围；记录来源与审核者，不能把推测升级为已核验。
3. 配套剧情回声题库必须有对应实际句子、正确答案和干扰项审核，确认不会泄露付费内容。
4. 使用草稿数据在**测试D1**进行端到端验收，再经出版审核、付费规则、数据安全验收决定正式上架。

**这轮只修改 GitHub 私有草稿/内部工具/测试/文档，不改动正式 Worker 业务逻辑、不写入 Cloudflare D1、不碰现有真实测试账号。**
