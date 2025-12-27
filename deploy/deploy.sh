#!/bin/bash
# ============================================================
# Profo 本地部署脚本
# 在本地执行，构建前端并上传到服务器
# 使用方式: ./deploy.sh
# ============================================================

set -e

# ==================== 配置 ====================
SERVER_USER="root"
SERVER_HOST="fangmengchina.com"  # 或使用服务器IP
REMOTE_PATH="/root/profo"
LOCAL_PATH="$(dirname "$(dirname "$0")")"  # 项目根目录

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ==================== 构建前端 ====================
log_info "开始构建前端..."
cd "$LOCAL_PATH/frontend"

# 检查 pnpm
if ! command -v pnpm &> /dev/null; then
    log_error "pnpm 未安装，请先安装 pnpm"
    exit 1
fi

# 设置生产环境变量
export NEXT_PUBLIC_API_URL="https://fangmengchina.com"

# 构建
pnpm build
log_info "前端构建完成"

# ==================== 打包文件 ====================
log_info "打包文件..."
cd "$LOCAL_PATH"

# 创建临时打包目录
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

# 打包前端
mkdir -p "$TEMP_DIR/frontend"
cp -r frontend/.next "$TEMP_DIR/frontend/"
cp -r frontend/public "$TEMP_DIR/frontend/"
cp frontend/package.json "$TEMP_DIR/frontend/"
cp frontend/pnpm-lock.yaml "$TEMP_DIR/frontend/"
cp frontend/next.config.ts "$TEMP_DIR/frontend/"

# 打包后端 (排除虚拟环境和缓存)
mkdir -p "$TEMP_DIR/backend"
rsync -av --exclude='.venv' --exclude='__pycache__' --exclude='.pytest_cache' \
    --exclude='*.pyc' --exclude='.env' \
    backend/ "$TEMP_DIR/backend/"

# 复制部署配置
cp -r deploy "$TEMP_DIR/"

# 创建压缩包
ARCHIVE_NAME="profo-deploy-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$ARCHIVE_NAME" -C "$TEMP_DIR" .
log_info "打包完成: $ARCHIVE_NAME"

# ==================== 上传到服务器 ====================
log_info "上传到服务器..."
scp "$ARCHIVE_NAME" "$SERVER_USER@$SERVER_HOST:/tmp/"
log_info "上传完成"

# ==================== 远程部署 ====================
log_info "执行远程部署..."
ssh "$SERVER_USER@$SERVER_HOST" << 'REMOTE_SCRIPT'
set -e

REMOTE_PATH="/root/profo"
ARCHIVE_PATH="/tmp/profo-deploy-*.tar.gz"
ARCHIVE_FILE=$(ls -t $ARCHIVE_PATH 2>/dev/null | head -n1)

if [ -z "$ARCHIVE_FILE" ]; then
    echo "未找到部署包"
    exit 1
fi

# 备份现有部署 (如果存在)
if [ -d "$REMOTE_PATH" ]; then
    BACKUP_NAME="${REMOTE_PATH}-backup-$(date +%Y%m%d-%H%M%S)"
    echo "备份现有部署到: $BACKUP_NAME"
    mv "$REMOTE_PATH" "$BACKUP_NAME"
fi

# 创建部署目录
mkdir -p "$REMOTE_PATH"

# 解压
echo "解压部署包..."
tar -xzf "$ARCHIVE_FILE" -C "$REMOTE_PATH"

# 进入后端目录，安装依赖
echo "安装后端依赖..."
cd "$REMOTE_PATH/backend"
if command -v uv &> /dev/null; then
    uv sync
else
    echo "警告: uv 未安装，请手动安装依赖"
fi

# 进入前端目录，安装生产依赖
echo "安装前端依赖..."
cd "$REMOTE_PATH/frontend"
if command -v pnpm &> /dev/null; then
    pnpm install --prod
else
    echo "警告: pnpm 未安装，请手动安装依赖"
fi

# 重启服务
echo "重启服务..."
systemctl daemon-reload
systemctl restart profo-backend || echo "后端服务重启失败，请检查配置"
systemctl restart profo-frontend || echo "前端服务重启失败，请检查配置"

# 清理
rm -f "$ARCHIVE_FILE"

echo "部署完成!"
REMOTE_SCRIPT

# 清理本地打包
rm -f "$ARCHIVE_NAME"

log_info "部署完成!"
log_info "请访问 https://fangmengchina.com 验证"
