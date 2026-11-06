# 🐾 WordLetter 小说生产 Agent V1.1：先验剧情，再选词写作

**这版专门修复 AI 小说“啰嗦、没有逻辑、每章缺少看点”的生产流程缺陷。** 适用于完成当前首本测试以后启动的**新项目**。你正在使用 V1 生成的《雾中第七封信》不要中途覆盖软件文件。当前 Codex 网络重连与这项开发是两回事。

### 新版创作顺序

`输入书名和题材 → 先生成完整剧情 Bible/各章因果卡 → 本地结构闸门 → 独立 AI 故事主编逐章审稿 → 最多自动返工两轮 → 审稿通过后才选词 → 词卡/正文生成 → 英语初审/打包`。

**新增的前置剧情闸门：** 每章必须包含目标、阻力、人物抉择、真实后果、新信息、追读问题及与上章的因果关系；全书有角色动机、失败代价、差异化设计与结局兑现。独立 AI 评分满分100，建议达到85分且没有 P0/P1 才允许向下生成。必须附逐章问题和对应事件证据；不合格最多改稿2轮后停下，不靠延长篇幅凑分。

**重要边界：** 分数是“AI 大纲预检”，不是文学质量证明。后续正文仍然需要整书读者视角检查、语言审核和人工决定是否上架。当前独立审稿使用已登录的 Codex CLI，模型网络或额度不足时可能暂停，可断点恢复。程序不会访问 Cloudflare 正式数据库。

### 与 V1 相容性

- 新 V1.1 创建的项目：`config.json` 默认 `storyGateVersion: 2`，才启用故事先行流程。
- 原 V1 已开始的项目：没有这个字段，自动沿用 V1 流程；不要修改它的 `config.json` 或删掉已完成的词卡/章节。
- 新增文件：`story_gate.py`、`STORY_GATE_STANDARD.md`；只下载其中某一个文件并覆盖 V1 不构成完整升级。
- 审核文件在项目目录：`story_gate_report.json`、`story_review.json`，以及被自动修订前的备份 `story_history/`。
- AI 初评过关并不使小说自动发布；0试读、跨书一义一卡、真人/权威词典校对仍须独立确认。

---

# 妙屋英语 WordLetter · 可运行小说生产 Agent（Codex CLI 版）

这是一个**真正有生成入口、质量检查、出版格式构建与打包能力的本地工具**，不是提示词文档。核心程序只用 Python 标准库，不保存 API Key；小说的 AI 写作由你在 Mac 上**已经登录的 Codex CLI**完成。

## 一、运行前的准备（只做一次）

