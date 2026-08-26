#!/bin/bash
# Profo 开发环境一键启停脚本
#
# 架构：Docker 跑 PostgreSQL + 本地 uvicorn --reload + 本地 next dev
# 前后端代码改动自动热重载，无需 docker rebuild。
#
# 与生产部署的区别：
#   生产部署          使用 docker-compose.yml（db / backend / frontend），由宿主 nginx 反代
#   ./dev-start.sh    本地开发，仅 db 容器化，前后端本机直跑热重载
#
# 用法:
#   ./dev-start.sh            启动全部（db + backend + frontend）
#   ./dev-start.sh up         同上
#   ./dev-start.sh db         只启动数据库（前后端自己开终端跑）
#   ./dev-start.sh stop       停止数据库容器
#   ./dev-start.sh status     查看容器状态
#   ./dev-start.sh logs       查看数据库日志
#   ./dev-start.sh down       停止并删除容器（保留数据卷）

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

DEV_COMPOSE="docker compose -f docker-compose.yml -f docker-compose.dev.yml"

# 检查根目录 .env（Docker 启动 db 需要 POSTGRES_* 变量）
if [ ! -f .env ]; then
  echo "❌ 未检测到根目录 .env"
  echo "   请先执行: cp .env.docker.example .env 并填入 POSTGRES_* 等凭据"
  exit 1
fi

# 从 .env 精准提取 POSTGRES_* 变量（不 source 整个文件，避免特殊字符报错）
read_env_var() {
  local key="$1"
  # 只取第一个匹配，去掉行首尾空白与可能的引号
  grep -E "^${key}=" .env | head -1 | sed -E "s/^${key}=//; s/^\"//; s/\"$//; s/^'//; s/'$//"
}

POSTGRES_USER="$(read_env_var POSTGRES_USER)"
POSTGRES_PASSWORD="$(read_env_var POSTGRES_PASSWORD)"
POSTGRES_DB="$(read_env_var POSTGRES_DB)"

if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ]; then
  echo "❌ .env 中未找到 POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB"
  echo "   请检查 .env 配置"
  exit 1
fi
export POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB

# 开发环境覆盖：backend 直连本地映射的 Docker db（127.0.0.1:5432，而非容器名 db）
export DATABASE_URL="postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}"
export DEBUG=true

# 从 .env 提取 Settings 必填字段（无默认值，缺失会导致 sys.exit(1)）
# backend 从 backend/ 目录运行，env_file=".env" 找不到根目录 .env，需通过 env vars 注入
JWT_SECRET_KEY="$(read_env_var JWT_SECRET_KEY)"
ENCRYPTION_KEY="$(read_env_var ENCRYPTION_KEY)"
WECHAT_APPID="$(read_env_var WECHAT_APPID)"
WECHAT_SECRET="$(read_env_var WECHAT_SECRET)"

for _field in JWT_SECRET_KEY ENCRYPTION_KEY WECHAT_APPID WECHAT_SECRET; do
  if [ -z "${!_field}" ]; then
    echo "❌ .env 中未找到 ${_field}"
    echo "   请运行: ./init-env.sh"
    exit 1
  fi
done
export JWT_SECRET_KEY ENCRYPTION_KEY WECHAT_APPID WECHAT_SECRET

# 从 .env 提取 REDIS_PASSWORD，构造本地可用的 REDIS_URL
# .env 中的 redis://...@redis:6379/0 是 Docker 容器间地址，本地启动 host=redis 不可解析
# 密码含 # @ 等特殊字符，必须 percent-encode：否则 # 被 urlparse 当作 fragment 起始符，
# host 被错误截断（redis-py from_url 会对编码后的密码 unquote 回原始值，匹配 --requirepass）
REDIS_PASSWORD="$(read_env_var REDIS_PASSWORD)"
if [ -z "$REDIS_PASSWORD" ]; then
  echo "❌ .env 中未找到 REDIS_PASSWORD"
  echo "   请检查 .env 配置"
  exit 1
fi
REDIS_PASSWORD_ENC="$(python3 -c "import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1],safe=''))" "$REDIS_PASSWORD")"
export REDIS_URL="redis://:${REDIS_PASSWORD_ENC}@127.0.0.1:6379/0"

