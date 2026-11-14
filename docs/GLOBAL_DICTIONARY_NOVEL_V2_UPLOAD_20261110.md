# 妙屋英语 · 新小说无需附带词卡（统一词典 V2 输入规范）

实施时间：2026-11-10。此版本仍在 Draft PR #206 中，**尚未部署任何网站**。

## 目标

制作四级、六级、考研、雅思小说时，AI 小说 Agent **只负责原文和学习词标记，不再重复制作已审核词卡**。上传 JSON 后，在预览环境调用统一词典，生成兼容旧运营台的 `version:1` 候选包：统一主词条 ID、原文不变、同一词头跨小说复用同一卡。无人工审校的词不会被假装成已审通过。

### 输入

样例：[`content/examples/novel-v2-no-wordcards.example.json`](../content/examples/novel-v2-no-wordcards.example.json)。

示例（删减）：

```json
{
  "version": 2,
  "book": {
    "id": "story-demo-cet6-v2",
    "title": "示例：一次改变方向的面试",
    "category": "cet6",
    "description": "原创英语学习故事"
  },
  "sourceLabel": "dictionary-v2",
  "chapters": [
    {
      "id": "chapter-v2-001",
      "number": 1,
      "title": "第一章",
      "preview": true,
      "paragraphs": [
        {"segments": [
          {"text": "她决定 "},
          {"surface": "record", "gloss": "记录"},
          {"text": " 面试官提出的问题。"}
        ]}
      ]
    }
  ]
}
```

- `{text}` 普通剧情原文保持原样；英文未明确标注为学习目标时不会静默变成付费学习目标，防止人名、对话和常用语阻挡上架。
- `{surface,gloss}` 标注**需要点击学习**的英文词，`gloss` 是当前小说中使用的中文含义，可以不同于主词卡其他含义。
- **禁止**生成 `words[]`、`wordId`、自己编造 `reviewed:true` 或词卡 ID。原形和词形由已审核的统一词典匹配。
- `surface` 初版必须是单个英文词（可连字符/撇号），词组、缩写、复数歧义词必须进入专门人工审查，不猜测。
- 故事仍要求中文主线、英文目标词自然嵌入、可读性优先，不能为了提高覆盖量把英语词硬塞进中文句子。

## 预览环境处理顺序

1. 运营台识别 `version:2` JSON，调用只读 `POST /api/ops/import/dictionary-v2/preflight`。仅 staging Publisher，有独立开关 `GLOBAL_DICTIONARY_LOOKUP_ENABLED=true` 才可使用。
2. 先复用现有 `validatePackage` 结构规则检查章节、内容长度、目录、ID、目标词数量，不信任作者给出的词卡字段。
3. 查询 `global_dictionary_entries`、`global_dictionary_forms`、`global_dictionary_sources`，只有来源授权状态、主词条教学审查、词形审核满足要求才自动关联。
4. 查询新增 `global_dictionary_lessons`，要求**单词一条主学习卡**；多词性/多义项保留在 `senses_json`，同时提供旧阅读器需要的中文释义、音标、例句和搭配。完整表结构：`db/016_global_dictionary_lessons.sql`。原始词典翻译/音标不自动提升为教学完成。
5. 自动匹配的 `entry_id` 成为转换后 `words[].id`、`segments[].wordId`，**同一词头只生成一张卡**，即便重复出现在很多章节或不同小说；当前句的 `gloss` 不变。
6. 如果有缺词、词形歧义或教学审核未通过，返回具体章节、段落、表层拼写及候选主词条；运营台可按上下文选择**本来就审核通过**的歧义词头，不能用点击操作代替教学审核。
7. 全部目标词通过后，生成旧运营台兼容 `version:1` 完整 JSON（**只读**）。新版小说必须进入 staging 的指纹化预检 → 保存候选 → 上载为草稿 → 核验附加 sidecar 流程，**不允许回退到旧自动上架路径**。
8. 旧小说 `version:1` 继续按原流程处理。任何已经存在的同 ID 不兼容词卡仍会触发现有冲突保护，不能直接覆盖。

## 上线前重要限制

- 本功能目前只支持 **JSON V2**。Markdown/TXT 与纯文本没有可靠的学习目标边界，继续使用原解析器，后续单独扩展。
- 目前尚未实际导入完整 ECDICT，也没有生产审核的数千张 `global_dictionary_lessons`；绝大多数源词只有**待审候选词头**，不会自动通过内容生成。
- 旧阅读器仍按 `words` 一张卡展示，`senses_json` 中多个词性/不同 IPA 的完整词典式前端 UI 需等 B1；本阶段解决**上传时无需重复制作词卡**与跨小说稳定 ID。
- `words[].id=entry_id` 需要与现有旧书/用户 ID 做安全桥接；B1 在预览数据库做备份、合并冲突测试后才能迁移正式学习状态。
- 本次源码未更改 `user_words`、`review_events`、`entitlements`、原小说 `chapters` 与既有版本修订规则。无实际 D1 迁移/Cloudflare 发布。
- 开源 ECDICT 等项目的 LICENSE 声明不一定覆盖全部上游词典释义、音频、第三方例句；销售前需完成许可证与内容质量双重签核。

## 验收

专项 `tests/v12-dictionary-novel-v2.test.mjs` 覆盖：不附词卡单词归一、一词多义共用 ID、跨原形/过去式、独立教学审核、上游许可证开关、歧义词不同句子人工确认、内容不可篡改、生产环境禁用、发布者权限。

完整 GitHub Actions 结果以最新分支 SHA 为准；**自动化测试通过不是预览站上线**。

跟踪 Issue：#208；Draft PR：#206。