1. Mac 已有 Python 3.9 或以上：在终端输入 `python3 --version`。此前 P5 工具已运行，通常可直接继续。
2. 安装 Codex CLI。推荐 [OpenAI 官方安装说明](https://github.com/openai/codex)：

   ```bash
   npm install -g @openai/codex
   ```

   或使用官方独立安装命令：`curl -fsSL https://chatgpt.com/codex/install.sh | sh`。按你的安全习惯选择方式；不用同时安装两种。
3. 在终端运行 `codex`，选择 **Sign in with ChatGPT** 登录并完成授权。不要将账号密码、Token 发送给 Agent。
4. 解压本文件包到 Mac 文件夹，例如 `~/Documents/WordLetter-Novel-Agent`。不要放在此前的生产 SQL 备份文件夹中。
5. **完全不需要上传生产数据库 SQL**；工具已带 2026-11-06 的*匿名已出版词卡快照*供初始复现统计。发布更多小说后请更新快照。

> Codex CLI 消耗你现有 ChatGPT 计划的相关使用额度，可能有使用限额；不是无限免费。工具本身不要求单独配置付费 OpenAI API Key。

## 二、最简单使用方法

在终端进入解压后的文件夹，运行：

```bash
cd ~/Documents/WordLetter-Novel-Agent
bash start.command
```

按提示填：书名、题材、等级、章节数、目标独立目标词量。选择 `y` 后自动运行：

`创建项目 → 原创提纲和词汇规划 → 按批生成词卡 → 分章创作 → 独立 AI 逐章审校 → 离线验收 → 打包`。

生成会调用 Codex 多次，期间可能因使用额度、网络或文本复杂度中断。**不会丢失已完成的项目**，在相同目录再次运行 `run` 会跳过已生成阶段。日志和结果全在本机。

## 三、命令行示例（更可控）

```bash
# 1. 创建四级悬疑小说项目（默认零试读、8章、130目标词）
python3 novel_agent.py new --title "档案室的第七封信" --genre "悬疑" --category cet4 --chapters 8 --words 130 --out projects/archives-seven

# 2. 全部生成 + 独立初审 + 出版包（需要 Codex CLI 已登录）
python3 novel_agent.py run --project projects/archives-seven

# 3. 断点续跑，不会重复生成已有 JSON
python3 novel_agent.py run --project projects/archives-seven

# 4. AI 生成之后重新离线打包
python3 novel_agent.py pack --project projects/archives-seven

# 5. 检查已存在的出版 JSON（无需 Codex）
python3 novel_agent.py check --file /path/to/小说.json

# 6. 只测程序与结构打包（无需 Codex，合成虚拟故事不能售卖）
python3 novel_agent.py demo --out projects/demo

# 7. 自动化单元测试（无需 Codex）
python3 -m unittest discover -s tests -v
```

如果你有新的 P5 小说词卡快照，创建新项目时可加 `--shelf ~/Downloads/p5-content-review.json`。还可用 `--lexicon /path/to/vocabulary.csv` 提供明确来源的候选词表。**别将生产 SQL 交给 Codex**。

## 四、文件产物（自动生成）

`projects/<项目>/` 下包含：

- `config.json` — 本书配置，永久稳定的书籍 ID。
- `outline.json` — 全书原创大纲。
- `vocab_plan.json` — 按义项规划的词库（含生成 ID、词性、当前义项和计划章节）。
- `cards/merged.json` — 含英美 IPA、双语例句和搭配的词卡。
- `chapters/chNN.json` — 独立生成的完整章节；默认 0 章试读。
- `review/chNN.json` — 第二轮 AI 对每个已用单词的内容初审。
- `output/出版台导入包.json` — 按此前已成功处理的真实示例 JSON 契约构建。
- `output/QA.json`、`质量与覆盖报告.md` — P0/P1 和可再计算的重复率、实际词频。
- `output/故事大纲.md`、`完整小说阅读稿.md`、`最终词卡审校表.csv`。
- `WordLetter_<bookId>_审核待确认.zip` — 打包以上文件（**不含生产 SQL 和账号信息**）。

**当前程序不生成封面图，也不会自动上传、发布。** 封面可在合法授权前提下另行制作，仍按竖版 3:4 / 推荐 900x1200、统一等级标签的规范管理。

## 五、质量与安全边界（务必了解）

- 格式校验参考《第十三张底片》此前修复版的真实 `version=1` / `book` / `words` / `chapters` / `segments` 结构。**尚未取得最新运行时 `src/editorial-content.js` 或线上 `validatePackage` 源码，因而不是正式后台预检通过证明。**
- 英文 IPA 格式、空搭配、悬疑剧情、自然度的自动检测只能发现一部分风险。由 Codex 另跑的 AI 复核亦不能替代真人或权威词典核验。
- 四级重复率按去重英文词目与同级已发布书架比对，不按 `word_id`；`shelf_20261106_sanitized.json` 源自 2026-11-06 备份的内容审核数据。**已上架新书后它就会过期。**
- 词义候选 `headword + POS + 意义` 只是复用候选，不保证当前网站已经统一 `sense_id`。新书跨书去重必须继续在读者测试账号下验证。
- 出版包从未自动修改 D1、账号权益、发码、运营台或线上小说。发布前要做：人工语义/音标/版权终审、当前后台导入预检、权限及学习状态测试。
- **产生 P0 或 P1 错误时必须修订后才能申请发布。** 完成机器预检只是中间阶段。

## 六、常见问题

**命令提示 `codex: command not found`：** 先按官方指引安装并执行 `codex` 登录。

**Codex 失败/报限额：** 不要删项目；再次执行 `run` 可继续已完成步骤。若已有文件语义错误，可编辑对应 JSON 并重跑 `pack`，对某一章节确需重写时先备份并删该章 `chapters/chNN.json` 再重新 `run --stage chapters`。

**后台提示 INVALID_NOVEL_PACKAGE：** 检查 `output/QA.json` 是否存在空格文本片段/ID等问题；有些服务端逻辑只能在实际上传预检中验证，不能声称自动通过。

**是否还要花 API 费用？** 使用 ChatGPT 登录的 Codex CLI 路线通常不需要单独购买 API Key，但具体使用额度和产品政策以账号当前显示为准。若改为 API Key 登录，其费用路径另算。

**已有旧词卡需要迁移吗？** 不需要。此工具只生产**新书文件**，不会做旧数据库 ID 合并或学习状态迁移。

## V1.2 高效模式（2026-11-06）

**为解决 V1 8章/130词需约23次 Codex 请求、频繁重连的问题，V1.2 添加 `run --fast`。** 新书默认每批44张词卡、相邻2章一次写作、相邻2章一次独立复核，保存单章 JSON 并继续 P0/P1 审校；单本目标调用数约减为12次（不含新书 Story Gate 前置审核）。实际速度取决于网络、输出体量和模型，不保证按比例缩短。网络重连本身需要检查网络环境。

- 已有项目中断时，先确认原来的 `bash start.command`/Codex 任务**确实停止**，再从新版目录运行 `bash 快速续跑.command`。
- 仍可使用 `python3 novel_agent.py run --project /path --fast`；若长输出在双章模式经常超时，可不加 `--fast`，回退逐章。
- `codex_timings.jsonl` 记录每个实际模型阶段的耗时，便于后续科学优化。
- 不要在任务运行中覆盖/修改旧版项目或同时运行两个生成进程。新版文件夹必须和 V1 并列放置。

详细操作见 `V1.2_提速说明.md`。