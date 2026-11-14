# 妙屋英语统一词典：外部开源数据授权清单（2026-11-10）

此文档只记录仓库所见授权声明，不等于第三方词典内容、发音音频和例句的上游版权均已独立确认，也不自动使任何候选教学卡可销售。

| 资源 | GitHub 原项目 | LICENSE 文件声明 | 可考虑用途 | 仍需注意 |
|---|---|---|---|---|
| ECDICT | https://github.com/skywind3000/ECDICT | MIT License，Copyright (c) 2025 Linwei | 跨等级词头、考试 tag、词形 exchange、词性和音标**候选** | 数据来源版权和释义准确性需复核；许可证/版权声明需保留；外部音频与第三方例句不能推定授予相同权利 |
| endict | https://github.com/ismartcoding/endict | MIT License，Copyright (c) 2022 SmartCoding | ECDICT 字段交叉校验、英美 IPA 核对 | 项目仓库许可不当然覆盖其引用的音频、例句或第三方来源 |
| english-vocabulary | https://github.com/KyleBing/english-vocabulary | BSD 3-Clause License，Copyright (c) 2022-2026 KyleBing | 四六级词头差集与待复核清单、可审词性资料 | 必须保留版权和许可通知，且避免用作者名作产品背书；例句原始来源需另查 |

## 执行政策

1. 只有许可链已经核准的字段允许进入最终可售词卡；现阶段 ECDICT 的 IPA / 词性 / 释义 / 词形先保留 `source_*_unverified` 原样候选字段。
2. ECDICT 来源表在 `global_dictionary_sources` 默认 `license_reviewed=0` 且 `enabled=0`；不能仅凭 GitHub LICENSE 就批量改成已审发布状态。
3. 全量词头索引可独立于精品教学内容先制作；购买级别标签为共享主词条属性，不代表已购买用户获得其他等级小说访问权限。
4. 候选词形（例如 `saw`）必须经过上下文判别；源词形存在同形冲突时禁止自动确认。
5. 产品发布时保留适当第三方版权公告文件，并保证不误将学习例句/音频中的第三方作品当作自有版权。
6. 来源统计 8,671/8,663 来自已有用户提供的考试合并快照，并**非**完整 ECDICT 上游词表；真实完整词典的 SHA256、下载日期、词头数量和许可证审查结果须随实际离线导入记录，不能从本清单猜测。

数据获取、导入和激活只能经过单独验证的隔离预览环境。切勿直接执行公共代码生成的 SQL 于生产 D1。

## 2026-11-11 · 额外开源来源审计结论（优先级更新）

- **新增真实可用 US IPA 候选**：[open-dict-data/ipa-dict](https://github.com/open-dict-data/ipa-dict) 固定 `972cd67dd5f96bc5660e28070cde26e3928abcd7`。README 特别声明 `data/en_US.txt` 是基于 MIT 来源，但 `data/en_UK.txt` 由 GPL-3.0 ipacards 派生；**当前只用美式候选，英式不得按仓库统一 MIT 许可证直接复制**。
- 私人 7391 目标词头在该美式源中精确匹配 **7299**，**92** 缺，**1114** 有多个读音；此为词头音标源覆盖，不等于教学义项通过审核。四层分别为高中 `3641/3674`、四级新增 `1637/1654`、六级新增 `1721/1755`、考研新增 `300/308`。
- **Open English WordNet**：[官方项目](https://github.com/globalwordnet/english-wordnet) 当前参考版 `c39bfa5667d47b3b3dd2e5ddc24c5d83a372117e`，版权为 CC BY 4.0 且须署名 Princeton WordNet + OEWN 团队；当前仅做语义核对参考，不发布原定义/例句。
- **Tatoeba**：CC BY 2.0 FR 文本、部分 CC0；音频的授权逐贡献者不同。当前不批量搬运英中双语例句或发音；妙屋使用独立原创并审稿。
- 已实现 [开源词卡源验证与待审候选编译器](OPEN_SOURCE_WORDCARD_SOURCE_AUDIT_20261111.md)，[GitHub Actions 42862811984](https://github.com/kim-1868/miaowu-english/actions/runs/42862811984) 在**真实固定 ECDICT CSV + US IPA** 文件上通过样本测试；结果仍为 `publishable_rows=0`、D1 写入 0。
- 所有权利和数据质量审核与正式 Publisher 身份签核仍未完成，开源许可不使原音频、爬取例句和示例英语自动变成可商用词卡。请勿在正式站启用来源表。

