# Profo 部署指南

将 Next.js + FastAPI 项目部署到阿里云服务器（使用 PM2 管理服务）。

## 目录结构

```
deploy/
├── README.md                  # 本文件
├── ecosystem.config.js        # PM2 配置 ⭐
├── deploy.bat                 # Windows 部署脚本
├── deploy.sh                  # Linux/Mac 部署脚本
├── setup-server.sh            # 服务器初始化脚本
├── profo-nginx.conf           # Nginx 配置
├── .env.backend.production    # 后端环境变量模板
└── .env.frontend.production   # 前端环境变量模板
```

## 首次部署

### 1. 服务器准备

SSH 登录到服务器后执行:

```bash
# 创建项目目录
mkdir -p /root/profo/frontend /root/profo/backend /root/profo/logs

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
nano /root/profo/backend/.env
# ⚠️ 务必修改 JWT_SECRET_KEY (使用 openssl rand -hex 32 生成)
# ⚠️ 填写微信 AppID 和 Secret

# 前端环境变量
cp /root/profo/deploy/.env.frontend.production /root/profo/frontend/.env.local
```

### 3. 本地构建并部署

在本地 (Windows) 执行:

```powershell
cd deploy
.\deploy.bat
```

### 4. 使用 PM2 启动服务

```bash
cd /root/profo/deploy

# 启动所有服务
pm2 start ecosystem.config.js

# 保存 PM2 配置 (开机自启)
pm2 save
pm2 startup
```

## 日常更新

修改代码后，只需在本地执行部署脚本:

```powershell
# Windows
cd deploy
.\deploy.bat
```

部署脚本会自动重启 PM2 服务。

## PM2 常用命令

```bash
# 查看所有服务状态
pm2 status

# 查看日志
pm2 logs                    # 所有日志
pm2 logs profo-backend      # 只看后端
pm2 logs profo-frontend     # 只看前端

# 重启服务
pm2 restart all                 # 重启所有
pm2 restart profo-backend       # 只重启后端
pm2 restart profo-frontend      # 只重启前端

# 停止服务
pm2 stop profo-backend
pm2 stop profo-frontend

# 删除服务
pm2 delete profo-backend
pm2 delete profo-frontend

# 监控面板
pm2 monit
```

## Nginx 命令

```bash
nginx -t              # 测试配置
systemctl reload nginx  # 重载配置
```

## SSL 证书

```bash
# 测试续期
certbot renew --dry-run

# 实际续期
certbot renew
```

## 故障排查

### 后端无法启动

```bash
# 检查 PM2 日志
pm2 logs profo-backend --lines 50

# 手动测试
cd /root/profo/backend
uv run python main.py
```

### 前端无法启动

```bash
# 检查 PM2 日志
pm2 logs profo-frontend --lines 50

# 手动测试
cd /root/profo/frontend
pnpm start
```

### Nginx 502 错误

```bash
# 检查服务是否运行
pm2 status

# 检查端口
netstat -tlnp | grep -E '3000|8000'
```
