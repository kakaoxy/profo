# Profo 迭代部署流程

> **适用场景**：在本地 Mac (M1) 修改代码后，部署到阿里云服务器（Ubuntu 22.04, x86_64, 2核 1.6G）的完整流程。
>
> **核心约束**：服务器 CPU 2 核太弱，禁止在服务器 build 镜像（会卡死）；必须本地 build 好再传到服务器。

---

## 0. 部署架构概览

```
浏览器 (HTTPS, 443)
    ↓
宿主 nginx (80→443, 已有 SSL 证书 + 反代配置)
    ├─→ /api/v1/*    → 127.0.0.1:8000 (backend 容器)
    ├─→ /api/auth/*  → 127.0.0.1:3000 (frontend 容器)
    ├─→ /static/*    → 127.0.0.1:8000 (backend 容器)
    ├─→ /health      → 127.0.0.1:8000 (backend 容器)
    └─→ /            → 127.0.0.1:3000 (frontend 容器)

容器间内部通信：
    frontend → backend:8000 (Server Action 直连，通过 SERVER_API_URL 环境变量)
    backend → db:5432 (PostgreSQL)

持久化：
    pgdata volume  - PostgreSQL 数据
    ./uploads      - 上传文件（bind mount，与 dev 模式共享）
```

**服务清单**（3 个容器，无容器内 nginx）：
| 服务 | 镜像 | 端口 | 内存限制 |
|------|------|------|----------|
| db | postgres:16-alpine | 5432（仅内部） | 384m |
| backend | profo-backend:prod | 127.0.0.1:8000 | 512m |
| frontend | profo-frontend:prod | 127.0.0.1:3000 | 256m |

---

## 1. 服务器信息（一次性确认）

| 项 | 值 |
|----|----|
| 服务器 IP | 139.224.162.134 |
| 域名 | fangmengchina.com (www.fangmengchina.com) |
| 系统 | Ubuntu 22.04.5 LTS |
| CPU/内存 | 2核 / 1.6GB + 4G swap |
| Docker | 29.6.1 |
| Docker Compose | v5.3.0 |
| 项目目录 | /root/profo |
| SSL 证书 | /etc/letsencrypt/live/fangmengchina.com/ |
| 宿主 nginx 配置 | /etc/nginx/sites-available/profo |

---

## 2. 迭代部署完整流程

### 阶段 A：本地代码提交（5 分钟）

```bash
cd /Users/bugco/Desktop/profo

# 1. 拉最新代码（防止远端有更新）
git pull

# 2. 修改代码...（你自己的开发流程）

# 3. 本地验证（可选但推荐）
# 后端
cd backend && uv run pytest && cd ..
# 前端
cd frontend && pnpm tsc --noEmit && pnpm lint && cd ..

# 4. 提交并推送
git add <修改的文件>
git commit -m "<type>(<scope>): <subject>"
git push origin main
```

### 阶段 B：本地构建 amd64 镜像（15-30 分钟）

> ⚠️ M1 Mac 跨平台构建会通过 QEMU 模拟，比原生慢，正常现象。

```bash
cd /Users/bugco/Desktop/profo

# 1. 构建镜像（docker-compose.yml 中已配置 platform: linux/amd64）
docker compose build

# 2. 验证镜像已生成 + 平台是 amd64
docker images | grep profo
# 应看到 profo-backend:prod 和 profo-frontend:prod，PLATFORM 列是 linux/amd64

# 3. 导出镜像为 tar.gz（约 168MB，gzip 压缩后）
docker save profo-backend:prod profo-frontend:prod | gzip > profo-images.tar.gz

# 4. 验证文件大小
ls -lh profo-images.tar.gz
```

**镜像大小参考**：
| 镜像 | 大小 |
|------|------|
| profo-backend:prod | ~110MB |
| profo-frontend:prod | ~67MB |
| tar.gz 压缩后 | ~168MB |

**只改了前端或后端时的快速构建**：

```bash
# 只构建 backend
docker compose build backend

# 只构建 frontend
docker compose build frontend

# 导出单个镜像
docker save profo-backend:prod | gzip > profo-backend.tar.gz
# 或
docker save profo-frontend:prod | gzip > profo-frontend.tar.gz
```

### 阶段 C：传输镜像到服务器（1-2 分钟）

> 这一步需要交互输入服务器密码，在新终端执行。

