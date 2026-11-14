# 妙屋分级小说生产与上架预审

| 分类 | 生产入口 | 审核要求 |
| --- | --- | --- |
| 四级 | 沿用现有 20 本逐章词包。开写前按最新四级书架排除已覆盖的词，更新本书词包。 | 按该书净增目标和阅读质量验收，报告跨书重合率。 |
| 六级 | 先完成已经在制作的六级小说，沿用原主角、主线及合适的封面。当前补缺批次完成后按正式书架更新缺词和排产。 | 该补缺批次按每本净增至少 165 词验收，同批缺词各书独立分配。 |
| 考研、雅思 | 各自固定项目目标词表和正式书架，按题材把缺词分给各书，再生成首批小说。 | 优先补齐本级完整词表。记录各书实际净增，用首批发布结果估算下一批和剩余本数。 |

生产时，每个缺词分给一本做首次覆盖。放不进当前故事的词退回本级缺词清单，为下批保留。GPT 收到草稿和等级后，逐章核对并直接改稿，逐卡复用或补齐词义、音标和双语例句，复算最终 JSON 的净增和重复率。通过发布代码校验后交付 JSON、JPG、修订稿和报告。站长确认上架后，再用同一词表复算实际净增。

在运营工作台「⑦ 上传并发布新小说」选文件，点「识别文件并检查内容」，查看「词汇预审」。报告按分类显示当前与预计覆盖、预计净增、剩余缺词、跨书重合与书内重复。展开明细可查看具体词。覆盖检查只读取正式书架。发布沿用原有入口和审核条件，净增目标和阅读质量按各书要求审核。

- 正文中有词卡绑定、词性和释义的标注才纳入。覆盖按归一后的词头去重，已上架书籍使用真实正文绑定与已发布章节。
- 跨书重合率 = 与同分类其他在架书重合的有效词头数 ÷ 本书有效去重词头数。
- 书内重复标注率 =（本书有效标注次数 − 本书有效去重词头数）÷ 本书有效标注次数。
- 同 ID 的在架书在预测中以候选正文替换，分别报告新取得与失去覆盖的词，净增是两者之差。
- 新分类在建立项目词表前显示标注词重合和净增，分级覆盖率与剩余缺词待配置词表。

## 词表版本

预审使用项目既有 ECDICT 考试标签数据 2026-11-07 版本，只保留去重、转小写的词头。四级、六级、考研、雅思和高中各取本级标签。源数据 SHA-256 为 `f748cdfbd3fa2c6bd33f5ced0b021dd8f69386a52539596db4d4d8b91cc67d37`。更新时按原始 CSV 的「单词」列重建对应分类，并与项目词表去重总数核对。[ECDICT 许可](https://github.com/skywind3000/ECDICT/blob/master/LICENSE)

> MIT License
>
> Copyright (c) 2025 Linwei
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
