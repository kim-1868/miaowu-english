# 妙屋英语 WordLetter · 四级六级考研开源词卡来源核查与接入记录（2026-11-11）

> 第一优先仍是「7391 词头所需真实教学义项 → 旧书正式版本复用 → 新书 V2 自动配卡」。本次引入开源资源只是缩短**人工内容初稿与检查**时间，不以库大小或 GitHub 星数替代审核。**截至此记录，已批准可售 sense = 0，正式 D1/正式站均未修改。**

## 1. 开源来源决策（查验了仓库 LICENSE + 数据来源备注）

| 来源、固定 GitHub 版本 | 许可证/来源要点 | 允许进入当前候选流水线的字段 | 不得自动导入/不能冒称已审 |
|---|---|---|---|
| [ECDICT](https://github.com/skywind3000/ECDICT) @ `39cfb9672c0906b63569e0453c2e6abfb9ab182a` | 仓库 LICENSE 明确 MIT、Copyright © 2025 Linwei；需保留相应许可证与版权通知，原始释义准确性及其中可能的第三方内容来源仍须核验 | `ecdict.csv` 中的英汉 `translation`、`definition`、`pos`、`phonetic` 作为带来源**未审核候选**。原站已用同源考试标签及词头索引，所以不另建新 `entry_id` | 不把单词整段中文释义直接拆成确定 sense；不把 `phonetic` 擅自标 UK 或 US；不直接使用外部音频/例句 |
| [ipa-dict](https://github.com/open-dict-data/ipa-dict) @ `972cd67dd5f96bc5660e28070cde26e3928abcd7` | 仓库整体 MIT，README 明确 **en_US 基于 MIT**；但 **en_UK 源自 GPL-3.0 ipacards**，第三方语料保留原许可证，不能按 MIT 处理整个目录 | **仅** `data/en_US.txt` 的美式 IPA，单词可有多个候选发音、必须与义项和词性人工核对 | 当前**不读取 `data/en_UK.txt`**；没有英式发音许可链、音频文件，不构成可发布双音标词卡 |
| [Open English WordNet](https://github.com/globalwordnet/english-wordnet) @ `c39bfa5667d47b3b3dd2e5ddc24c5d83a372117e` | CC BY 4.0；许可说明还要求保留 Princeton WordNet 与 Open English WordNet 的归属 | 用作词义分歧、名词/动词义项分离的**人工语义参考**（当前未导入其定义、例句到产品） | 如以后实际复制其词义解释或例句，需在产品中落实 CC BY 署名、链接和改动声明；不能直接按词头合并义项 |
| [endict](https://github.com/ismartcoding/endict) | 代码仓库标注 MIT，但 README 的音频、例句来自合并/附加资源，上游逐字段许可不清 | 参考 JSON 数据结构、英美发音字段设计 | 目前**不接入**其 MP3 和外来例句 |
| [Tatoeba](https://tatoeba.org/en/downloads) | 大部分文本 CC BY 2.0 FR，一部分 CC0；音频和译文也有更细的授权差异 | 可在明确文本授权及作者署名链以后进一步研究 | **现阶段不批量拷贝**第三方句子或音频。妙屋收费小说教学例句继续原创并由编辑核实 |

原则：**开源、MIT、CC BY 都不等于词义准确或原始第三方版权链已完全核准**；这是来源级初筛，不是法律意见。归属公告应随正式发布材料保留；最终使用范围需以具体固定版和字段为准。

## 2. 与第一期真实词表的实测覆盖（不是教学完成）

私人 owner 词表是：基础 3674 + 四级新增 1654 + 六级新增 1755 + 考研新增 308 = **7391 唯一词头**。保留六个句点缩写（不自动剔除标点）。

通过 GitHub 连接读取开源 `ipa-dict/data/en_US.txt`（固定 commit，125,927 原始音标行），并与**私人 7391 项目标清单**精确比较：
- **7299 / 7391** 项查得到美式 IPA 候选（约 **98.76%**），**92** 项暂无对应读音。
- 上述 7299 中 **1114** 项存在多个美式读音，不准无上下文选择第一个。
- 基础词 **3641/3674**；四级新增 **1637/1654**；六级新增 **1721/1755**；考研新增 **300/308**。
- 例：`record` 存多个美式发音，名词「记录」与动词「录制」不能用一个未经审核的读音直接覆盖全部含义；`mr.` 可有美式候选，但仍保留缩写人工校对标识。
- 这些计数是**词头精确匹配率**，不是义项 IPA、中文释义、例句已全部通过审核，更不能称 98.76% 词卡完成。

## 3. 已提交、已跑过真实上游的开发成果

1. `scripts/build-exam-first-open-source-card-candidates.py` —— 私人离线词卡候选编译器，读 owner 7391 JSONL、固定来源 ECDICT CSV、`en_US.txt` 及两份 MIT NOTICE。逐词保留原 `entry_id` 和 owner 等级标记，输出 `raw_chinese_meanings_unverified`、`raw_pos_unverified`、`raw_phonetic_unspecified_accent`、`phonetic_us_candidates_unverified`。
2. 强制保留所有音标变体；缺少源释义、US IPA、多音、缩写、商业权利审查、原创英中例句、Publisher 审批分别输出 blocker，绝不自动写 `sense_id`、`teaching_ready=1` 或已批准学习计划。
3. 限制「只能读取 en_US」是当前正式内容策略；程序没有联网/远程 D1/Cloudflare Token 权限，不读取第三方 UK、音频、Tatoeba 句子。
4. `tests/test_open_source_card_candidates.py` 5 项测试通过，覆盖重复 old 词头/源行、错误 MIT 来源、音标格式、误审批、保留多音、禁止覆盖私有输出。
5. `global-dictionary-opensource-assist-qa.yml` **真实 GitHub Actions [42862811984](https://github.com/kim-1868/miaowu-english/actions/runs/42862811984) Success**：拉取两个**固定 commit 的公开源数据**，并用公开测试词 `abundant/record/apple/mr.` 实际编译，四词获得美式候选 IPA 和 ECDICT 中文候选，保留多音及缩写告警，`publishable_rows=0`、D1 写入 0。未向公有仓库上传私人 owner 名单、历史词卡或收费小说。

### 在受保护本地工作区运行

先在私人电脑/workspace 将已批准的固定上游源快照下载并核实上述来源 commit，保留完整 LICENSE。以下命令**只生成私人待审候选**：

```bash
python scripts/build-exam-first-open-source-card-candidates.py \
  --targets "/private/三级考试优先词表_7391_源词头匹配审稿清单.jsonl" \
  --ecdict "/private/upstream/ecdict.csv" \
  --ipa-us "/private/upstream/en_US.txt" \
  --ecdict-license "/private/upstream/ECDICT-LICENSE.txt" \
  --ipa-license "/private/upstream/IPA-LICENSE.txt" \
  --out "/private/exam-first-source-candidates-v1"
```

私有输出只有未审批的 JSONL、统计摘要、来源许可证文件和审稿说明。公开 CI 只使用 4 个公开假设性样本，不会泄漏 owner 私人词表。所有输入源的 SHA256 会随输出留存，便于来源复核。

## 4. 接下来执行的**唯一交付主线**

1. **内容审核 P1**：先用来自源的中译/词性/US 音标候选辅助既有**1067 个历史义项**、首批 40 条原创例句审核；随后按真小说上下文优先补**6550 个历史无义项草稿的词头**。中文释义需要人工拆分和校正，UK IPA 尚需合法来源，不以未审核 source 直接发售。
2. **旧小说 P2**：取得正式站已上架小说最新版本的**只读**导出，按上下文核对 `entry_id/sense_id`、不修改原 word ID/购买记录、收藏、复习数据。
3. **新书 P3**：V2 自动检出英文并只匹配**已审核且唯一**义项，冲突一律进入待审；通过真实 staging 运营台和阅读器端到端验收，才申请正式部署。
4. 剩余 8 批非考试词头导入不作为 P1/P2/P3 阻塞条件。**不再为了数量重复导普通词头**。

## 5. 下一项实际阻断

真实 owner 7391 词表与当前历史 1150 审稿 JSONL 在**私人 Library**；未放入 GitHub。此次 GitHub CI 只测试开源上游，不能声称「7391 张 ECDICT 词卡已完成」。
尚需通过私人工作区运行完整 7391 候选增强、人工教学审稿签核、现网书籍最新版本只读对账，以及 staging 真实功能联调。远程数据库中**批准 sense 仍为 0**。
