# Profo 部署指南

将 Next.js + FastAPI 项目部署到阿里云服务器。

## 目录结构

```
deploy/
├── README.md              # 本文件
├── deploy.bat             # Windows 部署脚本
├── deploy.sh              # Linux/Mac 部署脚本
├── setup-server.sh        # 服务器初始化脚本
├── profo-nginx.conf       # Nginx 配置
├── profo-backend.service  # 后端 systemd 服务
├── profo-frontend.service # 前端 systemd 服务
├── .env.backend.production    # 后端环境变量模板
└── .env.frontend.production   # 前端环境变量模板
```

## 首次部署

### 1. 服务器准备

SSH 登录到服务器后执行:

```bash
# 创建项目目录
mkdir -p /root/profo/frontend /root/profo/backend

# 上传 deploy 目录到服务器
# (在本地执行) scp -r deploy root@fangmengchina.com:/root/profo/

# 在服务器执行初始化脚本
cd /root/profo/deploy
chmod +x setup-server.sh
./setup-server.sh
```

### 2. 配置环境变量

```bash
# 后端环境变量
cp /root/profo/deploy/.env.backend.production /root/profo/backend/.env
# 编辑 .env，修改 JWT_SECRET_KEY 和微信配置
nano /root/profo/backend/.env

# 生成强密钥
openssl rand -hex 32

# 前端环境变量
cp /root/profo/deploy/.env.frontend.production /root/profo/frontend/.env.local
```

### 3. 本地构建并部署

在本地 (Windows) 执行:

```powershell
cd deploy
.\deploy.bat
```

或在 Linux/Mac:

```bash
cd deploy
chmod +x deploy.sh
./deploy.sh
```

### 4. 启动服务

```bash
# 启动后端
systemctl start profo-backend

# 启动前端
systemctl start profo-frontend

# 查看状态
systemctl status profo-backend
systemctl status profo-frontend
```

## 日常更新

修改代码后，只需在本地执行部署脚本:

```powershell
# Windows
cd deploy
.\deploy.bat
```

## 常用命令

```bash
# 查看日志
journalctl -u profo-backend -f
journalctl -u profo-frontend -f

# 重启服务
systemctl restart profo-backend
systemctl restart profo-frontend

# 停止服务
systemctl stop profo-backend
systemctl stop profo-frontend

# Nginx 操作
nginx -t              # 测试配置
systemctl reload nginx  # 重载配置

# SSL 证书续期
certbot renew --dry-run  # 测试续期
certbot renew           # 实际续期
```

## 故障排查

### 后端无法启动

```bash
# 检查日志
journalctl -u profo-backend -n 50

# 手动测试
cd /root/profo/backend
uv run python main.py
```

### 前端无法启动

```bash
# 检查日志
journalctl -u profo-frontend -n 50

# 手动测试
cd /root/profo/frontend
pnpm start
```

### Nginx 502 错误

```bash
# 检查服务是否运行
systemctl status profo-backend
systemctl status profo-frontend

# 检查端口
netstat -tlnp | grep -E '3000|8000'
```
