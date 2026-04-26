# Profo 阿里云部署指引（低配服务器：本地构建后上传）

> 适用场景：阿里云服务器配置较低，**在服务器上执行 `pnpm build` 会卡死/超时**。  
> 方案：**在本地完成 Next.js 构建**，将构建产物与后端代码一并上传到服务器，服务器只做“装依赖 + 启动/重启服务”。

本项目技术栈：

- 前端：Next.js 16（`pnpm build` → `pnpm start`，端口 `3000`）
- 后端：FastAPI（`uv` 管理依赖，端口 `8000`）
- 进程管理：PM2（同时管理前后端）
- 反向代理：Nginx（HTTPS / API 反代 / 静态资源缓存）

---

## 0. 你将得到什么（最终效果）

部署完成后：

- 浏览器访问：`https://你的域名/` → 前端页面（Nginx → 3000）
- API 访问：`https://你的域名/api/...` → 后端 API（Nginx → 8000）
- 健康检查：`https://你的域名/health` → 后端健康检查（Nginx → 8000）

---

## 1. 部署目录与脚本说明（先认识一下）

项目里已经准备好了部署相关文件（就在 `deploy/` 目录）：

- `deploy/setup-server.sh`：**在服务器执行**，安装 Node/Python/uv/certbot 等，并写入 Nginx 配置
- `deploy/ecosystem.config.js`：PM2 配置（管理 `profo-backend` + `profo-frontend`）
- `deploy/profo-nginx.conf`：Nginx 配置模板（反代到 3000/8000）
- `deploy/.env.backend.production`：后端生产环境变量模板
- `deploy/.env.frontend.production`：前端生产环境变量模板
- `deploy/deploy.sh`：**在本地 macOS/Linux 执行**，本地构建 + 打包上传 + 服务器远程部署
- `deploy/deploy.bat`：**在本地 Windows 执行**，本地构建 + 上传 + 服务器远程部署

> 推荐：日常部署直接用脚本（`deploy.sh` / `deploy.bat`），无需在服务器手动执行 `pnpm build`。

---

## 2. 部署前置条件（务必检查）

### 2.1 阿里云控制台侧（必须）

1. **安全组放行端口**
   - 22（SSH）
   - 80（HTTP）
   - 443（HTTPS）
2. **域名解析**
   - 你的域名 A 记录指向服务器公网 IP
3. 服务器系统建议：Ubuntu 20/22（本文以 Ubuntu 为例）

### 2.2 本地电脑侧（必须）

1. 已安装：
   - Node.js `>= 20`
   - pnpm（项目要求 pnpm）
   - Git（可选）
2. 能 SSH 免密登录服务器（强烈建议）
   - Windows：建议使用 Git Bash / PowerShell 的 OpenSSH
   - macOS/Linux：自带 OpenSSH

快速自检（本地执行）：

```bash
node -v
pnpm -v
ssh -V
```

---

## 3. 第一次部署：服务器初始化（只做一次）

以下步骤都在 **服务器** 上做（SSH 登录后执行）。

### 3.1 连接服务器

```bash
ssh root@你的服务器IP
```

### 3.2 创建项目目录

> 本项目默认部署到 `/root/profo`（脚本与 PM2 配置里写死了这个路径）。

```bash
mkdir -p /root/profo/frontend /root/profo/backend /root/profo/logs
```

### 3.3 上传 deploy 目录到服务器

这一步在 **本地** 执行（把项目中的 `deploy/` 目录先传上去）：

```bash
scp -r deploy root@你的服务器IP:/root/profo/
```

### 3.4 在服务器执行初始化脚本

```bash
cd /root/profo/deploy
chmod +x setup-server.sh
./setup-server.sh
```

> 注意：
> - `setup-server.sh` 会尝试调用 `nginx -t` 和 `systemctl reload nginx`，请确保服务器已安装 Nginx。  
>   如果没安装，先执行：`apt install -y nginx`
> - 该脚本不会强制安装 PM2。如服务器上没有 PM2，请手动安装：`npm i -g pm2`

### 3.5 配置 PM2 开机自启（强烈建议）

```bash
pm2 startup
pm2 save
```

> `pm2 startup` 会输出一条命令，让你复制粘贴再执行一次；按它提示做即可。

---

## 4. 第一次部署：配置生产环境变量（只做一次，之后按需改）

### 4.1 后端环境变量：`/root/profo/backend/.env`

在服务器执行：

```bash
cp /root/profo/deploy/.env.backend.production /root/profo/backend/.env
nano /root/profo/backend/.env
```

必须修改项（非常重要）：

- `JWT_SECRET_KEY`：按模板提示生成，例如：
  ```bash
  openssl rand -hex 32
  ```
- `WECHAT_APPID` / `WECHAT_SECRET`：如果你启用了微信相关功能

> 数据库说明（很重要）：  
> 默认 `DATABASE_URL=sqlite:///./data.db`，数据库文件会放在 `/root/profo/backend/data.db`。  
> 如果你后续使用 `deploy.sh` 的“整目录备份再解压”策略，**容易导致数据文件跟随目录一起被备份走**。  
> 更稳妥的做法是把数据库放到“代码目录之外”，例如：
>
> 1) 创建独立数据目录：
> ```bash
> mkdir -p /root/profo-data
> ```
> 2) 将 `.env` 中数据库改为（注意四个 `/`）：
> ```env
> DATABASE_URL=sqlite:////root/profo-data/data.db
> ```

