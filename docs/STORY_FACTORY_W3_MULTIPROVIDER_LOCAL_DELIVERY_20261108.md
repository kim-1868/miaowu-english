> **最新修订（2026-11-08）：V2 已把真实生成按钮接入私人本机网页，覆盖以下旧版“仅 CLI 执行”的描述。**
> 当前稳定候选 ZIP：`/妙屋英语/小说工厂V1/WordLetter_小说工厂_一键启动_W3多模型完整候选_V2_20261108.zip`（107个文件，SHA256 `78888a3d15046b57cf767307faf7ad6b3aba1a5873ea0bf7c735f4a4dc4addc3`）；旧的启动 ZIP 仅留作历史备份，不再作为推荐版本。

## V2 交付新完成项
- **本地工作台加入真实 AI 生成**：读写路径经严格目录白名单，基于同源临时 Token + Origin 检查 + 精确 `ack=I_CONFIRM_LOCAL_AI_CALLS_AND_QUOTA`，点击并确认后启动本地后台线程。网页同时只允许一个模型任务、进度状态不暴露正文或提示词、支持“当前章节结束后暂停”（当前章节不强制终止，确保原子保存）。
- 模型选项仍为 Codex/Claude Code/Gemini CLI；执行引擎必须已安装并完成登录，真实使用额度不可在此环境推断；没有网络代理/外部 API 配置。
- 运行前检查已存在章节、跨模型已尝试记录和 CLI 存在；未经明确确认会在 HTTP 400 阻断，**不会消耗额度**。
- 加入并通过 **25/25 本机 Python 回归**（含真实六本原任务、三本旧稿哈希、隔离新批次、三家模拟 CLI、模型运行后台状态机、暂停规则、确认与 CSRF、密度失败停止）。另外自包含 ZIP 在本机启动，通过 `LAUNCHER_AND_REAL_AI_CONFIRMATION_GATE_OK`，查看 9本/72章/27已存，未经 ack HTTP 返回 400。
- **依然未完成**：用户私人电脑上的真实 Codex 一章执行及模型令牌/质量审核；Claude/Gemini 实际 CLI 兼容性；私人本机 Chromium 手工交互；正式 V1.1 网站部署与实际 D1/权益验收。所有章节仍为以前的27章，未新增正文，不能称已量产。
- 本轮完整包只存私人 Library；公共仓库 PR #31 仅有匿名合成契约测试且已通过 GitHub Actions；无私人 Actions，未改用户网站。

# WordLetter 小说工厂 W2.1 / W3 · 三模型适配、完整本机启动包交接（2026-11-08）

## 状态与重要边界
**已交付可一条命令启动的私人本机工作台候选、三模型 W3 调度器；尚未在用户自己的 Codex/Claude/Gemini CLI 上完成任何实际 AI 生成调用。** 不得将其描述为全自动量产上线。用户此前已明确自己可使用 Codex，当前无需重复询问 CLI 版本。

## 本轮完成
- 将 W2.1 本机服务、九本资产与新六本实际任务、W3 多模型调度适配器、启动器、说明和测试一起封装为单个私人 ZIP。完整解压后运行 `python start_story_factory.py`，自动监听 127.0.0.1 可用端口并打开本机任务台，不连接正式站。
- 实际在隔离运行时通过 HTTP `/api/status` 读取 **9 本/72 章/27 章已写**，包含旧三本原稿 SHA 只读校验、新六本存量章节和任务；`/api/provider-dry-run` 返回 Codex 下一章队列（book-01 第 2 章）、浏览器真实调用开关明确为 false。
- 本机工作台新增 Codex、Claude Code、Gemini CLI 下拉选项及单轮 1–8 章/单章 1–20 分钟预演上限；网页**只有预演，没有实际生成按钮**，避免意外消耗额度。
- `w3_provider_scheduler.py` 支持三种明确 CLI 命令且 `shell=False`，通过 stdin 传输真实提示词，Codex 走 workspace-write 沙箱，Claude/Gemini 输出 JSON 解析；**三种 CLI 的当前用户机器版本尚未联机实测**。
- 默认 dry-run，明确传 `--execute` 才调用模型。重入锁、已有章节不可覆盖、断档拒绝、已尝试记录（跨模型）阻断自动重试、提示词长度上限、输出长度上限、单章运行超时停止、密度失败自动暂停、真实文件保存成功后才更新完成状态、错误日志不包含生成全文/模型 stderr。
- 计划时长与单章调用次数**不等于 token 或人民币预算保证**，不能根据耗时推断实际额度消耗；任何新章未经人工审核词义/IPA/语境/跨书身份，不自动上架。
- 自包含包 `/妙屋英语/小说工厂V1/WordLetter_小说工厂_可直接启动工作台_W3三模型_20261108.zip`，107 个文件、ZIP 完整性通过、SHA256 `feeed0fdfae5763bfa5b8f2cd14e6216174ca6d2cdd8e3e832a07ee4c9816c45`。包含真人工创作旧书原稿和私人词库，**绝不可上传公共仓库**。

