#!/bin/bash
# 一键启动脚本：检测 Node.js → 首次运行安装依赖 → 初始化数据库 → 启动服务 → 等待就绪 → 打开浏览器
cd "$(dirname "$0")"

mkdir -p logs

if ! command -v node >/dev/null 2>&1; then
  echo "[错误] 未检测到 Node.js，请先安装：https://nodejs.org/zh-cn"
  read -p "按回车键退出..." _
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "首次运行，正在安装依赖，请稍候..."
  npm install || { echo "[错误] 依赖安装失败，请检查网络后重试。"; read -p "按回车键退出..." _; exit 1; }
fi

[ ! -f .env ] && cp .env.example .env

if [ ! -f data/kuajing.db ]; then
  echo "正在初始化本地数据库..."
  npm run db:push || { echo "[错误] 数据库初始化失败。"; read -p "按回车键退出..." _; exit 1; }
fi

echo "正在启动工作台，就绪后会自动打开 http://localhost:3000 ..."
(
  if ! command -v curl >/dev/null 2>&1; then
    sleep 8
    open "http://localhost:3000"
    exit 0
  fi
  for i in $(seq 1 45); do
    if curl -s -o /dev/null --max-time 2 http://localhost:3000/ 2>/dev/null; then
      open "http://localhost:3000"
      exit 0
    fi
    sleep 2
  done
  echo "[错误] 工作台启动失败（等待 90 秒仍未就绪），请查看 logs/server.log"
) &
npm run dev 2>&1 | tee logs/server.log
