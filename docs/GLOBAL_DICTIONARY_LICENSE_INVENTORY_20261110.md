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
