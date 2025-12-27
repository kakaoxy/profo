@echo off
REM ============================================================
REM Profo Windows 部署脚本
REM 在本地 Windows 执行，构建前端并上传到服务器
REM 使用方式: deploy.bat
REM 前提: 已安装 pnpm, 已配置 SSH 密钥
REM ============================================================

setlocal enabledelayedexpansion

set SERVER_USER=root
set SERVER_HOST=fangmengchina.com
set REMOTE_PATH=/root/profo

echo [INFO] 开始部署 Profo 到服务器...

REM ==================== 构建前端 ====================
echo [INFO] 构建前端...
cd /d "%~dp0..\frontend"

REM 设置生产环境变量
set NEXT_PUBLIC_API_URL=https://fangmengchina.com

call pnpm build
if errorlevel 1 (
    echo [ERROR] 前端构建失败
    exit /b 1
)
echo [INFO] 前端构建完成

REM ==================== 上传文件 ====================
echo [INFO] 上传前端文件...
cd /d "%~dp0.."

REM 使用 scp 上传前端构建产物
scp -r frontend\.next %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/frontend/
scp -r frontend\public %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/frontend/
scp frontend\package.json %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/frontend/
scp frontend\pnpm-lock.yaml %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/frontend/
scp frontend\next.config.ts %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/frontend/

echo [INFO] 上传后端文件...
REM 使用 rsync 通过 WSL 或直接 scp
REM 注意: 排除 .venv 目录
scp -r backend\*.py %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp -r backend\routers %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp -r backend\models %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp -r backend\schemas %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp -r backend\services %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp -r backend\utils %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp -r backend\dependencies %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp -r backend\alembic %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp backend\pyproject.toml %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp backend\uv.lock %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/
scp backend\alembic.ini %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/backend/

echo [INFO] 上传部署配置...
scp -r deploy %SERVER_USER%@%SERVER_HOST%:%REMOTE_PATH%/

echo [INFO] 文件上传完成

REM ==================== 远程安装依赖并重启 ====================
echo [INFO] 远程安装依赖并重启服务...
ssh %SERVER_USER%@%SERVER_HOST% "cd %REMOTE_PATH%/backend && uv sync && cd %REMOTE_PATH%/frontend && pnpm install --prod && pm2 restart profo-backend profo-frontend || pm2 start %REMOTE_PATH%/deploy/ecosystem.config.js"

echo [INFO] ==========================================
echo [INFO] 部署完成!
echo [INFO] 请访问 https://fangmengchina.com 验证
echo [INFO] ==========================================

pause
