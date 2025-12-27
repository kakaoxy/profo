#!/bin/bash
# ProFo 部署脚本
# 在服务器上运行: chmod +x deploy.sh && ./deploy.sh

set -e

echo "========== ProFo 部署脚本 =========="

# 配置变量 (根据实际情况修改)
DOMAIN="profo.example.com"           # 你的域名
PROJECT_DIR="/opt/profo"             # 项目目录
FRONTEND_PORT=3000
BACKEND_PORT=8000

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}1. 安装系统依赖${NC}"
sudo apt update
sudo apt install -y nginx python3.12 python3.12-venv nodejs npm

# 安装 pnpm
npm install -g pnpm

echo -e "${YELLOW}2. 创建项目目录${NC}"
sudo mkdir -p $PROJECT_DIR
sudo chown $USER:$USER $PROJECT_DIR

echo -e "${YELLOW}3. 部署后端 (FastAPI)${NC}"
cd $PROJECT_DIR/backend

# 创建虚拟环境
python3.12 -m venv .venv
source .venv/bin/activate

# 安装依赖 (使用 uv 或 pip)
if command -v uv &> /dev/null; then
    uv pip install -r requirements.txt
else
    pip install -r requirements.txt
fi

# 创建 systemd 服务
sudo tee /etc/systemd/system/profo-backend.service > /dev/null <<EOF
[Unit]
Description=ProFo Backend (FastAPI)
After=network.target

[Service]
User=$USER
WorkingDirectory=$PROJECT_DIR/backend
Environment="PATH=$PROJECT_DIR/backend/.venv/bin"
ExecStart=$PROJECT_DIR/backend/.venv/bin/uvicorn main:app --host 0.0.0.0 --port $BACKEND_PORT
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable profo-backend
sudo systemctl restart profo-backend

echo -e "${GREEN}✓ 后端服务已启动${NC}"

echo -e "${YELLOW}4. 部署前端 (Next.js)${NC}"
cd $PROJECT_DIR/frontend

# 安装依赖并构建
pnpm install
pnpm build

# 创建 systemd 服务
sudo tee /etc/systemd/system/profo-frontend.service > /dev/null <<EOF
[Unit]
Description=ProFo Frontend (Next.js)
After=network.target

[Service]
User=$USER
WorkingDirectory=$PROJECT_DIR/frontend
Environment="NODE_ENV=production"
Environment="NEXT_PUBLIC_API_URL=https://$DOMAIN"
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable profo-frontend
sudo systemctl restart profo-frontend

echo -e "${GREEN}✓ 前端服务已启动${NC}"

echo -e "${YELLOW}5. 配置 Nginx${NC}"
sudo cp $PROJECT_DIR/deploy/nginx.conf /etc/nginx/sites-available/profo

# 替换域名
sudo sed -i "s/profo.example.com/$DOMAIN/g" /etc/nginx/sites-available/profo

# 启用站点
sudo ln -sf /etc/nginx/sites-available/profo /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试并重载
sudo nginx -t
sudo systemctl reload nginx

echo -e "${GREEN}✓ Nginx 已配置${NC}"

echo -e "${YELLOW}6. 配置 SSL (Let's Encrypt)${NC}"
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m admin@$DOMAIN

echo -e "${GREEN}========== 部署完成 ==========${NC}"
echo ""
echo "服务状态检查:"
echo "  sudo systemctl status profo-backend"
echo "  sudo systemctl status profo-frontend"
echo ""
echo "日志查看:"
echo "  sudo journalctl -u profo-backend -f"
echo "  sudo journalctl -u profo-frontend -f"
echo ""
echo "访问地址: https://$DOMAIN"
