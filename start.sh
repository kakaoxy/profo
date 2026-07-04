#!/bin/bash
# Profo Docker 一键启停脚本
#
# 用法:
#   ./start.sh         启动（后台）
#   ./start.sh stop    停止
#   ./start.sh restart 重启
#   ./start.sh logs    查看全部日志
#   ./start.sh status  查看服务状态
#   ./start.sh down    停止并删除容器（保留数据卷）
#   ./start.sh rebuild 重新构建镜像并启动

set -e

COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$COMPOSE_DIR"

# 首次运行若缺 .env 则从模板复制
if [ ! -f .env ]; then
  if [ -f .env.docker.example ]; then
    echo "未检测到 .env，从 .env.docker.example 复制模板..."
    cp .env.docker.example .env
    echo "⚠️  请编辑 .env 填入真实凭据（POSTGRES_PASSWORD / JWT_SECRET_KEY / ENCRYPTION_KEY 等）后重新运行"
    exit 1
  else
    echo "❌ 未找到 .env 且无 .env.docker.example 模板"
    exit 1
  fi
fi

CMD="${1:-up}"

case "$CMD" in
  up|start)
    echo "启动 Profo Docker 服务..."
    docker compose up -d
    echo "✅ 服务已启动，访问 http://localhost/"
    docker compose ps
    ;;
  stop)
    echo "停止 Profo Docker 服务..."
    docker compose stop
    echo "✅ 服务已停止（容器与数据卷保留）"
    ;;
  restart)
    echo "重启 Profo Docker 服务..."
    docker compose restart
    echo "✅ 服务已重启"
    docker compose ps
    ;;
  logs)
    docker compose logs -f --tail=100
    ;;
  status|ps)
    docker compose ps
    ;;
  down)
    echo "停止并删除容器（保留数据卷）..."
    docker compose down
    echo "✅ 容器已删除，数据卷 pgdata/uploads 保留"
    ;;
  rebuild)
    echo "重新构建镜像并启动..."
    docker compose up -d --build
    echo "✅ 重建完成，访问 http://localhost/"
    docker compose ps
    ;;
  *)
    echo "用法: $0 {up|start|stop|restart|logs|status|down|rebuild}"
    exit 1
    ;;
esac