# 绕过 HTTP 代理（Clash/V2Ray 等）对本地请求的拦截
# 代理软件会设置 HTTP_PROXY，导致 fetch 127.0.0.1:8000 走代理 → 502
export NO_PROXY="127.0.0.1,localhost,0.0.0.0"
export no_proxy="127.0.0.1,localhost,0.0.0.0"

# 开发环境覆盖：UPLOAD_DIR 指向本地 backend/static/uploads
# .env 中的 /app/static/uploads 是 Docker 容器路径，本地启动会因 macOS 根目录只读 (SIP) 失败
# backend/static/uploads 已通过软链指向 ../../uploads，与 Docker 共享同一份上传文件
export UPLOAD_DIR="${ROOT_DIR}/backend/static/uploads"

# 检查 backend/.venv
if [ ! -x backend/.venv/bin/uvicorn ]; then
  echo "❌ backend/.venv 不存在或缺少 uvicorn"
  echo "   请执行: cd backend && uv sync"
  exit 1
fi

# 检查 frontend/node_modules
if [ ! -d frontend/node_modules ]; then
  echo "⚠️  frontend/node_modules 不存在，执行 pnpm install..."
  (cd frontend && pnpm install)
fi

# 创建 backend/static/uploads 软链 → ../../uploads
# 让本地 dev 模式与 Docker 容器共享同一份上传文件
UPLOADS_SYMLINK="backend/static/uploads"
UPLOADS_TARGET="../../uploads"
mkdir -p backend/static
mkdir -p uploads  # 确保软链目标存在，避免 broken symlink
# 注意：-e 会跟随软链判断目标是否存在，broken symlink 会通过 ! -e 但仍是有效软链
# 因此先判断 -L（是否为软链），再判断 -d（是否为真实目录），最后才创建
if [ -L "$UPLOADS_SYMLINK" ]; then
  # 已是软链，确认指向正确
  current_target="$(readlink "$UPLOADS_SYMLINK")"
  if [ "$current_target" != "$UPLOADS_TARGET" ]; then
    echo "⚠️  $UPLOADS_SYMLINK 软链指向 $current_target（期望 $UPLOADS_TARGET），修正中..."
    rm "$UPLOADS_SYMLINK"
    ln -s "$UPLOADS_TARGET" "$UPLOADS_SYMLINK"
  fi
elif [ -d "$UPLOADS_SYMLINK" ]; then
  echo "⚠️  $UPLOADS_SYMLINK 是真实目录而非软链"
  echo "   如需共享 Docker uploads，请先删除该目录: rm -rf $UPLOADS_SYMLINK"
  echo "   当前 dev 模式将使用独立的本地 uploads，与 Docker 不互通"
elif [ ! -e "$UPLOADS_SYMLINK" ]; then
  ln -s "$UPLOADS_TARGET" "$UPLOADS_SYMLINK"
  echo "✅ 已创建软链 $UPLOADS_SYMLINK → $UPLOADS_TARGET（共享 uploads 目录）"
fi

CMD="${1:-up}"

# 端口预检：检查 8000/3000 是否被占用，占用则列出 PID 并退出
check_port() {
  local port="$1"
  local name="$2"
  local pids
  pids="$(lsof -ti:"$port" 2>/dev/null || true)"
  if [ -n "$pids" ]; then
    echo "❌ 端口 $port ($name) 已被占用，PID: $(echo "$pids" | tr '\n' ' ')"
    echo "   请先终止该进程: kill $pids"
    echo "   或强制终止: kill -9 $pids"
    return 1
  fi
  return 0
}

