@echo off
REM 递归调用保护：start cmd /k 创建的新进程会继承 DEV_START_GUARD。
REM 当串行调用异常时，新进程的 dev-start.bat 检测到该变量后立即退出。
if defined DEV_START_GUARD (
  echo [错误] dev-start.bat 检测到递归调用，已终止。
  echo    可能原因：start cmd /k 在串行调用中出现的二次调度。
  exit /b 1
)
setlocal enabledelayedexpansion
set "DEV_START_GUARD=1"
chcp 65001 > nul

REM ====================================================================
REM Profo 本地开发一键启停脚本 (Windows 版)
REM
REM 架构：Docker 的 PostgreSQL + 后端 uvicorn --reload + 前端 next dev
REM 前后端代码改动自动重载，无需 docker rebuild。
REM
REM 与 start.bat 的区别：
REM   start.bat         生产环境部署，全部重建，本地代码改动需 rebuild
REM   dev-start.bat     本地开发仅起 db 容器，前后端本地直接运行。
REM
REM 用法:
REM   dev-start.bat            启动全部（db + backend + frontend）
REM   dev-start.bat up         同上
REM   dev-start.bat db         只启动数据库（前后端自行终端运行）
REM   dev-start.bat stop       停止数据库容器
REM   dev-start.bat status     查看容器与端口状态
REM   dev-start.bat logs       查看数据库日志
REM   dev-start.bat down       停止并删除容器（保留数据卷）
REM ====================================================================

cd /d "%~dp0"

set "DEV_COMPOSE=docker compose -f docker-compose.yml -f docker-compose.dev.yml"

REM 绕过 HTTP 代理（Clash/V2Ray 等）对本地请求的拦截
REM 代理软件会设置 HTTP_PROXY，导致 fetch 127.0.0.1:8000 走代理 -> 502
set "NO_PROXY=127.0.0.1,localhost,0.0.0.0"
set "no_proxy=127.0.0.1,localhost,0.0.0.0"

REM 检查根目录 .env
if not exist ".env" (
  echo [错误] 未检测到根目录 .env
  echo    请先执行: copy .env.docker.example .env 并填入 POSTGRES_* 凭据
  exit /b 1
)

REM 从 .env 读取 POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
REM 关闭延迟展开，避免密码中的 !/&/^ 等特殊字符被破坏
setlocal disabledelayedexpansion
set "POSTGRES_USER="
set "POSTGRES_PASSWORD="
set "POSTGRES_DB="
set "REDIS_PASSWORD="
for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="POSTGRES_USER" set "POSTGRES_USER=%%b"
  if /i "%%a"=="POSTGRES_PASSWORD" set "POSTGRES_PASSWORD=%%b"
  if /i "%%a"=="POSTGRES_DB" set "POSTGRES_DB=%%b"
  if /i "%%a"=="REDIS_PASSWORD" set "REDIS_PASSWORD=%%b"
)

if not defined POSTGRES_USER (
  echo [错误] .env 中未找到 POSTGRES_USER
  exit /b 1
)
if not defined POSTGRES_PASSWORD (
  echo [错误] .env 中未找到 POSTGRES_PASSWORD
  exit /b 1
)
if not defined POSTGRES_DB (
  echo [错误] .env 中未找到 POSTGRES_DB
  exit /b 1
)
if not defined REDIS_PASSWORD (
  echo [错误] .env 中未找到 REDIS_PASSWORD
  echo    请运行 init-env.ps1 或 init-env.bat 生成凭据
  exit /b 1
)

REM 本地启动时，backend 直连映射出来的 Docker db
set "DATABASE_URL=postgresql+psycopg://%POSTGRES_USER%:%POSTGRES_PASSWORD%@127.0.0.1:5432/%POSTGRES_DB%"
set "REDIS_URL=redis://:%REDIS_PASSWORD%@127.0.0.1:6379/0"
set "DEBUG=true"
REM 覆盖 .env 中的 UPLOAD_DIR=/app/static/uploads（Docker 容器内路径）
REM Windows 下 Python Path("/app/...") 解析为当前驱动器根（如 D:\app\static\uploads），
REM 与 FastAPI 静态挂载根 backend/static 不一致，会导致上传成功但预览 404。
REM 本地 dev 显式指向 backend/static/uploads 的绝对路径，与 main.py 静态挂载根一致。
set "UPLOAD_DIR=%~dp0backend\static\uploads"
REM 将拼装结果导出到外层作用域（endlocal 会清除内层变量）
endlocal & set "DATABASE_URL=%DATABASE_URL%" & set "REDIS_URL=%REDIS_URL%" & set "DEBUG=%DEBUG%" & set "UPLOAD_DIR=%UPLOAD_DIR%" & set "POSTGRES_USER=%POSTGRES_USER%" & set "POSTGRES_DB=%POSTGRES_DB%" & set "NO_PROXY=%NO_PROXY%" & set "no_proxy=%no_proxy%"

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
  echo [错误] frontend\node_modules 不存在，执行 pnpm install...
  pushd frontend
  call pnpm install
  popd
)

