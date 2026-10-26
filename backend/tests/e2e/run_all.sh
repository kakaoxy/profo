#!/bin/bash
# 楼盘字典 E2E 全量执行（Task 21.1 可复验工件）
# 前置：后端 :8000 运行中（uvicorn main:app --reload --host 0.0.0.0 --port 8000）
BACKEND_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$BACKEND_DIR" || exit 1
OUT="tests/e2e/artifacts/e2e-report-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "楼盘字典 E2E 全量执行报告"
  echo "时间: $(date '+%Y-%m-%d %H:%M:%S')"
  echo "命令: bash backend/tests/e2e/run_all.sh"
  echo ""
  FAIL=0
  for t in tests/e2e/test_bd_import.py tests/e2e/test_bd_review_api.py tests/e2e/test_bd_form_chain.py tests/e2e/test_bd_machine_link.py tests/e2e/test_bd_dictionary_link.py tests/e2e/test_bd_unmerge.py tests/e2e/test_bd_c_side.py tests/e2e/test_bd_fix_regression.py tests/e2e/test_bd_surface_binding.py tests/e2e/test_bd_capacity_fixes.py tests/e2e/test_bd_import_fixes.py tests/e2e/test_bd_pending_selectable.py tests/e2e/test_bd_audit_20261017_fixes.py tests/e2e/test_bd_merge_conflict.py tests/e2e/test_bd_merge_union.py tests/e2e/test_bd_perf_security_fixes.py tests/e2e/test_migration_community_profile_union.py; do
    echo "════════════════════════════════════════"
    echo "▶ $t"
    "$BACKEND_DIR/.venv/bin/python" "$t" 2>&1
    rc=$?
    echo "（退出码: $rc）"
    [ $rc -ne 0 ] && FAIL=1
  done
  echo "════════════════════════════════════════"
  if [ $FAIL -eq 0 ]; then
    echo "总结论: 全部 E2E 通过 ✓"
  else
    echo "总结论: 存在失败用例（见上文）"
  fi
} | tee "$OUT"
echo ""
echo "报告已保存: $OUT"
exit $FAIL
