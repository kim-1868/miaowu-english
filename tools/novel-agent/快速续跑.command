#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
printf '\n🐾 妙屋小说工厂 · V1.2 高效断点续跑\n\n'
OLD_ROOT="$HOME/Documents/WordLetter-Novel-Agent/projects"
if [ ! -d "$OLD_ROOT" ]; then
  printf '未找到 V1 旧项目目录：%s\n' "$OLD_ROOT"
  echo '可以用 README.md 中的命令创建新书。'
  exit 1
fi
# Never start a duplicate writer while an original V1/V1.1 job is active.
if pgrep -f '[p]ython3.*novel_agent.py (wizard|run)' >/dev/null 2>&1; then
  echo '检测到另一项小说生成任务仍在运行。请先切回旧终端，等它完成或已停止，再启动快速续跑。'
  exit 2
fi
projects=()
for folder in "$OLD_ROOT"/*; do
  [ -f "$folder/config.json" ] && projects+=("$folder")
done
if [ "${#projects[@]}" -eq 0 ]; then
  echo '旧目录中没有小说项目。'
  exit 1
fi
echo '检测到的旧小说项目：'
for i in "${!projects[@]}"; do printf '  %s. %s\n' "$((i+1))" "$(basename "${projects[$i]}")"; done
printf '请选择要续跑的序号（回车选 1）：'
read -r choice
choice="${choice:-1}"
if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#projects[@]}" ]; then
  echo '序号无效。'
  exit 1
fi
project="${projects[$((choice-1))]}"
printf '将继续生成：%s\n不会覆盖已经保存的有效章节；仍需后续人工质量审核。\n' "$project"
python3 novel_agent.py run --project "$project" --fast