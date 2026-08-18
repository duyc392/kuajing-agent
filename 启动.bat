@echo off
chcp 65001 >nul
REM 一键启动脚本：检测 Node.js → 首次运行安装依赖 → 初始化数据库 → 启动服务（日志 logs\server.log）→ 等待就绪 → 打开浏览器
cd /d "%~dp0"

if not exist logs mkdir logs
echo [%date% %time%] 脚本开始执行 > logs\bat.log

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先安装：https://nodejs.org/zh-cn
  echo [错误] 未检测到 Node.js >> logs\bat.log
  pause
  exit /b 1
)
echo [%date% %time%] Node.js 检测通过 >> logs\bat.log

netstat -ano | findstr /C:":3000 " | findstr LISTENING >nul
if not errorlevel 1 (
  echo [错误] 3000 端口已被其他程序占用，请先关闭占用该端口的程序。
  netstat -ano | findstr /C:":3000 " | findstr LISTENING
  echo [错误] 3000 端口被占用 >> logs\bat.log
  pause
  exit /b 1
)
echo [%date% %time%] 端口检测通过 >> logs\bat.log

if not exist node_modules (
  echo 首次运行，正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

if not exist .env copy .env.example .env >nul

if not exist data\kuajing.db (
  echo 正在初始化本地数据库...
  call npm run db:push
  if errorlevel 1 (
    echo [错误] 数据库初始化失败。
    pause
    exit /b 1
  )
)

echo [%date% %time%] 正在启动服务 >> logs\bat.log
echo 正在启动工作台，请稍候（首次启动可能需要十几秒）...
start "kuajing-agent-server" cmd /k "npm run dev > logs\server.log 2>&1 & echo. & echo [服务已停止] 详情见 logs\server.log，可关闭此窗口"

set /a tries=0
:waitloop
curl -s -o nul http://localhost:3000/ && goto ready
set /a tries+=1
if %tries% geq 45 goto fail
ping -n 3 127.0.0.1 >nul
goto waitloop

:fail
echo.
echo [错误] 工作台启动失败（等待 90 秒仍未就绪）。日志内容如下：
echo ------------------------------------------------
type logs\server.log
echo ------------------------------------------------
echo 请把上面这段日志发给开发者排查。
echo [%date% %time%] 启动失败 >> logs\bat.log
pause
exit /b 1

:ready
echo [%date% %time%] 服务就绪 >> logs\bat.log
echo 启动成功，正在打开浏览器 http://localhost:3000 ...
start "" http://localhost:3000