## 真实验证与未验证
- 私人本机 HTTP + fake model 回归 **22/22 Python unittest PASS**，含原新六本和老三本只读校验、隔离真实批次创建、三种模拟 CLI、模型调用重复/断章/超时/失败恢复、密度不达标停止、模型预演 API。
- `start_story_factory.py` 一键入口实测 `LAUNCHER_OK 9 27 / 72`，`DRY_RUN_OK True [2]`，浏览器执行 disabled。未消耗模型额度。无 Cloudflare/D1 更改。
- 该会话容器未安装用户已授权登录的任何真实 CLI；不能声称 W3 已通过 Codex/Claude/Gemini 的实际模型生成或词汇自然度。私人 W2.1 浏览器真人点击端到端也还未通过新环境的截图验收，HTTP 接口并不替代浏览器 UX QA。
- 公共 `PR #31` 新增三模型调度**合成合同**，公共 Actions 通过后合并，不消耗私人 GitHub Actions；公共仓库只包含匿名占位测试代码，非私有引擎或书稿。
- 此次没有运行私人 GitHub Actions，没有修改 V1.1 正在开发的站点/预览/D1/用户/出版台，没有创建真实小说新章；当前四级本轮七本计划56章，已写25章，尚余31章。

## 后续最短行动
1. 在**用户自己的已装 Codex CLI 电脑**完整解压包，运行 `python start_story_factory.py`，在本机核对九本任务和预演下一章。这里只需一次 Python 启动。
2. 经确认用户运行授权，再从私人目录执行 `python w3_provider_scheduler.py --engine engine --task engine/production_tasks/book-01 --provider codex --max-chapters 1 --max-minutes 8 --execute`，**真实仅试一章**；检查 `chapters/ch02.json` 和 `reports/calls.jsonl`、密度/语言质量、订阅额度，然后才将上限提高到8章。
3. 如需要可尝试 Claude Code 或 Gemini CLI 对某个新章节做真实兼容性试验，但不能对已尝试章节自动跨模型重试。
4. 真正跑通 W3 后，先审旧三本，再用工作台完成四级剩31章；通过教学内容及真实网站私有权益 Gate 后与 V1.1 冻结预览版统一上线。

## 命令行模式说明
- 用户优先用 Codex：`--provider codex`；
- 可选 Claude Code：`--provider claude`；
- 可选 Gemini CLI：`--provider gemini`；
- 不带 `--execute` 永远不消耗模型；
- 自动重试默认禁止，失败章需人工审核与明确重新批准，不能删除调用日志造成重复扣额度。

## 下一项目 Gate
- W1 公共 UI ✅
- W2.1 私人本机真实任务和批次规划、三模型调度预演 ✅（仅 HTTP/单元测试）
- W3 真实 CLI 单章生成 + 用户电脑兼容性 ⏳
- W3 真实完整8章连续生成 + 失败续跑成本记录 ⏳
- W4 旧3本教学终审/四级31章及题材覆盖 ⏳
- W5 预览站版本留档、小说出版台及权益测试、一次性正式发布 ⏳