```bash
# 在本地 Mac 执行
scp -C /Users/bugco/Desktop/profo/profo-images.tar.gz root@139.224.162.134:/root/profo/
```

输入服务器密码后开始传输，168MB 约 13 秒（10MB/s 带宽）。

### 阶段 D：服务器加载镜像并重启（2-3 分钟）

**SSH 登录服务器后执行**：

```bash
cd /root/profo

# 1. 拉取最新代码（让 docker-compose.yml 等配置文件同步）
git pull origin main

# 2. 加载镜像（约 1-2 分钟）
gunzip -c profo-images.tar.gz | docker load
# 预期输出：
#   Loaded image: profo-backend:prod
#   Loaded image: profo-frontend:prod

# 3. 验证镜像已加载
docker images | grep profo

# 4. 重启服务（关键：--no-build 避免触发构建）
docker compose up -d --no-build

# 5. 等待健康检查通过（约 30 秒）
sleep 30 && docker compose ps
# 应看到 db/backend/frontend 状态都是 running，db 和 backend 是 healthy

# 6. 健康检查
curl http://127.0.0.1:8000/health
# 预期：{"status":"healthy","database":"connected"}

# 7. 清理镜像包（释放磁盘）
rm profo-images.tar.gz
```

### 阶段 E：验证

```bash
# 1. 浏览器访问前端
# https://fangmengchina.com  应看到首页

# 2. 健康检查
curl https://fangmengchina.com/health
# 预期：{"status":"healthy","database":"connected"}

# 3. 查看服务状态
docker compose ps

# 4. 查看日志（如有异常）
docker compose logs --tail=100 backend
docker compose logs --tail=100 frontend
docker compose logs --tail=100 db
```

---

## 3. 常用运维命令

### 服务管理

```bash
cd /root/profo

# 查看服务状态
docker compose ps

# 重启单个服务
docker compose restart backend
docker compose restart frontend
docker compose restart db

# 停止所有服务（保留数据）
docker compose stop

# 启动所有服务（不重新构建）
docker compose up -d --no-build

# 完全删除容器（保留数据卷 pgdata 和 uploads）
docker compose down

# 完全重置（⚠️ 删除所有数据！包括数据库）
docker compose down -v
```

### 日志查看

```bash
# 实时跟踪全部服务日志
docker compose logs -f

# 跟踪单个服务
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db

# 查看最近 200 行
docker compose logs --tail=200 backend
```

### 进入容器调试

```bash
# 进入 backend 容器
docker compose exec backend bash

# 进入 db 容器执行 SQL
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB

# 在 backend 容器内运行 Python
docker compose exec backend .venv/bin/python <脚本.py>
```

### 数据库操作

```bash
# 备份数据库
docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%F).sql

# 恢复数据库
docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < backup_2026-07-04.sql

# 查看数据库表
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB -c "\dt"
```

### 重置管理员密码

```bash
# 如忘记 admin 密码
docker compose exec backend .venv/bin/python init_admin.py
# 注意：会检测已有 admin 并跳过。如需强制重置：
docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB \
  -c "DELETE FROM users WHERE username='admin';"
docker compose exec backend .venv/bin/python init_admin.py
```

---

## 4. 不同场景的部署变体

### 场景 1：只改了后端代码

```bash
# 本地
cd /Users/bugco/Desktop/profo
git add <backend 文件> && git commit -m "fix(backend): xxx" && git push
docker compose build backend
docker save profo-backend:prod | gzip > profo-backend.tar.gz

# 传输
scp -C profo-backend.tar.gz root@139.224.162.134:/root/profo/

# 服务器
cd /root/profo && git pull
gunzip -c profo-backend.tar.gz | docker load
docker compose up -d --no-build backend
rm profo-backend.tar.gz
curl http://127.0.0.1:8000/health
```

### 场景 2：只改了前端代码

```bash
# 本地
cd /Users/bugco/Desktop/profo
git add <frontend 文件> && git commit -m "feat(frontend): xxx" && git push
docker compose build frontend
docker save profo-frontend:prod | gzip > profo-frontend.tar.gz

# 传输
scp -C profo-frontend.tar.gz root@139.224.162.134:/root/profo/

# 服务器
cd /root/profo && git pull
gunzip -c profo-frontend.tar.gz | docker load
docker compose up -d --no-build frontend
rm profo-frontend.tar.gz
```

