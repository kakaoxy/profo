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
docker build --platform linux/amd64 -t profo-frontend:prod ./frontend

# ---- 导出为 tar.gz ----
echo ">> 导出镜像..."
docker save profo-backend:prod | gzip > profo-backend.tar.gz
docker save profo-frontend:prod | gzip > profo-frontend.tar.gz

# ---- scp 传输 ----
echo ">> 传输到服务器 $SERVER_IP:$SERVER_PATH ..."
scp -C profo-backend.tar.gz profo-frontend.tar.gz "$SERVER_USER@$SERVER_IP:$SERVER_PATH/"

echo "✅ 本地构建与传输完成！"
echo "下一步：SSH 到服务器执行以下命令："