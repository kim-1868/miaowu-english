#!/bin/bash
set -e
cd "$(dirname "$0")"
printf '\n🐾 妙屋英语 WordLetter 小说生产 Agent\n\n'
if ! command -v python3 >/dev/null 2>&1; then
  echo '错误：未找到 python3。请先安装 Python 3.9+。'
  exit 1
fi
if ! command -v codex >/dev/null 2>&1; then
  echo '提示：尚未找到 Codex CLI。本工具可创建项目/离线测试，但真正 AI 写小说需要先安装并登录 codex。'
  echo '参考 README.md / https://github.com/openai/codex'
  echo
fi
python3 novel_agent.py wizard --out-root "./projects"