### 场景 3：改了 docker-compose.yml 或 .env.docker.example

```bash
# 本地
git add docker-compose.yml .env.docker.example && git commit -m "chore(docker): xxx" && git push

# 不需要重新构建镜像！

# 服务器
cd /root/profo && git pull
# 如 .env.docker.example 有新增必填项，手动同步到 .env
diff .env.docker.example .env  # 检查差异
nano .env                       # 补充新字段
docker compose up -d --no-build  # 重启应用新配置
```

### 场景 4：数据库 schema 变更（通过 migrations）

应用启动时 `backend/migrations/` 下的幂等迁移会自动执行，无需手动操作。

```bash
# 服务器
cd /root/profo
git pull
docker compose up -d --no-build

# 验证迁移日志
docker compose logs backend | grep -i migration
```

> ⚠️ 如有重大 schema 变更，**强烈建议先备份数据库**：
> ```bash
> docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%F).sql
> ```

---

## 5. 常见问题排查

### Q1: 启动后浏览器访问 502 Bad Gateway

```bash
# 检查容器是否在运行
docker compose ps
# 如 backend 状态不是 healthy，查看日志
docker compose logs --tail=200 backend

# 常见原因：
# 1. .env 缺少必填字段（如 JWT_SECRET_KEY）
# 2. 数据库未就绪（看 db 日志）
# 3. ENCRYPTION_KEY 格式错误（应是 44 字符 urlsafe base64，结尾是 =）
```

### Q2: 前端登录显示"网络错误，请连接后端服务"

```bash
# 检查 frontend 容器内能否访问 backend
docker compose exec frontend wget -qO- http://backend:8000/health
# 应返回 {"status":"healthy","database":"connected"}

# 如失败，检查 docker-compose.yml 中 SERVER_API_URL 是否为 http://backend:8000
```

### Q3: 内存不足导致容器被 OOM Kill

```bash
# 查看是否被 OOM
docker compose ps -a
# 如 STATUS 显示 OOMKilled 或 Exited (137)

# 查看内存使用
docker stats --no-stream

# 临时方案：重启容器
docker compose restart

# 根本方案：检查 swap 是否启用
free -h
# 如 Swap 显示 0，重新加 swap（见下方"恢复 swap"）
```

### Q4: 磁盘空间不足

```bash
# 查看磁盘
df -h /

# 清理 Docker 无用镜像（不会影响正在运行的容器）
docker image prune -a
# 注意：会删除所有未被容器使用的镜像，下次部署需重新 load

# 清理 Docker 构建缓存
docker builder prune

# 查看上传目录大小
du -sh /root/profo/uploads/

# 清理旧备份
ls -lh /root/profo.pm2.bak.*
rm /root/profo.pm2.bak.<旧日期>
```

### Q5: 容器 build 失败

```bash
# 本地构建时查看详细错误
docker compose build --progress=plain

# 常见原因：
# 1. pyproject.toml 或 package.json 依赖冲突
# 2. 网络问题导致 pip/pnpm 拉包失败（重试即可）
# 3. 后端代码语法错误（uv sync 阶段失败）
# 4. 前端 TypeScript 错误（next build 阶段失败，先 pnpm tsc --noEmit 修复）
```

### Q6: 数据库连接失败

```bash
# 检查 db 容器状态
docker compose ps db

# 查看 db 日志
docker compose logs --tail=100 db

# 验证 DATABASE_URL 是否正确
docker compose exec backend env | grep DATABASE_URL
# 应为 postgresql+psycopg://USER:PASS@db:5432/DB

# 如密码含特殊字符（# @ : /），会导致 URL 解析失败
# 解决：修改 .env 中 POSTGRES_PASSWORD 为纯字母数字
```

---

## 6. 备份与恢复

### 完整备份（部署前必做）

```bash
# 1. 备份数据库
cd /root/profo
docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup_$(date +%F).sql

# 2. 备份 .env（包含密钥）
cp .env .env.backup.$(date +%F)

# 3. 备份上传文件（如改动较大）
tar -czf uploads_$(date +%F).tar.gz uploads/

# 查看备份大小
ls -lh backup_*.sql .env.backup.* uploads_*.tar.gz
```

### 恢复备份

