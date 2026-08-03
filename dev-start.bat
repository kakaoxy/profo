@echo off
REM 递归防护：start cmd /k 启动的新进程会继承 DEV_START_GUARD，
REM 若因命令串解析异常意外重新进入 dev-start.bat，立即拦截并退出。
if defined DEV_START_GUARD (
  echo [错误] dev-start.bat 检测到递归调用，已阻止。
  echo    可能原因：start cmd /k 的命令串被密码中的特殊字符破坏。
  exit /b 1
)
setlocal enabledelayedexpansion
set "DEV_START_GUARD=1"
chcp 65001 > nul

REM ====================================================================
REM Profo 开发环境一键启停脚本 (Windows 版)
REM
REM 架构：Docker 跑 PostgreSQL + 本地 uvicorn --reload + 本地 next dev
REM 前后端代码改动自动热重载，无需 docker rebuild。
REM
REM 与 start.bat 的区别：
REM   start.bat         生产部署，四服务全部容器化，改代码需 rebuild
REM   dev-start.bat     本地开发，仅 db 容器化，前后端本机直跑热重载
REM
REM 用法:
REM   dev-start.bat            启动全部（db + backend + frontend）
REM   dev-start.bat up         同上
REM   dev-start.bat db         只启动数据库（前后端自己开终端跑）
REM   dev-start.bat stop       停止数据库容器
REM   dev-start.bat status     查看容器与端口状态
REM   dev-start.bat logs       查看数据库日志
REM   dev-start.bat down       停止并删除容器（保留数据卷）
REM ====================================================================

cd /d "%~dp0"

set "DEV_COMPOSE=docker compose -f docker-compose.yml -f docker-compose.dev.yml"

REM 检查根目录 .env
if not exist ".env" (
  echo [错误] 未检测到根目录 .env
  echo    请先执行: copy .env.docker.example .env 并填入 POSTGRES_* 等凭据
  exit /b 1
)

REM 从 .env 读取 POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
set "POSTGRES_USER="
set "POSTGRES_PASSWORD="
set "POSTGRES_DB="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  set "key=%%a"
  set "val=%%b"
  if /i "!key!"=="POSTGRES_USER" set "POSTGRES_USER=!val!"
  if /i "!key!"=="POSTGRES_PASSWORD" set "POSTGRES_PASSWORD=!val!"
  if /i "!key!"=="POSTGRES_DB" set "POSTGRES_DB=!val!"
)

if "!POSTGRES_USER!"=="" (
  echo [错误] .env 中未找到 POSTGRES_USER
  exit /b 1
)
if "!POSTGRES_PASSWORD!"=="" (
  echo [错误] .env 中未找到 POSTGRES_PASSWORD
  exit /b 1
)
if "!POSTGRES_DB!"=="" (
  echo [错误] .env 中未找到 POSTGRES_DB
  exit /b 1
)

REM 开发环境覆盖：backend 直连本地映射的 Docker db
set "DATABASE_URL=postgresql+psycopg://!POSTGRES_USER!:!POSTGRES_PASSWORD!@127.0.0.1:5432/!POSTGRES_DB!"
set "DEBUG=true"

REM 检查 backend\.venv
if not exist "backend\.venv\Scripts\uvicorn.exe" (
  if not exist "backend\.venv\Scripts\uvicorn" (
    echo [错误] backend\.venv 不存在或缺少 uvicorn
    echo    请执行: cd backend ^&^& uv sync
    exit /b 1
  )
)

REM 检查 frontend\node_modules
if not exist "frontend\node_modules" (
  echo [警告] frontend\node_modules 不存在，执行 pnpm install...
  pushd frontend
  call pnpm install
  popd
)

