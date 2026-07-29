#!/bin/bash
set -e

# ---- 变量配置（按需修改） ----
PROJECT_DIR="/Users/bugco/Desktop/profo"
SERVER_USER="root"
SERVER_IP="139.224.162.134"
SERVER_PATH="/root/profo"

# ---- 构建 amd64 镜像 ----
cd "$PROJECT_DIR"
echo ">> 构建 backend (amd64)..."
docker build --platform linux/amd64 -t profo-backend:prod ./backend

echo ">> 构建 frontend (amd64)..."
# PRODUCTION_DOMAIN 是可选的（Next.js 自动允许同源 Host）
# 仅当 nginx 不传递 Host 头时才需要设置：
#   export PRODUCTION_DOMAIN=你的域名
docker build --platform linux/amd64 \
    --build-arg PRODUCTION_DOMAIN="${PRODUCTION_DOMAIN:-}" \
    -t profo-frontend:prod ./frontend

# ---- 导出为 tar.gz ----
echo ">> 导出镜像..."
docker save profo-backend:prod | gzip > profo-backend.tar.gz
docker save profo-frontend:prod | gzip > profo-frontend.tar.gz

# ---- scp 传输 ----
# 镜像 + docker-compose.yml + deploy-server.sh 一起传，让服务器完全脱离 Git 依赖
# .env 不传：服务器有独立的生产配置（JWT/ENCRYPTION_KEY 与本地 dev 不同，覆盖会导致数据无法解密）
echo ">> 传输到服务器 $SERVER_IP:$SERVER_PATH ..."
scp -C profo-backend.tar.gz profo-frontend.tar.gz \
    docker-compose.yml deploy-server.sh \
    "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"

# ---- 远程触发服务器端部署 ----
# deploy-server.sh 通过上一步 scp 同步到服务器，不再依赖 git pull
echo ">> SSH 远程触发 deploy-server.sh ..."
# BatchMode=yes: 免密失效时直接失败，避免卡在密码交互
ssh -o BatchMode=yes "$SERVER_USER@$SERVER_IP" "bash $SERVER_PATH/deploy-server.sh"

# ---- 清理本地 tar 包 ----
echo ">> 清理本地 tar 包..."
rm -f profo-backend.tar.gz profo-frontend.tar.gz

# ---- 清理本地悬挂镜像 ----
# 反复构建同标签镜像会产生 <none> 悬挂镜像，清理防止本地磁盘累积
echo ">> 清理本地悬挂镜像..."
docker image prune -f

echo "✅ 全流程部署完成！"