# syntax=docker/dockerfile:1

# ---- Stage 1: builder ----
# Install dependencies into a virtualenv, then install the project itself.
FROM python:3.13-slim AS builder

# Install uv via the official recommended image copy.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Ensure uv creates the venv at /app/.venv (also the default, made explicit).
ENV UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_LINK_MODE=copy

WORKDIR /app

# Install dependencies first (cached layer; do not build/install the project yet).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy the rest of the backend source and install the project into the venv.
COPY . .
RUN uv sync --frozen --no-dev

# ---- Stage 2: runner (final) ----
FROM python:3.13-slim AS runner

WORKDIR /app

# 迁移前备份（迭代一 K9 / D-03）：启动迁移用 pg_dump 做「版本粒度 + 单表可恢复」备份。
# 固定大版本：Debian trixie 自带 postgresql-client 17，可 dump PG16 server
# （pg_dump 向后兼容：client 大版本 >= server 即可）。--no-install-recommends 控制体积（~+20MB）。
# 复用同一层安装后立刻清理 apt 缓存，避免镜像膨胀。
RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# Copy the virtualenv and application source from the builder.
COPY --from=builder /app /app

# Put the venv on PATH; standard Python runtime flags.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Create the uploads volume mount point (mounted at runtime via docker-compose).
# 同时创建迁移备份目录（compose 挂载 ./backups:/app/backups，见 MIGRATION_BACKUP_DIR）
RUN mkdir -p /app/static/uploads /app/backups/migrations

# Run as non-root user for security (prevents container escape via RCE from gaining root).
RUN addgroup --system --gid 1001 app && adduser --system --uid 1001 app
RUN chown -R app:app /app
USER app

EXPOSE 8000

# WEB_CONCURRENCY: uvicorn 原生支持的环境变量，控制 worker 进程数（默认 2）
# 部署时可通过 docker-compose environment 或 .env 覆盖，无需重建镜像
ENV WEB_CONCURRENCY=2

# --proxy-headers: 读取 X-Forwarded-For/Proto（nginx 反代必需）
# --forwarded-allow-ips "*": 信任所有上游 TCP 对端（Docker bridge IP 动态分配，
#   uvicorn 不支持 CIDR，无法精确限定 nginx 网关 IP）。
#   XFF 伪造防御由 _get_client_ip 右向左解析承担（backend 仅绑定 127.0.0.1，
#   nginx 独占可达）。生产 nginx 建议配置 proxy_set_header X-Forwarded-For $remote_addr;
#   （覆盖而非追加）以从源头消除 XFF 伪造。
# --timeout-worker-healthcheck 30: uvicorn 默认 5s。生产 2026-10-27/28/29 三次
#   “Child process died”均无 Python 异常日志；KPI 户室/楼栋全表 COUNT 生产实测
#   6.3~9s（重启预热日志实测 7~12s），期间 pong 线程可能拿不到 GIL，5s 会被
#   误判为 hang 并 SIGKILL。提高到 30s，覆盖 COUNT 的最坏波动（前端另有瞬时
#   断连重试兜底）。
CMD [".venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*", "--timeout-worker-healthcheck", "30"]
