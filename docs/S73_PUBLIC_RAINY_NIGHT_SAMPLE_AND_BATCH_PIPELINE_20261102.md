# S73｜《雨夜档案》先公开第一章 + 四题材原创短篇生产流水线 V1

## 本轮明确的发布边界

用户已确认《雨夜档案》整体故事方向可接受，**不等于**逐个词义、英美 IPA、例句、练习题、商用授权都已审核通过。本轮将故事真正接入 CET4 书架的免费阅读入口，但只发布**第一章的原始正文文本**，不发布其余11章和任何未经核实的IPA、词卡解释或练习题。

- 前台 CET4 书架（正式D1书架加载成功时）增加卡片《雨夜档案》、链接 \`/rainy-night.html\`，状态明确为“免费试读第一章 / 完整版筹备中 · 不出售”。
- \`/rainy-night.html\` 由 \`scripts/build-rainy-night-public-sample.mjs\` 在生产构建阶段从私有书稿中抽取**第1章36段、64个原文英文标注**，HTML 转义所有内容，只输出静态文字，**不引用任何词卡/英语音标/个人数据**。其余11章严格不进入构建包。没有章节内容的任何固定“付款/下载/全书解锁”按钮。
- \`scripts/build-production-assets.mjs\` 的审核清单增加一个特殊生成的静态HTML（不是复制 \`content/drafts\` 目录，也不是修改D1），Pages 仍仅作生产 Worker 服务绑定，正式用户权限保持不变。
- **线上部署并未由这次 GitHub PR 合并自动完成**，需要独立 Cloudflare Worker 生产部署；不可将 GitHub Actions 绿色构建误称为已线上上线。正式上架、12章完整小说商品和激活权益仍须内容审校与实际D1流程签审，独立处理。

## 私有小说流水线

代码：\`scripts/story-batch.mjs\`，输出仅写入被 \`.gitignore\` 排除的 \`private-output/story-batch/\`，绝不写到 \`public\`、正式D1、网站可被任何人访问的URL。

需 Node.js 22+，第一次执行：

\`\`\`sh
node scripts/story-batch.mjs plan
\`\`\`

生成4部6章小说计划、章节转折大纲和每本64个仅**官方2016考纲词形初步核对**的候选词。题材分别为虐恋、爽文、玄幻、BL。词性与中文义项为原稿暂存字段，不代表已经通过审核。

调用任一兼容的 OpenAI Responses API 模型写**纯中文原文**（请求会按token计费）：

\`\`\`sh
# 只在你自己电脑的本地环境中设置，不要在聊天、仓库、日志中贴API密钥
export OPENAI_API_KEY="<your-own-API-key>"
export OPENAI_MODEL="<chosen-supported-Responses-model>"
node scripts/story-batch.mjs write --book heartbreak-mistaken-love
\`\`\`

后续自动生成带 \`[[word]]\` 标注、与中文原稿逐段对应的私有嵌词稿，再质检：

\`\`\`sh
node scripts/story-batch.mjs embed --book heartbreak-mistaken-love
node scripts/story-batch.mjs qa --book heartbreak-mistaken-love
\`\`\`

另外三本的ID：

- \`villainess-refuses-script\`
- \`sect-thinks-im-weak\`
- \`rivals-secret-care\`

**失效优先与增量恢复：** 每章分别储存JSON。已有输出不覆盖（可以恢复中途运行）；服务错误、格式不合、正文过短、单词不在候选清单、英语锚点过密、与中文段落数量不一致都会拒绝通过。对模型质量不满意，需要人工在私有目录审稿或删除明确的候选章节后再单章重试，不能修改验证逻辑绕过审核。当前 V1 不含自动生成可商用 IPA、词卡或剧情回声正式题目，不对外导入，不会自动产生“商品”。

## 后续

1. 先把免费试读版部署到 Cloudflare 生产 Worker，使用匿名浏览器验证真实网页路径及首页书架卡片。
2. 提供一批流水线生成的**纯中文第一章/6章完整草稿**供内容质量抽检，优先检查虐恋、爽文和BL的叙事节奏。
3. 从单词源库挑选**明确审核过的词性/义项**，完成语境、IPA来源许可、题目和用户权益审核，再将一本完整小说升为真正的 D1 上架商品。
4. 做生产/测试库隔离、真实账号和付费章节的跨设备权限验证，确认商品价格、交付承诺、售后说明及小红书平台内合规推广方式。

> 运营文案不得说“完整小说已上线”或“包含全部CET4核心词”；只能称“《雨夜档案》第一章免费试读，学习版筹备中”。
