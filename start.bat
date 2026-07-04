@echo off
setlocal enabledelayedexpansion
chcp 65001 > nul

REM ====================================================================
REM Profo Docker 生产部署一键启停脚本 (Windows 版)
REM
REM 用法:
REM   start.bat              启动（后台）
REM   start.bat up           同上
REM   start.bat stop         停止
REM   start.bat restart      重启
REM   start.bat logs         查看全部日志
REM   start.bat status       查看服务状态
REM   start.bat down         停止并删除容器（保留数据卷）
REM   start.bat rebuild      重新构建镜像并启动
REM ====================================================================

cd /d "%~dp0"

REM 首次运行若缺 .env 则从模板复制
if not exist ".env" (
  if exist ".env.docker.example" (
    echo 未检测到 .env，从 .env.docker.example 复制模板...
    copy .env.docker.example .env > nul
    echo [警告] 请编辑 .env 填入真实凭据（POSTGRES_PASSWORD / JWT_SECRET_KEY / ENCRYPTION_KEY 等）后重新运行
    exit /b 1
  ) else (
    echo [错误] 未找到 .env 且无 .env.docker.example 模板
    exit /b 1
  )
)

set "CMD=%~1"
if "%CMD%"=="" set "CMD=up"

if /i "%CMD%"=="up" goto :up
if /i "%CMD%"=="start" goto :up
if /i "%CMD%"=="stop" goto :stop
if /i "%CMD%"=="restart" goto :restart
if /i "%CMD%"=="logs" goto :logs
if /i "%CMD%"=="status" goto :status
if /i "%CMD%"=="ps" goto :status
if /i "%CMD%"=="down" goto :down
if /i "%CMD%"=="rebuild" goto :rebuild
goto :usage

:up
echo 启动 Profo Docker 服务...
docker compose up -d
if errorlevel 1 goto :docker_error
echo.
echo [成功] 服务已启动，访问 http://localhost/
docker compose ps
goto :end

:stop
echo 停止 Profo Docker 服务...
docker compose stop
if errorlevel 1 goto :docker_error
echo [成功] 服务已停止（容器与数据卷保留）
goto :end

:restart
echo 重启 Profo Docker 服务...
docker compose restart
if errorlevel 1 goto :docker_error
echo [成功] 服务已重启
docker compose ps
goto :end

:logs
docker compose logs -f --tail=100
goto :end

:status
docker compose ps
goto :end

:down
echo 停止并删除容器（保留数据卷）...
docker compose down
if errorlevel 1 goto :docker_error
echo [成功] 容器已删除，数据卷 pgdata/uploads 保留
goto :end

:rebuild
echo 重新构建镜像并启动...
docker compose up -d --build
if errorlevel 1 goto :docker_error
echo [成功] 重建完成，访问 http://localhost/
docker compose ps
goto :end

:usage
echo 用法: %0 {up^|stop^|restart^|logs^|status^|down^|rebuild}
exit /b 1

:docker_error
echo [错误] docker compose 命令执行失败
exit /b 1

:end
endlocal