REM 创建 backend\static\uploads 软链 → ..\..\uploads
REM 让本地 dev 模式与 Docker 容器共享同一份上传文件
REM Windows 需要管理员权限或开发者模式创建软链，故用 junction 替代
if not exist "backend\static" mkdir "backend\static"
if exist "backend\static\uploads" (
  REM 检查是否已是 junction/软链
  dir /al "backend\static\uploads" 2>nul | findstr "JUNCTION\|SYMLINK" > nul
  if errorlevel 1 (
    echo [警告] backend\static\uploads 是真实目录而非 junction
    echo    如需共享 Docker uploads，请先删除该目录: rmdir /s /q backend\static\uploads
    echo    当前 dev 模式将使用独立的本地 uploads，与 Docker 不互通
  )
) else (
  mklink /J "backend\static\uploads" "%~dp0uploads" > nul 2>&1
  if errorlevel 1 (
    echo [警告] 创建 junction 失败，backend\static\uploads 将使用独立目录
    echo    如需共享，请手动执行: mklink /J backend\static\uploads ..\..\uploads
  ) else (
    echo [成功] 已创建 junction backend\static\uploads -^> ..\..\uploads（共享 uploads 目录）
  )
)

set "CMD=%~1"
if "%CMD%"=="" set "CMD=up"

if /i "%CMD%"=="up" goto :up
if /i "%CMD%"=="start" goto :up
if /i "%CMD%"=="db" goto :db
if /i "%CMD%"=="stop" goto :stop
if /i "%CMD%"=="status" goto :status
if /i "%CMD%"=="ps" goto :status
if /i "%CMD%"=="logs" goto :logs
if /i "%CMD%"=="down" goto :down
goto :usage

:start_db
echo 启动 PostgreSQL (Docker)...
%DEV_COMPOSE% up -d db
if errorlevel 1 (
  echo [错误] 启动数据库失败
  exit /b 1
)
echo [成功] 数据库已启动: postgresql+psycopg://!POSTGRES_USER!:***@127.0.0.1:5432/!POSTGRES_DB!
goto :eof

:up
call :start_db
echo.
echo 启动后端 (uvicorn --reload) 与前端 (next dev)...
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo   (关闭本窗口会停止前后端，数据库保留运行)
echo.

REM 在新窗口启动 backend（便于查看日志，关闭窗口即停止）
REM DATABASE_URL / DEBUG 已在 setlocal 块中设置，start 创建的新进程会继承，
REM 无需在命令串里再次 set，避免密码含 &/!/^ 等特殊字符时破坏 cmd /k 解析。
pushd backend
start "Profo Backend" cmd /k ".venv\Scripts\uvicorn.exe main:app --reload --host 0.0.0.0 --port 8000"
popd

REM 在新窗口启动 frontend
pushd frontend
start "Profo Frontend" cmd /k "pnpm dev"
popd

echo [成功] 前后端已在新窗口启动
echo.
echo 停止数据库: dev-start.bat stop
goto :end

:db
call :start_db
echo.
echo 数据库已启动，请在两个终端分别运行：
echo   cd backend ^&^& .venv\Scripts\uvicorn.exe main:app --reload --port 8000
echo   cd frontend ^&^& pnpm dev
echo.
echo 或直接执行: dev-start.bat  (一键启动全部)
goto :end

:stop
echo 停止数据库容器...
%DEV_COMPOSE% stop db
if errorlevel 1 goto :docker_error
echo [成功] 已停止（本地前后端进程请关闭对应窗口）
goto :end

:status
%DEV_COMPOSE% ps
echo.
echo 本地端口占用:
netstat -ano | findstr ":8000 :3000" | findstr "LISTENING" 2>nul
if errorlevel 1 echo   8000/3000 端口空闲
goto :end

:logs
%DEV_COMPOSE% logs -f db
goto :end

:down
echo 停止并删除容器（保留数据卷）...
%DEV_COMPOSE% down
if errorlevel 1 goto :docker_error
echo [成功] 容器已删除，pgdata volume 保留
goto :end

:usage
echo 用法: %0 {up^|db^|stop^|status^|logs^|down}
echo.
echo   up       启动全部（db + backend + frontend）— 默认
echo   db       只启动数据库
echo   stop     停止数据库容器
echo   status   查看容器与端口状态
echo   logs     查看数据库日志
echo   down     停止并删除容器（保留数据卷）
exit /b 1

:docker_error
echo [错误] docker compose 命令执行失败
exit /b 1

:end
endlocal
exit /b 0
