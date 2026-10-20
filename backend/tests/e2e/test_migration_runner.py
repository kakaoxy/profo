"""迭代一 E2E：真实 PG + 真实 pg_dump 的迁移执行器全链路（spec §13.2）。

**与其他单测的分工**：``tests/test_migration_*.py`` 用桩替换 ``pg_dump``；本文件
**必须**跑真实 ``pg_dump``，否则「备份强制」这条验收项（A6）永远没被真实验证过。

前置条件：
- PostgreSQL 可达（``DATABASE_URL``，测试库自动改写为 ``profo_test``）；
- ``pg_dump`` 可执行（PATH 或 ``MIGRATION_PG_DUMP_PATH``）。缺失时**不静默跳过**，
  而是打印安装指引并退出 1（Fail Loud），由 CI 显式提供客户端。

用法::

    cd backend && .venv/bin/python tests/e2e/test_migration_runner.py

产出：``tests/e2e/artifacts/migration-e2e-YYYYmmdd-HHMMSS.txt``（可用 ``run_migration_e2e.sh``
一次跑完并归档）。
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_BACKEND_DIR))

os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")
os.environ.setdefault("UPLOAD_DIR", str(_BACKEND_DIR / "static" / "uploads"))

ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"

_results: list[tuple[str, bool, str]] = []


def check(name: str, detail: str = "", *, ok: bool = True) -> None:
    """记录一条校验结果（打印 + 汇总）.

    ``ok`` 为关键字参数（避免布尔位置参数歧义）。
    """
    _results.append((name, ok, detail))
    mark = "✓" if ok else "✗"
    print(f"  {mark} {name}{(' — ' + detail) if detail else ''}")


def require_pg_dump() -> str:
    """定位 pg_dump；缺失时给出可复制的安装指引并以退出码 1 结束（不静默跳过）."""
    from settings import settings

    if settings.migration_pg_dump_path:
        candidate = Path(settings.migration_pg_dump_path)
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
    found = shutil.which("pg_dump")
    if found:
        return found
    print(
        "[FATAL] 未找到 pg_dump，无法执行真实备份链路 E2E。\n"
        "  容器内：镜像已安装 postgresql-client，请检查 PATH\n"
        "  本机开发：brew install libpq && "
        "export MIGRATION_PG_DUMP_PATH=$(brew --prefix libpq)/bin/pg_dump",
        file=sys.stderr,
    )
    raise SystemExit(1)


def main() -> int:
    """执行 E2E 全流程并写工件."""
    pg_dump_path = require_pg_dump()
    os.environ["MIGRATION_PG_DUMP_PATH"] = pg_dump_path

    from sqlalchemy import text

    import db
    from migrations.checksum import checksum_of
    from migrations.registry import MIGRATION_BY_VERSION, MIGRATIONS
    from migrations.runner import (
        MigrationBlockedError,
        _apply_one,
        compensate,
        rebaseline,
        run_startup_migrations,
    )
    from migrations.schema_migrations import load_state

    engine = db.engine
    print("═" * 78)
    print("迭代一 E2E：迁移版本化执行器（真实 PG + 真实 pg_dump）")
    print(f"时间：{datetime.now(timezone.utc):%Y-%m-%d %H:%M:%S}")
    dump_version = subprocess.run(  # noqa: S603 - pg_dump 路径来自受控配置/PATH
        [pg_dump_path, "--version"],
        capture_output=True,
        text=True,
        check=False,
    ).stdout.strip()
    print(f"pg_dump：{pg_dump_path} → {dump_version}")
    print(f"数据库：{db.engine.url.database}")
    print("═" * 78)

    # ── ① 账本可读，且条目数 = 注册表 ────────────────────────────────
    print("\n① 账本读取与覆盖率（G1）")
    from migrations.schema_migrations import ensure_version_tables

    ensure_version_tables(engine)
    state = load_state(engine)
    check("版本账本可读", f"applied={len(state.applied)} failed={len(state.failed)}", ok=True)
    check("账本覆盖 82 项（注册表长度）", f"len(MIGRATIONS)={len(MIGRATIONS)}", ok=len(MIGRATIONS) == 82)

    # ── ② 重复启动零 pending + 增量耗时可测 ─────────────────────────
    print("\n② 重复启动零 pending（A2 / G6）")
    summary = run_startup_migrations(engine)
    assert summary is not None
    check("pending=0", summary.as_log_line(), ok=summary.pending == 0)
    check("启动增量 ≤ 5000ms", f"{summary.duration_ms}ms", ok=summary.duration_ms < 5000)

    # ── ③ checksum 阻断 + rebaseline 放行 ──────────────────────────
    print("\n③ checksum 漂移阻断与重基线（A5）")
    target_version = 49
    target = MIGRATION_BY_VERSION[target_version]
    real_checksum = checksum_of(target.fn)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE schema_migrations SET checksum = :c WHERE version = :v"),
            {"c": "0" * 64, "v": target_version},
        )
    blocked = False
    try:
        run_startup_migrations(engine)
    except MigrationBlockedError as exc:
        blocked = "version=49" in str(exc) and "expected=" in str(exc)
        check("启动被 checksum 漂移阻断", str(exc).splitlines()[0], ok=blocked)
    if not blocked:
        check("启动被 checksum 漂移阻断", "未阻断或错误文案缺少 expected/actual", ok=False)

    rebaseline(engine, target_version, reason="E2E 演练：恢复真实 checksum")
    after = load_state(engine)
    restored = after.applied[target_version].checksum == real_checksum
    check("rebaseline 后 checksum 恢复", f"sha256={real_checksum[:12]}", ok=restored)
    with engine.connect() as conn:
        audit = conn.execute(
            text(
                "SELECT action, result FROM migration_compensations WHERE version = :v "
                "AND action = 'rebaseline' ORDER BY id DESC LIMIT 1",
            ),
            {"v": target_version},
        ).first()
    check("rebaseline 审计已落库", f"{audit}", ok=audit is not None and audit[1] == "success")

    # ── ④ 真实 pg_dump 备份 → sha256 一致 ─────────────────────────
    print("\n④ 真实备份链路（G4）")
    from migrations.backup import list_backups

    before_files = {p.name for p in list_backups()}
    _apply_one(engine, MIGRATION_BY_VERSION[4])  # backup=table(users)，真实走 pg_dump
    new_files = [p for p in list_backups() if p.name not in before_files]
    check("备份文件已生成", f"{[p.name for p in new_files]}", ok=bool(new_files))
    if new_files:
        newest = new_files[0]
        digest = hashlib.sha256(newest.read_bytes()).hexdigest()
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT backup_path, backup_sha256, backup_scope FROM schema_migrations WHERE version = 4"),
            ).first()
        check("账本记录了备份路径", str(row[0]) if row else "无", ok=row is not None and row[0] is not None)
        check("账本 sha256 与文件一致", f"{digest[:12]}", ok=row is not None and row[1] == digest)
        check("备份范围=table", str(row[2]) if row else "-", ok=row is not None and row[2] == "table")
        check("备份文件非空", f"{newest.stat().st_size} 字节", ok=newest.stat().st_size > 0)

    # ── ⑤ 补偿 dry-run 无副作用 → --yes 实跑 → 审计 ────────────────
    print("\n⑤ 补偿闸门与执行（A7 / A8）")
    with engine.connect() as conn:
        before_null = conn.execute(text("SELECT count(*) FROM leads WHERE unit_price IS NULL")).scalar()
    dry = compensate(
        engine,
        50,
        dry_run=True,
        yes=True,
        force=False,
        reason="E2E 演练 dry-run",
        operator="e2e",
    )
    with engine.connect() as conn:
        after_dry_null = conn.execute(text("SELECT count(*) FROM leads WHERE unit_price IS NULL")).scalar()
    check("dry-run 未修改数据", f"{before_null} → {after_dry_null}", ok=before_null == after_dry_null)
    check("dry-run 报告影响行数", f"affected_rows={dry.affected_rows}", ok=dry.result == "dry_run")

    real = compensate(
        engine,
        50,
        dry_run=False,
        yes=True,
        force=False,
        reason="E2E 演练 实跑",
        operator="e2e",
    )
    with engine.connect() as conn:
        after_real_null = conn.execute(text("SELECT count(*) FROM leads WHERE unit_price IS NULL")).scalar()
    rows_match = real.affected_rows == dry.affected_rows
    check("实跑行数与 dry-run 预估一致", f"dry={dry.affected_rows} real={real.affected_rows}", ok=rows_match)
    delta_ok = after_real_null - after_dry_null == real.affected_rows
    check("实跑后 NULL 行数增量 = 影响行数", f"{after_dry_null} → {after_real_null}", ok=delta_ok)
    with engine.connect() as conn:
        audit = conn.execute(
            text(
                "SELECT result, affected_rows FROM migration_compensations WHERE version = 50 "
                "AND action = 'compensate' AND dry_run = false ORDER BY id DESC LIMIT 1",
            ),
        ).first()
    check(
        "补偿审计 success + affected_rows 非空",
        f"{audit}",
        ok=audit is not None and audit[0] == "success" and audit[1] is not None,
    )

    # ── ⑥ 恢复：重跑正向迁移 ───────────────────────────────────────
    print("\n⑥ 恢复：重跑 backfill_lead_unit_price（up 路径）")
    with engine.connect() as conn:
        before_up_null = conn.execute(text("SELECT count(*) FROM leads WHERE unit_price IS NULL")).scalar()
    _apply_one(engine, MIGRATION_BY_VERSION[50])
    with engine.connect() as conn:
        after_up_null = conn.execute(text("SELECT count(*) FROM leads WHERE unit_price IS NULL")).scalar()
    restored_rows = after_up_null == after_real_null - real.affected_rows
    check("重跑后 NULL 行数回落到实跑前水平", f"{before_up_null} → {after_up_null}", ok=restored_rows)

    # ── ⑦ 不可逆拒绝（A9） ────────────────────────────────────────
    print("\n⑦ 不可逆版本拒绝自动补偿（A9）")
    from migrations.compensations.base import CompensationNotSupportedError

    refused = False
    try:
        compensate(engine, 3, dry_run=True, yes=True, force=False, reason="E2E", operator="e2e")
    except CompensationNotSupportedError as exc:
        refused = "restore-hint" in str(exc)
        check("v3（加密手机号）拒绝自动补偿", str(exc)[:80], ok=refused)
    if not refused:
        check("v3（加密手机号）拒绝自动补偿", "未抛 CompensationNotSupportedError", ok=False)

    # ── ⑧ CLI 双路径（容器内/本机一致）─────────────────────────────
    print("\n⑧ CLI status --json 契约（§13.2 第 6 步）")
    cli = subprocess.run(
        [sys.executable, "-m", "migrations.manage", "status", "--json"],
        cwd=str(_BACKEND_DIR),
        capture_output=True,
        text=True,
        check=False,
        env={**os.environ, "MIGRATION_PG_DUMP_PATH": pg_dump_path},
    )
    if cli.returncode != 0:
        check("CLI status --json 成功", cli.stderr.strip()[:200], ok=False)
    else:
        payload = json.loads(cli.stdout)
        check("total == 82", f"total={payload['total']}", ok=payload["total"] == 82)
        check("applied == 82", f"applied={payload['applied']}", ok=payload["applied"] == 82)
        check("failed == 0", f"failed={payload['failed']}", ok=payload["failed"] == 0)
        check("checksum_mismatch 为空", f"{payload['checksum_mismatch']}", ok=payload["checksum_mismatch"] == [])
        check("backups 概况含磁盘余量", f"{payload['backups']['free_mb']}MB", ok="free_mb" in payload["backups"])

    # ── 汇总 ──────────────────────────────────────────────────────
    print("\n" + "═" * 78)
    failures = [name for name, ok, _ in _results if not ok]
    print(f"用例总数：{len(_results)}，通过：{len(_results) - len(failures)}，失败：{len(failures)}")
    if failures:
        print("失败用例：")
        for name in failures:
            print(f"  ✗ {name}")
        print("总结论：存在失败用例")
        return 1
    print("总结论：全部通过 ✓")
    return 0


if __name__ == "__main__":
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        code = main()
    except SystemExit:
        raise
    except Exception:
        import traceback

        traceback.print_exc()
        code = 1
    print(f"\n备份目录：{os.environ.get('MIGRATION_BACKUP_DIR', '(默认)')}")
    sys.exit(code)
