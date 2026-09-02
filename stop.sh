#!/usr/bin/env bash
# 火花守护 SparkKeeper - 停止服务（macOS / Linux）
# 用法： ./stop.sh
# 首次使用请先执行： chmod +x start.sh stop.sh

cd "$(dirname "$0")"

echo ""
echo "  ============================================"
echo "     火花守护 SparkKeeper  -  停止服务"
echo "  ============================================"
echo ""

FOUND=0

kill_port() {
  local port="$1"
  local label="$2"
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids=$(lsof -ti:"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
      echo "  正在关闭 $label（端口 $port）"
      # shellcheck disable=SC2086
      kill -9 $pids 2>/dev/null
      FOUND=1
    fi
  elif command -v fuser >/dev/null 2>&1; then
    if fuser -n tcp "$port" >/dev/null 2>&1; then
      echo "  正在关闭 $label（端口 $port）"
      fuser -k -n tcp "$port" 2>/dev/null
      FOUND=1
    fi
  fi
}

kill_port 3000 "后端服务"
kill_port 5173 "前端服务"

# 兜底：关掉本项目启动的 vite / tsx 进程（按命令行特征匹配，尽量不误伤其他项目）
if pgrep -f "douyin-streak" >/dev/null 2>&1; then
  pkill -f "douyin-streak" 2>/dev/null && FOUND=1
fi

echo ""
if [ "$FOUND" -eq 0 ]; then
  echo "  [OK]  当前没有运行中的服务。"
else
  echo "  [OK]  服务已全部停止。"
fi
echo ""
echo "  重新启动请运行： ./start.sh"
echo ""
