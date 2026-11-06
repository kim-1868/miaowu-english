#!/bin/bash
set -e
cd "$(dirname "$0")"
clear
printf '🐾 妙屋英语 WordLetter · 小说工厂 V2\n\n'
if ! command -v python3 >/dev/null 2>&1; then
  echo '未找到 Python 3。请先在终端执行 python3 --version。'
  read -r -p '按回车关闭...' _;exit 1
fi
printf '1. 创建新的批量生产计划（先规划，启动生成需再确认）\n'
printf '2. 继续已有批次（只续跑未完成部分）\n'
printf '3. 查看已有批次进度\n'
printf '4. 导出已有批次候选 ZIP\n'
printf '5. 单本小说生成（兼容上一版）\n'
printf '0. 退出\n\n'
read -r -p '请选择 [默认1]：' choice
choice=${choice:-1}
if [[ "$choice" == "1" ]]; then
  python3 factory_v2.py wizard
elif [[ "$choice" == "5" ]]; then
  python3 novel_agent.py wizard --out-root "./projects"
elif [[ "$choice" == "0" ]]; then
  exit 0
elif [[ "$choice" == "2" || "$choice" == "3" || "$choice" == "4" ]]; then
  mkdir -p batches
  mapfile_available=0
  dirs=()
  while IFS= read -r line; do dirs+=("$line"); done < <(find "$PWD/batches" -mindepth 1 -maxdepth 1 -type d -name 'batch-*' | sort)
  if [[ ${#dirs[@]} -eq 0 ]]; then
    echo '还没有任何批次。请先选 1 创建批次。'
  else
    echo ''; for ((i=0; i<${#dirs[@]}; i++)); do printf '%s) %s\n' "$((i+1))" "${dirs[i]##*/}"; done
    read -r -p '输入批次序号：' index
    if ! [[ "$index" =~ ^[0-9]+$ ]] || ((index < 1 || index > ${#dirs[@]})); then
      echo '无效序号，不执行生成。'
    else
      path="${dirs[index-1]}"
      if [[ "$choice" == "2" ]]; then
        echo '即将连接 Codex 继续生产；请确认旧 V1 没有同时占用 Codex。'
        read -r -p '输入 YES 确认：' ok
        if [[ "$ok" == "YES" ]]; then python3 factory_v2.py run --batch "$path";else echo '已取消';fi
      elif [[ "$choice" == "3" ]]; then python3 factory_v2.py status --batch "$path"
      else python3 factory_v2.py export --batch "$path";fi
    fi
  fi
else
  echo '无效选项；未执行任何操作。'
fi
printf '\n'
read -r -p '按回车返回桌面...' _