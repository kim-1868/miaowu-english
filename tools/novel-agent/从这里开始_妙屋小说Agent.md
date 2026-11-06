# 妙屋英语小说 Agent：开始使用

**你现在拿到的是可执行的本地生产工具，不是单独的提示词。** 运行前只需先安装并登录一次 Codex，后续输入小说题材即可创建完整新书项目。

## 第 1 次安装（Mac）

1. 将整个 ZIP 文件解压到 Mac `文稿/Documents` 目录；保持解压后的文件夹名为 `WordLetter-Novel-Agent`。
2. 打开终端 Terminal；安装 Codex：
   ```bash
   npm install -g @openai/codex
   ```
   若 npm 安装提示权限问题，请先别用 `sudo`，把报错截图发给我；也可以按官方独立安装说明操作：https://github.com/openai/codex
3. 输入 `codex` → 选择 **Sign in with ChatGPT** → 完成网页授权。不要向任何人发送登录凭证。
4. 输入：
   ```bash
   cd ~/Documents/WordLetter-Novel-Agent
   bash start.command
   ```
5. 按提示填写：书名、题材、等级（cet4 / cet6 / postgrad / ielts）、章节数、目标词数。选 `y` 后会分阶段写作与审校。

## 验收与交付

完成后在文件夹内 `projects/<本书目录>/` 查找：

- `WordLetter_..._审核待确认.zip`：你的小说内容生产包。
- `output/出版台导入包.json`：格式对照此前真实上架 JSON，但仍需在**当前运营台**实际预检。
- `output/质量与覆盖报告.md` 和 `output/QA.json`：问题清单与复现比例。
- `review/`：AI 初审意见。**AI 初审不代替人工词义、词典 IPA、原创版权、付费权限核验。**

**安全边界：** 工具不自动发码、不上架、不修改线上 D1，也不需要上传此前 16MB 的生产数据库 SQL。

如果首次运行中断，不要删除项目文件，重跑 `python3 novel_agent.py run --project projects/<本书目录>` 即可续跑。