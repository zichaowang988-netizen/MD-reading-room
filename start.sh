#!/usr/bin/env bash
# 启动词频阅读室：
#   1. 先在后台起一个本地词典服务（node server.mjs），供「典」按钮离线查词；
#   2. 仍然用 file:// 打开 index.html，这样词表、书签、高亮沿用原来的浏览器存储位置。
#      页面会自动探测 8765-8770 端口上的服务；探测不到就只是没有词典联动，阅读照常。
# 用法：./start.sh [--port 8765] [--stop]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT=8765
STOP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --port=*) PORT="${1#*=}" ;;
    --port) PORT="${2:-8765}"; shift ;;
    --stop) STOP=1 ;;
    [0-9]*) PORT="$1" ;;
  esac
  shift || true
done

server_alive() {
  curl -s --max-time 1 "http://127.0.0.1:$1/api/health" >/dev/null 2>&1
}

if [[ "$STOP" == "1" ]]; then
  stopped=0
  for candidate in $(seq "$PORT" $((PORT + 20))); do
    if server_alive "$candidate"; then
      pkill -f "node ${SCRIPT_DIR}/server.mjs ${candidate}" || true
      printf '已停止端口 %s 上的词典服务。\n' "$candidate"
      stopped=1
    fi
  done
  [[ "$stopped" == "1" ]] || printf '没有正在运行的词典服务。\n'
  exit 0
fi

browser_open() {
  local target="$1"
  if command -v firefox >/dev/null 2>&1; then
    nohup firefox --new-window "$target" >/dev/null 2>&1 &
  elif command -v gio >/dev/null 2>&1 && gio open "$target" >/dev/null 2>&1; then
    return 0
  elif command -v xdg-open >/dev/null 2>&1 && xdg-open "$target" >/dev/null 2>&1; then
    return 0
  elif command -v open >/dev/null 2>&1 && open "$target" >/dev/null 2>&1; then
    return 0
  else
    printf '请手动打开：%s\n' "$target"
  fi
}

start_server() {
  if ! command -v node >/dev/null 2>&1; then
    printf '未找到 node，本地词典联动不可用（阅读功能照常可用）。\n'
    return 1
  fi

  setsid nohup node "$SCRIPT_DIR/server.mjs" "$PORT" >>"$SCRIPT_DIR/.server.log" 2>&1 </dev/null &
  for _ in $(seq 1 40); do
    sleep 0.5
    if server_alive "$PORT"; then return 0; fi
  done
  printf '词典服务未能在端口 %s 启动，详见 .server.log\n' "$PORT"
  return 1
}

if ! server_alive "$PORT"; then
  start_server || true
fi

browser_open "file://$SCRIPT_DIR/index.html"