REM 创建 backend\static\uploads 链接 -> ..\..\uploads
REM 本地 dev 模式与 Docker 共享同一份上传文件
REM Windows 需要管理员权限或开发者模式才能创建 junction 链接
if not exist "backend\static" mkdir "backend\static"
if exist "backend\static\uploads" (
  REM 检查是否已是 junction/链接
  dir /al "backend\static\uploads" 2>nul | findstr "JUNCTION\|SYMLINK" > nul
  if errorlevel 1 (
    echo [警告] backend\static\uploads 是实目录而非 junction
    echo    如需共享 Docker uploads，请删除该目录: rmdir /s /q backend\static\uploads
    echo    当前 dev 模式使用独立的本地 uploads，与 Docker 不互通
  )
) else (
  mklink /J "backend\static\uploads" "%~dp0uploads" > nul 2>&1
  if errorlevel 1 (
    echo [警告] 创建 junction 失败，backend\static\uploads 使用独立目录
    echo    如需共享请手动执行: mklink /J backend\static\uploads ..\..\uploads
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

REM ====================================================================
REM 检查 Docker 守护进程是否运行
REM ====================================================================
:check_docker
docker info >nul 2>&1
if errorlevel 1 (
  echo [错误] Docker 守护进程未运行
  echo    请启动 Docker Desktop 后重试
  echo    或检查 Docker 是否正确安装
  exit /b 1
)
goto :eof

REM ====================================================================
REM 端口预检：检查指定端口是否被占用
REM 参数: %1=端口号 %2=服务名称
REM ====================================================================
:check_port
set "PORT_NUM=%~1"
set "PORT_NAME=%~2"
netstat -ano | findstr "LISTENING" | findstr ":%PORT_NUM% " >nul 2>&1
if not errorlevel 1 (
  echo [错误] 端口 %PORT_NUM% ^(%PORT_NAME%^) 已被占用
  echo    请先终止占用该端口的进程，或检查是否已有服务在运行
  netstat -ano | findstr "LISTENING" | findstr ":%PORT_NUM% "
  exit /b 1
)
exit /b 0

:start_db
call :check_docker
if errorlevel 1 exit /b 1
echo 启动 PostgreSQL ^& Redis (Docker)...
%DEV_COMPOSE% up -d db redis
if errorlevel 1 (
  echo [错误] 启动数据库失败
  exit /b 1
)
echo [成功] 数据库已启动: postgresql+psycopg://%POSTGRES_USER%:***@127.0.0.1:5432/%POSTGRES_DB%
goto :eof

:up
REM 端口预检（db 端口 5432/6379 由 Docker 管理，无需检查）
call :check_port 8000 "backend"
if errorlevel 1 exit /b 1
call :check_port 3000 "frontend"
if errorlevel 1 exit /b 1
call :start_db
if errorlevel 1 (
  echo [错误] 数据库启动失败，前后端未启动
  exit /b 1
)
echo.
echo 启动后端 (uvicorn --reload) 与前端 (next dev)...
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:3000
echo   (关闭本窗口可停止前后端，数据库保留运行)
echo.

REM 新窗口启动 backend，便于查看日志，关闭窗口即停止。
REM DATABASE_URL / DEBUG 经 setlocal 作用域，start 会创建新进程继承，
REM 避免在命令行再次 set，否则当密码含 &/!/^ 等特殊字符时破坏 cmd /k 解析。
pushd backend
start "Profo Backend" cmd /k ".venv\Scripts\uvicorn.exe main:app --reload --host 0.0.0.0 --port 8000"
popd

REM 新窗口启动 frontend
pushd frontend
start "Profo Frontend" cmd /k "pnpm dev"
popd

echo [成功] 前后端已在新窗口启动
echo.
echo 停止数据库: dev-start.bat stop
goto :end

:db
call :start_db
if errorlevel 1 exit /b 1
echo.
echo 数据库已启动，请在各自终端分别运行：
echo   cd backend ^&^& .venv\Scripts\uvicorn.exe main:app --reload --port 8000
echo   cd frontend ^&^& pnpm dev
echo.
echo 或直接执行: dev-start.bat  (一键启动全部)
goto :end

:stop
echo 停止数据库容器...
%DEV_COMPOSE% stop db
if errorlevel 1 goto :docker_error
echo [成功] 已停止。前后端进程请关闭对应窗口。
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
echo [成功] 容器已删除（pgdata volume 保留）
goto :end

:usage
echo 用法: %0 {up^|db^|stop^|status^|logs^|down}
echo.
echo   up       启动全部（db + backend + frontend），默认
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
