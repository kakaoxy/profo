#!/bin/bash
set -euo pipefail

# ==================== 配置区 ====================
PROJECT_DIR="/root/profo"
BACKEND_IMAGE="profo-backend:prod"
FRONTEND_IMAGE="profo-frontend:prod"
BACKEND_TAR="profo-backend.tar.gz"
FRONTEND_TAR="profo-frontend.tar.gz"
HEALTH_TIMEOUT=120          # 等待 backend 健康的最大秒数
HEALTH_INTERVAL=3           # 每次检查间隔（秒）
FRONTEND_WAIT=10            # 前端启动后简单等待（无健康检查时）
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
    if ! command -v "$cmd" &>/dev/null; then
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

# 3. 启动 backend（容器内会自动运行迁移）
log_info "重启 backend（迁移将自动运行）..."
docker compose up -d --force-recreate --no-build backend

# ---------- 健康检查轮询 ----------
log_info "等待 backend 健康检查通过（超时 ${HEALTH_TIMEOUT}s）..."

# 定义获取后端健康状态的函数
get_backend_health() {
    # 返回容器健康状态：healthy / unhealthy / starting / none
    docker compose ps --format "{{.Name}}\t{{.Health}}" 2>/dev/null | \
        grep -E "backend" | awk '{print $2}' | head -1
}

# 等待指定秒数，同时检查状态
elapsed=0
while [ "$elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    health_status=$(get_backend_health)
    case "$health_status" in
        healthy)
            log_info "✅ backend 已健康"
            break
            ;;
        unhealthy)
            log_error "❌ backend 健康状态为 unhealthy，请检查日志: docker compose logs backend"
            exit 1
            ;;
        starting|"")
            # 尚未就绪，继续等待
            sleep $HEALTH_INTERVAL
            elapsed=$((elapsed + HEALTH_INTERVAL))
            ;;
        *)
            # 未知状态，继续等待
            sleep $HEALTH_INTERVAL
            elapsed=$((elapsed + HEALTH_INTERVAL))
            ;;
    esac
done

# 超时处理
if [ $elapsed -ge $HEALTH_TIMEOUT ]; then
    log_error "等待 backend 健康超时（${HEALTH_TIMEOUT}s），当前状态：$(get_backend_health)"
    log_error "请检查日志: docker compose logs backend"
    exit 1
fi

# 4. 启动 frontend
log_info "重启 frontend..."
docker compose up -d --force-recreate --no-build frontend

# 简单等待前端启动（若前端也有 healthcheck，可类似轮询，但通常前端只是服务）
sleep "$FRONTEND_WAIT"
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
docker compose ps --format "table {{.Name}}\t{{.Status}}"
log_info "✅ 服务器端部署完成！"