#!/bin/bash
# Profo 开发环境一键启停脚本
#
# 架构：Docker 跑 PostgreSQL + 本地 uvicorn --reload + 本地 next dev
# 前后端代码改动自动热重载，无需 docker rebuild。
#
# 与 ./start.sh 的区别：
#   ./start.sh        生产部署，四服务全部容器化，改代码需 rebuild
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
if [ ! -e "$UPLOADS_SYMLINK" ]; then
  ln -s "$UPLOADS_TARGET" "$UPLOADS_SYMLINK"
  echo "✅ 已创建软链 $UPLOADS_SYMLINK → $UPLOADS_TARGET（共享 uploads 目录）"
elif [ -L "$UPLOADS_SYMLINK" ]; then
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

start_db() {
  echo "启动 PostgreSQL (Docker)..."
  $DEV_COMPOSE up -d db
  echo "✅ 数据库已启动: postgresql+psycopg://${POSTGRES_USER}:***@127.0.0.1:5432/${POSTGRES_DB}"
}

case "$CMD" in
  up|start)
    # 端口预检（db 端口 5432 由 Docker 管理，无需检查）
    check_port 8000 "backend" || exit 1
    check_port 3000 "frontend" || exit 1
    start_db
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
    start_db
    echo ""
    echo "数据库已启动，请在两个终端分别运行："
    echo "  cd backend && .venv/bin/uvicorn main:app --reload --port 8000"
    echo "  cd frontend && pnpm dev"
    echo ""
    echo "或直接执行: ./dev-start.sh  (一键启动全部)"
    ;;
  stop)
    echo "停止数据库容器..."
    $DEV_COMPOSE stop db
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
