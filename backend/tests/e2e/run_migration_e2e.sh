#!/bin/bash
# 迭代一 E2E 全量执行（可复验工件，仿 run_all.sh 的 tee 模式）
#
# 前置：
#   1. PostgreSQL 可达（根目录 .env 的 DATABASE_URL；测试库自动改写为 profo_test）
#   2. pg_dump 可执行：
#        - 容器内：镜像已装 postgresql-client
#        - 本机开发：brew install libpq
#          export MIGRATION_PG_DUMP_PATH="$(brew --prefix libpq)/bin/pg_dump"
#
# 用法：
#   bash backend/tests/e2e/run_migration_e2e.sh
set -o pipefail

BACKEND_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$BACKEND_DIR" || exit 1

# 本地开发兜底：keg-only 的 libpq 不在 PATH 中
if [ -z "${MIGRATION_PG_DUMP_PATH:-}" ]; then
  for candidate in /opt/homebrew/opt/libpq/bin/pg_dump /usr/local/opt/libpq/bin/pg_dump; do
    if [ -x "$candidate" ]; then
      export MIGRATION_PG_DUMP_PATH="$candidate"
      break
    fi
  done
fi

OUT="tests/e2e/artifacts/migration-e2e-$(date +%Y%m%d-%H%M%S).txt"
mkdir -p tests/e2e/artifacts
{
  echo "迭代一迁移执行器 E2E 报告"
  echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "命令: bash backend/tests/e2e/run_migration_e2e.sh"
  echo "pg_dump: ${MIGRATION_PG_DUMP_PATH:-$(command -v pg_dump || echo '未找到')}"
  echo ""
  "$BACKEND_DIR/.venv/bin/python" "$BACKEND_DIR/tests/e2e/test_migration_runner.py" 2>&1
  rc=$?
  echo ""
  echo "（退出码: ${rc}）"
  if [ $rc -ne 0 ]; then
    echo "总结论: 存在失败用例（见上文）"
  else
    echo "总结论: 全部 E2E 通过 ✓"
  fi
} | tee "$OUT"
echo ""
echo "报告已保存: $OUT"
exit $rc
