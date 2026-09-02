#!/usr/bin/env bash
# 火花守护 SparkKeeper - 一键启动（macOS / Linux）
# 用法：双击，或在终端执行  ./start.sh
# 首次使用请先执行： chmod +x start.sh stop.sh

set -e
cd "$(dirname "$0")"

# 打开浏览器（macOS 用 open，Linux 用 xdg-open，都没有就提示手动访问）
# 注意：必须定义在调用之前，否则前面「端口占用 → 选 2」分支会报 command not found。
open_browser() {
  if command -v open >/dev/null 2>&1; then
    open "http://localhost:5173"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://localhost:5173"
  else
    echo "  请手动打开浏览器访问： http://localhost:5173"
  fi
}

echo ""
echo "  ============================================"
echo "     火花守护 SparkKeeper  -  一键启动"
echo "  ============================================"
echo ""

# ---------- 1. 检测 Node.js ----------
if ! command -v node >/dev/null 2>&1; then
  echo "  [错误] 没有检测到 Node.js"
  echo ""
  echo "  本程序需要 Node.js 20.11 或更高版本。"
  echo "  请到 https://nodejs.org/ 下载安装（选 LTS 版本），然后重新运行本脚本。"
  echo ""
  exit 1
fi

NODE_V=$(node -v | sed 's/^v//')
NODE_MAJOR=$(echo "$NODE_V" | cut -d. -f1)
NODE_MINOR=$(echo "$NODE_V" | cut -d. -f2)
NODE_MINOR=${NODE_MINOR:-0}

if [ "$NODE_MAJOR" -lt 20 ] || { [ "$NODE_MAJOR" -eq 20 ] && [ "$NODE_MINOR" -lt 11 ]; }; then
  echo "  [错误] 当前 Node.js 版本过低：v$NODE_V"
  echo "  本程序需要 20.11 或更高版本，请到 https://nodejs.org/ 更新。"
  echo ""
  exit 1
fi
echo "  [OK]  Node.js 版本 v$NODE_V"

# ---------- 2. 检测依赖 ----------
if [ ! -d "server/node_modules" ] || [ ! -d "web/node_modules" ] || [ ! -d "node_modules" ]; then
  echo ""
  echo "  首次运行，正在安装依赖（约 1-3 分钟，请耐心等待）..."
  echo "  --------------------------------------------"
  npm run install:all || {
    echo ""
    echo "  [错误] 依赖安装失败。请检查网络后重试，或手动执行：npm run install:all"
    exit 1
  }
  echo ""
  echo "  [OK]  依赖安装完成"
else
  echo "  [OK]  依赖已安装"
fi

# ---------- 3. 端口占用检测 ----------
port_in_use() {
  (command -v lsof >/dev/null 2>&1 && lsof -ti:"$1" >/dev/null 2>&1) \
    || (command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 "$1" >/dev/null 2>&1)
}

if port_in_use 3000 || port_in_use 5173; then
  echo ""
  echo "  [提示] 检测到服务可能已在运行（端口 3000 或 5173 被占用）。"
  echo ""
  echo "     1 = 关闭已有服务并重新启动（推荐）"
  echo "     2 = 直接打开网页"
  echo "     3 = 退出"
  echo ""
  read -r -p "  请选择 1/2/3: " choice
  case "$choice" in
    1)
      echo "  正在关闭已有服务..."
      ./stop.sh >/dev/null 2>&1 || true
      sleep 2
      ;;
    2)
      open_browser
      echo "  已打开浏览器。"
      exit 0
      ;;
    *)
      exit 0
      ;;
  esac
fi

# ---------- 4. 启动服务 ----------
echo ""
echo "  正在启动服务..."
echo "  --------------------------------------------"

if command -v osascript >/dev/null 2>&1; then
  # macOS：新开终端窗口，方便看日志
  osascript -e "tell app \"Terminal\" to do script \"cd '$PWD' && npm run dev:server\"" >/dev/null 2>&1
  sleep 3
  osascript -e "tell app \"Terminal\" to do script \"cd '$PWD' && npm run dev:web\"" >/dev/null 2>&1
else
  # Linux / 其他：后台运行，日志写入文件
  mkdir -p .logs
  nohup npm run dev:server > .logs/server.log 2>&1 &
  sleep 3
  nohup npm run dev:web > .logs/web.log 2>&1 &
fi

# ---------- 5. 等待就绪 ----------
echo ""
echo "  正在等待服务启动（最多 60 秒）..."
READY=0
for i in $(seq 1 30); do
  sleep 2
  if curl -s --max-time 2 "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    if curl -s --max-time 2 "http://127.0.0.1:5173" >/dev/null 2>&1; then
      READY=1
      break
    fi
  fi
  printf "."
done
echo ""
echo ""

if [ "$READY" -eq 0 ]; then
  echo "  [警告] 等待超时，服务可能还没起来。"
  echo "  请查看终端窗口里的提示；Linux 用户可查看 .logs/ 目录下的日志。"
  echo "  也可以稍等几秒后手动打开： http://localhost:5173"
  echo ""
  exit 1
fi

# ---------- 6. 打开浏览器 ----------
echo "  [OK]  服务已就绪"
echo ""
echo "  ============================================"
echo "     启动成功！正在打开浏览器..."
echo "  ============================================"
echo ""
echo "  接下来你只需要做三件事："
echo "     1. 点「设置」"
echo "     2. 点「扫码登录」，用抖音 App 扫一下"
echo "     3. 勾选要续火花的好友"
echo ""
echo "  之后每天会自动发送，你不用再管。"
echo ""
echo "  --------------------------------------------"
echo "  需要停止服务时，请运行： ./stop.sh"
echo "  --------------------------------------------"
echo ""

open_browser

echo "  按 Ctrl+C 可退出本脚本（不会影响已启动的服务）。"
echo ""
