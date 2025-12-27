#!/bin/bash
# ============================================================
# Profo 服务器初始化脚本
# 在服务器上执行，安装必要环境和配置服务
# 使用方式: bash setup-server.sh
# ============================================================

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

DOMAIN="fangmengchina.com"

# ==================== 检查 root 权限 ====================
if [ "$EUID" -ne 0 ]; then
    log_error "请使用 root 用户运行此脚本"
    exit 1
fi

# ==================== 安装基础依赖 ====================
log_info "更新系统包..."
apt update

log_info "安装基础工具..."
apt install -y curl wget git rsync

# ==================== 安装 Node.js 和 pnpm ====================
log_info "检查 Node.js..."
if ! command -v node &> /dev/null; then
    log_info "安装 Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
node --version

log_info "检查 pnpm..."
if ! command -v pnpm &> /dev/null; then
    log_info "安装 pnpm..."
    npm install -g pnpm
fi
pnpm --version

# ==================== 安装 Python 和 uv ====================
log_info "检查 Python..."
if ! command -v python3 &> /dev/null; then
    log_info "安装 Python..."
    apt install -y python3 python3-pip
fi
python3 --version

log_info "检查 uv..."
if ! command -v uv &> /dev/null; then
    log_info "安装 uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    # 添加到 PATH
    export PATH="$HOME/.local/bin:$PATH"
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
fi

# ==================== 安装 certbot (HTTPS) ====================
log_info "检查 certbot..."
if ! command -v certbot &> /dev/null; then
    log_info "安装 certbot..."
    apt install -y certbot python3-certbot-nginx
fi

# ==================== 申请 SSL 证书 ====================
log_info "申请 SSL 证书..."
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    log_warn "即将申请 SSL 证书，请确保域名 $DOMAIN 已解析到此服务器"
    read -p "是否继续? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        certbot certonly --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN
    else
        log_warn "跳过证书申请，请稍后手动执行: certbot certonly --nginx -d $DOMAIN -d www.$DOMAIN"
    fi
else
    log_info "SSL 证书已存在"
fi

# ==================== 配置 Nginx ====================
log_info "配置 Nginx..."
DEPLOY_DIR="/root/profo/deploy"

if [ -f "$DEPLOY_DIR/profo-nginx.conf" ]; then
    cp "$DEPLOY_DIR/profo-nginx.conf" /etc/nginx/sites-available/profo
    
    # 创建软链接 (如果不存在)
    if [ ! -L "/etc/nginx/sites-enabled/profo" ]; then
        ln -s /etc/nginx/sites-available/profo /etc/nginx/sites-enabled/profo
    fi
    
    # 测试配置
    nginx -t
    systemctl reload nginx
    log_info "Nginx 配置完成"
else
    log_warn "Nginx 配置文件不存在: $DEPLOY_DIR/profo-nginx.conf"
fi

# ==================== 配置 systemd 服务 ====================
log_info "配置 systemd 服务..."

if [ -f "$DEPLOY_DIR/profo-backend.service" ]; then
    cp "$DEPLOY_DIR/profo-backend.service" /etc/systemd/system/
    log_info "后端服务配置完成"
fi

if [ -f "$DEPLOY_DIR/profo-frontend.service" ]; then
    cp "$DEPLOY_DIR/profo-frontend.service" /etc/systemd/system/
    log_info "前端服务配置完成"
fi

# 重新加载 systemd
systemctl daemon-reload

# 启用开机自启
systemctl enable profo-backend
systemctl enable profo-frontend

log_info "systemd 服务配置完成"

# ==================== 完成 ====================
echo ""
log_info "=========================================="
log_info "服务器初始化完成!"
log_info "=========================================="
echo ""
log_info "后续步骤:"
echo "  1. 配置后端环境变量: /root/profo/backend/.env"
echo "  2. 配置前端环境变量: /root/profo/frontend/.env.local"
echo "  3. 启动服务:"
echo "     systemctl start profo-backend"
echo "     systemctl start profo-frontend"
echo "  4. 查看日志:"
echo "     journalctl -u profo-backend -f"
echo "     journalctl -u profo-frontend -f"
echo ""