### 4.2 前端环境变量：`/root/profo/frontend/.env.local`

在服务器执行：

```bash
cp /root/profo/deploy/.env.frontend.production /root/profo/frontend/.env.local
```

该文件核心是：

- `NEXT_PUBLIC_API_URL=https://你的域名`

> 原理：前端会把 `/api/*` 请求重写到 `${NEXT_PUBLIC_API_URL}/api/*`，再由 Nginx 反向代理到后端 8000 端口。

---

## 5. 关键步骤：本地构建 + 上传部署（低配服务器专用）

接下来开始你最关心的部分：**本地 build 好，再统一上传服务器**。

### 5.1 修改部署脚本里的服务器信息（建议你先改一次）

打开并按需修改：

- macOS/Linux：`deploy/deploy.sh`
- Windows：`deploy/deploy.bat`

需要重点检查的字段：

- `SERVER_HOST`：服务器域名或 IP
- `REMOTE_PATH`：默认 `/root/profo`
- `NEXT_PUBLIC_API_URL`：生产域名（HTTPS）

### 5.2 执行部署（Windows）

在本地项目根目录执行：

```powershell
cd deploy
.\deploy.bat
```

脚本做的事情（你心里要有数）：

1. 本地执行 `pnpm build`（生成 `frontend/.next`）
2. scp 上传：
   - `frontend/.next`、`frontend/public`、`frontend/package.json` 等
   - `backend/` 代码（排除 `.venv`）
   - `deploy/` 配置
3. 在服务器远程执行：
   - `cd backend && uv sync`
   - `cd frontend && pnpm install --prod`
   - `pm2 restart ...`（不存在则 `pm2 start ecosystem.config.js`）

### 5.3 执行部署（macOS / Linux）

在本地项目根目录执行：

```bash
cd deploy
chmod +x deploy.sh
./deploy.sh
```

> `deploy.sh` 会先把文件打成一个 `tar.gz` 部署包上传到服务器，并在服务器侧解压部署。

---

## 6. 首次启动服务（如果脚本未自动启动/或你想手动启动）

在服务器执行：

```bash
cd /root/profo/deploy
pm2 start ecosystem.config.js
pm2 save
```

检查状态：

```bash
pm2 status
pm2 logs profo-backend --lines 50
pm2 logs profo-frontend --lines 50
```

---

## 7. 验证部署是否成功（强烈建议按顺序做）

### 7.1 服务器本机验证（绕开 Nginx，先看服务本身）

在服务器执行：

```bash
# 后端健康检查（应返回 healthy）
curl -s http://127.0.0.1:8000/health

# 前端端口是否在监听（看到 3000 端口）
ss -tlnp | grep -E ":(3000|8000)\b"
```

### 7.2 Nginx 验证

```bash
nginx -t
systemctl reload nginx
```

### 7.3 通过域名验证

浏览器打开：

- `https://你的域名/`

接口验证（本地电脑执行）：

```bash
curl -i https://你的域名/health
```

---

## 8. 日常更新发布（你之后最常用的流程）

当你修改了代码，需要更新到服务器时：

1. 本地提交/拉取到最新代码
2. 直接再次运行部署脚本：
   - Windows：`deploy\deploy.bat`
   - macOS/Linux：`deploy/deploy.sh`

---

## 9. 常见问题（低配服务器高频踩坑）

### 9.1 服务器执行 `pnpm install --prod` 也很慢/卡住

可以先做两件事（服务器执行）：

1) 给服务器加 Swap（1~2G 通常就能救命）：

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

2) 重新安装依赖时尽量减少行为：

```bash
cd /root/profo/frontend
pnpm install --prod --frozen-lockfile
```

### 9.2 `deploy.sh` 更新后发现数据库“丢了”

这是典型的“**代码目录覆盖**”导致的现象（尤其是 SQLite 默认就在 `backend/` 目录下）。

推荐做法（只需改环境变量，不改代码）：

1. 把数据库放到独立目录（例如 `/root/profo-data`）
2. `.env` 里把 `DATABASE_URL` 改成绝对路径（示例见上文 4.1）

同理，如果你希望上传文件长期保留，也建议把 `backend/static/uploads` 放到独立目录，并用软链接方式挂回代码目录（可选进阶）。

### 9.3 访问网站 502 / 504

按顺序排查：

1. `pm2 status` 看前后端进程是否在线
2. `pm2 logs profo-backend --lines 50`
3. `pm2 logs profo-frontend --lines 50`
4. `ss -tlnp | grep -E ":(3000|8000)\b"` 看端口是否在监听
5. `tail -n 50 /var/log/nginx/profo.error.log`

---

## 10. 附：你需要记住的 6 条命令（够用版）

```bash
# 1) 查看服务状态
pm2 status

# 2) 看日志
pm2 logs profo-backend --lines 100
pm2 logs profo-frontend --lines 100

# 3) 重启
pm2 restart profo-backend
pm2 restart profo-frontend

# 4) 检查 Nginx
nginx -t
systemctl reload nginx
```

