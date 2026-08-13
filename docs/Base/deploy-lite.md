# docker build 构建镜像，极简教程

关键点：
- 跨平台构建：本地 Mac (arm64) 必须构建 amd64 镜像
- 涉及迁移：后端启动迁移会自动执行（含 wall_treatment_amount 重命名），用户无需手动迁移
- 镜像名：profo-backend:prod / profo-frontend:prod

用户的已知模板是基于旧镜像名 `profo-frontend.tar.gz`，看起来是直接 `docker save` 后 gzip。现在补全：
1. 本地构建 amd64 镜像
2. docker save | gzip 导出 tar
3. scp 传输（前端+后端两个）
4. 服务器执行（含 git pull、load、up --force-recreate backend frontend）
5. 迁移会随 backend 启动自动执行，无需手动操作

用户说要极简，所以直接给命令清单，不啰嗦解释。
以下是完整极简教程，分两段：**本地构建+传输**（你不会的部分）和**服务器执行**（含迁移自动跑）。

## 一、本地构建 + 传输（Mac 终端执行）

```bash
cd /Users/bugco/Desktop/profo

# 1. 构建 amd64 镜像（跨平台，服务器是 x86_64）
docker build --platform linux/amd64 -t profo-backend:prod ./backend
docker build --platform linux/amd64 -t profo-frontend:prod ./frontend

# 2. 导出为 tar.gz
docker save profo-backend:prod | gzip > profo-backend.tar.gz
docker save profo-frontend:prod | gzip > profo-frontend.tar.gz

# 3. 传输到服务器
scp -C profo-backend.tar.gz profo-frontend.tar.gz root@139.224.162.134:/root/profo/
```

## 二、服务器执行（SSH 到服务器执行）

```bash
cd /root/profo

# 拉取最新代码（同步 docker-compose.yml 等）
git pull

# 加载新镜像
gunzip -c profo-backend.tar.gz | docker load
gunzip -c profo-frontend.tar.gz | docker load

# 重建 backend 容器（启动迁移会自动执行：RENAME appliance_amount → wall_treatment_amount）
docker compose up -d --force-recreate --no-build backend

# 等 backend 健康检查通过（约 20-30 秒，含迁移执行时间）
sleep 30 && docker compose ps backend

# 重建 frontend 容器
docker compose up -d --force-recreate --no-build frontend

sleep 10 && docker compose ps

# 清理 tar 包
rm profo-backend.tar.gz profo-frontend.tar.gz
```

## 三、验证迁移生效

```bash
# 确认列已重命名（应看到 wall_treatment_amount，不应有 appliance_amount）
docker compose exec -T db psql -U profo -d profo -c "\d project_renovations" | grep -E "custom_cabinet|window_amount|wall_treatment|appliance"
```

## 关键点

- **迁移无需手动操作**：`add_renovation_extra_amount_columns` 已是启动迁移，backend 容器启动时自动跑。存量数据通过 `RENAME COLUMN` 保留，不会丢失。
- **必须 `--platform linux/amd64`**：本地 Mac 是 arm64，服务器是 x86_64，不指定平台服务器跑不起来。
- **backend 先于 frontend 重启**：frontend 依赖 backend 健康检查，顺序不能反。
- **`--no-build`**：用已 load 的镜像，不触发服务器本地构建（服务器资源小，避免构建）。

## 恢复数据库备份
```bash
gunzip -c /root/profo/backups/backup_YYYYMMDD_HHMMSS.sql.gz | \
    docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```