# 预检 Docker 服务端口（5432/6379）：
# - 自动清理非 compose 管理的孤儿容器（无 com.docker.compose.project 标签，常见于手动 docker run --name profo-redis 残留）
# - 被【本项目】compose 容器占用（如 setup.sh 已启动 db）→ 复用（compose up -d 幂等），保证 setup.sh → dev-start.sh 无缝衔接
# - 被【其他项目】compose 容器占用 → 报错提示手动处理
# 返回 0=端口已就绪，1=被其他 compose 项目占用需用户处理
cleanup_orphan_port() {
  local port="$1"
  local service="$2"
  local my_project
  my_project="$(basename "$ROOT_DIR")"
  # 匹配 docker ps 的 Ports 列格式：0.0.0.0:6379->6379/tcp 或 [::]:6379->6379/tcp
  local names
  names=$(docker ps --format '{{.Names}} {{.Ports}}' 2>/dev/null | grep ":${port}->" | awk '{print $1}' || true)

  [ -z "$names" ] && return 0

  local has_other=0
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    local project
    project=$(docker inspect "$name" --format '{{index .Config.Labels "com.docker.compose.project"}}' 2>/dev/null || echo "")
    if [ -z "$project" ]; then
      echo "⚠️  孤儿容器 '$name'（非 compose 管理）占用 $port ($service) 端口，自动清理..."
      docker rm -f "$name" >/dev/null 2>&1 && echo "✅ 已清理 $name"
    elif [ "$project" = "$my_project" ]; then
      # 本项目容器已占用端口（setup.sh 或上次 dev-start 遗留）→ 复用，交给 compose up -d 幂等处理
      echo "ℹ  端口 $port ($service) 已被本项目容器 ($name) 占用，将复用现有容器"
    else
      echo "❌ 端口 $port ($service) 被其他 compose 项目 ($project) 的容器占用"
      echo "   请先停止该项目: docker compose -p $project stop"
      has_other=1
    fi
  done <<< "$names"

  [ "$has_other" -eq 1 ] && return 1
  return 0
}

start_db() {
  echo "启动 PostgreSQL 与 Redis (Docker)..."
  # 预检 Docker 服务端口：清理孤儿容器，避免端口冲突导致首次启动失败
  cleanup_orphan_port 5432 "db" || return 1
  cleanup_orphan_port 6379 "redis" || return 1
  $DEV_COMPOSE up -d db redis
  echo "✅ 数据库已启动: postgresql+psycopg://${POSTGRES_USER}:***@127.0.0.1:5432/${POSTGRES_DB}"
  echo "✅ Redis 已启动: redis://***@127.0.0.1:6379/0"
}

case "$CMD" in
  up|start)
    # 端口预检（db 端口 5432 由 Docker 管理，无需检查）
    check_port 8000 "backend" || exit 1
    check_port 3000 "frontend" || exit 1
    start_db || exit 1
    echo ""
    echo "启动后端 (uvicorn --reload) 与前端 (next dev)..."
    echo "  Backend:  http://localhost:8000"
    echo "  Frontend: http://localhost:3000"
    echo "  (Ctrl+C 退出前后端，数据库保留运行)"
    echo ""
    # 退出时清理前后端子进程（不动 db，下次启动更快）
    cleanup() {
      echo ""
      echo "停止前后端进程..."
      [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null
      [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null
      echo "数据库仍在运行，如需停止: ./dev-start.sh stop"
    }
    trap cleanup INT TERM
    (cd backend && exec .venv/bin/uvicorn main:app --reload --host 0.0.0.0 --port 8000) &
    BACKEND_PID=$!
    (cd frontend && exec pnpm dev) &
    FRONTEND_PID=$!
    wait
    ;;
  db)
    start_db || exit 1
    echo ""
    echo "数据库与 Redis 已启动，请在两个终端分别运行："
    echo "  cd backend && .venv/bin/uvicorn main:app --reload --port 8000"
    echo "  cd frontend && pnpm dev"
    echo ""
    echo "注意: 手动启动 backend 时需自行 export REDIS_URL（参考脚本顶部逻辑），"
    echo "      或直接执行: ./dev-start.sh  (一键启动全部，自动注入环境变量)"
    ;;
  stop)
    echo "停止数据库与 Redis 容器..."
    $DEV_COMPOSE stop db redis
    echo "✅ 已停止（本地前后端进程请用 Ctrl+C 终止）"
    ;;
  status|ps)
    $DEV_COMPOSE ps
    echo ""
    echo "本地进程端口占用:"
    lsof -i:8000 -i:3000 2>/dev/null | grep LISTEN || echo "  8000/3000 端口空闲"
    ;;
  logs)
    $DEV_COMPOSE logs -f db
    ;;
  down)
    echo "停止并删除容器（保留数据卷）..."
    $DEV_COMPOSE down
    echo "✅ 容器已删除，pgdata volume 保留"
    ;;
  *)
    echo "用法: $0 {up|db|stop|status|logs|down}"
    echo ""
    echo "  up       启动全部（db + backend + frontend）— 默认"
    echo "  db       只启动数据库"
    echo "  stop     停止数据库容器"
    echo "  status   查看容器与端口状态"
    echo "  logs     查看数据库日志"
    echo "  down     停止并删除容器（保留数据卷）"
    exit 1
    ;;
esac
