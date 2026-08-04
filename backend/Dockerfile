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

# Copy the virtualenv and application source from the builder.
COPY --from=builder /app /app

# Put the venv on PATH; standard Python runtime flags.
ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Create the uploads volume mount point (mounted at runtime via docker-compose).
RUN mkdir -p /app/static/uploads

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
CMD [".venv/bin/uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
