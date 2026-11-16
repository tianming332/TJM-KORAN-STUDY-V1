#!/bin/zsh
# 韩语学习系统 启动/关闭开关
# 用法：双击本文件，或终端执行 ./开关.command [start|stop|status]
# 不带参数时自动切换：未运行则启动，已运行则关闭并释放缓存

DIR="${0:A:h}"
PORT=8790
URL="http://127.0.0.1:$PORT/index.html"
PID_FILE="${TMPDIR:-/tmp}/kr_study_server.pid"
LOG_FILE="${TMPDIR:-/tmp}/kr_study_server.log"

is_running() {
  [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
}

start() {
  if is_running; then
    echo "已在运行：$URL"
    open "$URL"; return
  fi
  if lsof -nP -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    echo "端口 $PORT 被其他程序占用，请先关闭该程序。"; return 1
  fi
  # 本地服务器，所有响应带 no-store，浏览器不缓存页面文件
  nohup python3 - "$DIR" "$PORT" >"$LOG_FILE" 2>&1 <<'PY' &
import sys, http.server, functools
directory, port = sys.argv[1], int(sys.argv[2])
class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()
    def log_message(self, *args):
        pass
http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Handler, directory=directory)).serve_forever()
PY
  echo $! > "$PID_FILE"
  sleep 0.6
  if is_running; then
    echo "已启动：$URL"
    [[ -z $NO_OPEN ]] && open "$URL"
  else
    echo "启动失败："; cat "$LOG_FILE"; rm -f "$PID_FILE"; return 1
  fi
}

stop() {
  if is_running; then
    kill "$(cat "$PID_FILE")" 2>/dev/null
    echo "已关闭服务器，端口 $PORT 已释放。"
  else
    echo "服务器未在运行。"
  fi
  # 释放缓存：删除运行时产生的临时文件
  rm -f "$PID_FILE" "$LOG_FILE"
  echo "临时文件已清理。（错题本、生词本、标记保留在浏览器中，不会删除）"
}

case "$1" in
  start)  start ;;
  stop)   stop ;;
  status) is_running && echo "运行中：$URL" || echo "未运行" ;;
  "")     is_running && stop || start ;;
  *)      echo "用法：$0 [start|stop|status]" ;;
esac