```bash
# 1. 恢复数据库
docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < backup_2026-07-04.sql

# 2. 恢复 .env
cp .env.backup.2026-07-04 .env
docker compose restart backend

# 3. 恢复上传文件
tar -xzf uploads_2026-07-04.tar.gz
```

---

## 7. 紧急回滚

### 回滚到上一版本

```bash
# 查看最近 5 次提交
git log --oneline -5

# 回滚到上一个 commit（保留改动在工作区）
git reset --hard HEAD~1
git push --force origin main  # ⚠️ 强制推送，需谨慎

# 重新构建并部署
docker compose build
docker save profo-backend:prod profo-frontend:prod | gzip > profo-images.tar.gz
scp -C profo-images.tar.gz root@139.224.162.134:/root/profo/
# 在服务器执行：
# cd /root/profo && git pull && gunzip -c profo-images.tar.gz | docker load && docker compose up -d --no-build
```

### 数据库回滚

```bash
# ⚠️ 数据库回滚是危险操作，确保已备份当前数据
docker compose down
docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB < backup_2026-07-04.sql
docker compose up -d --no-build
```

---

## 8. SSL 证书续期（Let's Encrypt）

证书有效期 90 天，过期前 30 天可续期。

```bash
# 查看证书有效期
sudo openssl x509 -in /etc/letsencrypt/live/fangmengchina.com/cert.pem -noout -dates

# 续期（无需重启 nginx）
sudo certbot renew --dry-run  # 测试
sudo certbot renew            # 正式续期

# 续期后 reload nginx
sudo nginx -t && sudo systemctl reload nginx
```

> 建议配置 cron 自动续期：
> ```bash
> echo "0 3 1 * * certbot renew --quiet --post-hook 'systemctl reload nginx'" | sudo tee /etc/cron.d/certbot-renew
> ```

---

## 9. 恢复 swap（如服务器重启后 swap 丢失）

```bash
# 检查 swap
free -h
# 如 Swap 显示 0，重新启用

swapon /swapfile 2>/dev/null || {
    fallocate -l 1G /swapfile && chmod 600 /swapfile
    mkswap /swapfile && swapon /swapfile
}

# 检查 fstab 是否有持久化配置
grep swap /etc/fstab
# 应有：/swapfile none swap sw 0 0
```

---

## 10. 关键文件清单

| 文件 | 位置 | 作用 |
|------|------|------|
| docker-compose.yml | 项目根 | 服务编排配置 |
| .env.docker.example | 项目根 | 环境变量模板（可提交） |
| .env | 项目根（服务器） | 实际环境变量（不提交） |
| backend/Dockerfile | backend/ | 后端镜像构建脚本 |
| frontend/Dockerfile | frontend/ | 前端镜像构建脚本 |
| docker/nginx.conf | docker/ | 容器内 nginx 配置（已弃用，由宿主 nginx 替代） |
| /etc/nginx/sites-available/profo | 服务器 | 宿主 nginx 反代配置 |

---

## 11. 速查命令清单

```bash
# === 本地（Mac M1）===
cd /Users/bugco/Desktop/profo
git pull && git add . && git commit -m "xxx" && git push
docker compose build
docker save profo-backend:prod profo-frontend:prod | gzip > profo-images.tar.gz
scp -C profo-images.tar.gz root@139.224.162.134:/root/profo/

# === 服务器 ===
cd /root/profo
git pull
gunzip -c profo-images.tar.gz | docker load
docker compose up -d --no-build
sleep 30 && docker compose ps
curl http://127.0.0.1:8000/health
rm profo-images.tar.gz

# === 日志排查 ===
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

---

## 12. 首次部署参考

如需在新服务器上首次部署，参考 `docs/server-conf/` 下的配置文件信息，并执行以下步骤：

1. 安装 Docker + Docker Compose
2. 配置 swap（1G+）
3. 配置宿主 nginx（参考 `docs/server-conf/nginx.conf` 和 `docs/server-conf/配置文件信息.md`）
4. 申请 SSL 证书（certbot）
5. git clone 项目
6. 配置 .env（参考 `.env.docker.example`）
7. 从本地传输镜像并加载（scp + docker load）
8. `docker compose up -d --no-build`
9. `docker compose exec backend .venv/bin/python init_admin.py` 初始化管理员
10. 浏览器访问验证

---

**文档版本**：v1.0
**最后更新**：2026-07-04
**部署目标**：fangmengchina.com
