#!/bin/bash
set -euo pipefail

# ==================== 配置区 ====================
PROJECT_DIR="/root/profo"
BACKEND_IMAGE="profo-backend:prod"
FRONTEND_IMAGE="profo-frontend:prod"
BACKEND_TAR="profo-backend.tar.gz"
FRONTEND_TAR="profo-frontend.tar.gz"
WAIT_BACKEND=30          # backend 启动+迁移等待秒数
WAIT_FRONTEND=10
# ===============================================

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# 检查必要命令
for cmd in docker git gunzip; do
    if ! command -v $cmd &>/dev/null; then
        log_error "命令 $cmd 未找到，请先安装。"
        exit 1
    fi
done

# 进入项目目录
cd "$PROJECT_DIR" || { log_error "项目目录 $PROJECT_DIR 不存在"; exit 1; }

log_info "开始服务器端部署..."

# 1. 拉取最新代码（同步 docker-compose.yml 等）
if git pull --ff-only; then
    log_info "Git pull 成功"
else
    log_warn "Git pull 失败，继续使用当前代码（可能无远程更新）"
fi

# 2. 加载新镜像
log_info "加载后端镜像..."
if [ -f "$BACKEND_TAR" ]; then
    gunzip -c "$BACKEND_TAR" | docker load || { log_error "后端镜像加载失败"; exit 1; }
else
    log_error "找不到 $BACKEND_TAR，请确认本地传输完成"
    exit 1
fi

log_info "加载前端镜像..."
if [ -f "$FRONTEND_TAR" ]; then
    gunzip -c "$FRONTEND_TAR" | docker load || { log_error "前端镜像加载失败"; exit 1; }
else
    log_error "找不到 $FRONTEND_TAR，请确认本地传输完成"
    exit 1
fi

# 3. 重建 backend（自动执行迁移）
log_info "重启 backend（迁移将自动运行）..."
docker compose up -d --force-recreate --no-build backend

log_info "等待 ${WAIT_BACKEND}s 让迁移执行完成..."
sleep "$WAIT_BACKEND"

# 检查 backend 容器状态
if docker compose ps --filter "status=running" --format "table {{.Name}}" | grep -q "backend"; then
    log_info "✅ backend 运行中"
else
    log_error "backend 未正常运行，请检查日志: docker compose logs backend"
    exit 1
fi

# 4. 重建 frontend
log_info "重启 frontend..."
docker compose up -d --force-recreate --no-build frontend

sleep "$WAIT_FRONTEND"
if docker compose ps --filter "status=running" --format "table {{.Name}}" | grep -q "frontend"; then
    log_info "✅ frontend 运行中"
else
    log_warn "frontend 未运行，请检查日志: docker compose logs frontend"
fi

# 5. 清理压缩包
log_info "清理本地 tar 包..."
rm -f "$BACKEND_TAR" "$FRONTEND_TAR"

log_info "🎉 部署完成！"
log_info "当前容器状态："
docker compose ps