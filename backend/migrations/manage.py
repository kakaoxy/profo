"""迁移管理 CLI（迭代一 T1.7）。

用法（容器内与容器外一致，均与 ``uvicorn`` 同环境加载 ``.env``）::

    python -m migrations.manage <command> [options]

命令与退出码（spec §10）：

=============  ======================================================  ======
命令            行为                                                    退出码
=============  ======================================================  ======
``status``      80（现 82）行明细 + 汇总 + 备份概况；``--json`` 稳定结构    0 / 1（有 failed）
``verify``      注册表完整 / checksum 一致 / 备份 sha256 匹配 / failed 为空   0 / 1
``baseline``    既有库基线登记（``--confirm`` 必填，``--dry-run`` 预演）      0 / 1 / 2（缺 confirm）
``up``          手工执行 pending（持锁，等价启动流程，不带 init_db）         0 / 1
``retry``       仅重跑指定 failed 版本                                     0 / 1
``rebaseline``  写回当前源码 checksum + 审计                               0 / 1
``compensate``  补偿（dry-run / --yes / --force 闸门）                     0 / 1 / 2（被闸门拒绝）
``restore-hint`` 打印恢复 runbook 片段                                      0
=============  ======================================================  ======

输出约定：人类可读表 + 关键汇总行；``--json`` 输出稳定结构供 CI/巡检消费。
"""

import argparse
import json
import logging
import sys
from pathlib import Path
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations.backup import backup_status, verify_backup_file
from migrations.registry import MIGRATION_BY_VERSION, MIGRATIONS, Migration
from migrations.runner import (
    MigrationBlockedError,
    compensate,
    compute_checksum_mismatches,
    rebaseline,
    retry,
    run_startup_migrations,
)
from migrations.runner import baseline as run_baseline
from migrations.schema_migrations import (
    STATUS_APPLIED,
    load_state,
    operator_identity,
)
from settings import settings

logger = logging.getLogger(__name__)

EXIT_OK = 0
EXIT_PROBLEM = 1
EXIT_REFUSED = 2


def _engine() -> Engine:
    """取应用共享引擎（与 uvicorn 同一 ``settings``/``.env``）."""
    from db import engine

    return engine


class _UnknownMigrationError(RuntimeError):
    """命令参数指向未登记的迁移（CLI 边界统一转退出码 1）."""


def _migration_or_exit(version_or_name: str) -> Migration:
    """解析 ``<version>`` 或 ``<name>`` 参数.

    Args:
        version_or_name: 版本号字符串或迁移名。

    Returns:
        登记的 Migration。

    Raises:
        _UnknownMigrationError: 版本号/名字未登记（由 ``main`` 转退出码 1）。

    """
    token = version_or_name.strip()
    if token.isdigit():
        migration = MIGRATION_BY_VERSION.get(int(token))
    else:
        migration = next((m for m in MIGRATIONS if m.name == token), None)
    if migration is None:
        msg = f"未找到迁移：{version_or_name}"
        raise _UnknownMigrationError(msg)
    return migration


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------


def cmd_status(args: argparse.Namespace) -> int:
    """打印迁移账本明细与汇总（``--json`` 为稳定结构）."""
    engine = _engine()
    state = load_state(engine)
    rows = []
    for migration in MIGRATIONS:
        applied_row = state.applied.get(migration.version)
        failed_row = state.failed.get(migration.version)
        status = STATUS_APPLIED if applied_row else ("failed" if failed_row else "pending")
        row = applied_row or failed_row
        rows.append(
            {
                "version": migration.version,
                "name": migration.name,
                "kind": migration.kind,
                "risk": migration.risk,
                "status": status,
                "duration_ms": row.duration_ms if row else None,
                "backup_scope": row.backup_scope if row else migration.backup,
                "backup_path": row.backup_path if row else None,
                "applied_at": row.applied_at.isoformat() if row and row.applied_at else None,
                "error": (row.error or "")[:200] if row and row.error else None,
            },
        )
    payload = {
        "total": len(MIGRATIONS),
        "applied": len(state.applied),
        "pending": len([m for m in MIGRATIONS if m.version not in state.applied]),
        "failed": len(state.failed),
        "checksum_mismatch": [v for v, *_ in compute_checksum_mismatches(state)],
        "backups": backup_status(),
        "migrations": rows,
    }
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        _print_status_table(rows, payload, state)
    return EXIT_PROBLEM if payload["failed"] else EXIT_OK


def _print_status_table(rows: list[dict[str, Any]], payload: dict[str, Any], state: object) -> None:
    """人类可读状态表.

    Args:
        rows: 逐条状态。
        payload: 汇总负载。
        state: 版本账本快照（取 failed 明细）。

    """
    header = f"{'v':>3}  {'name':<50} {'kind':<6} {'risk':<4} {'status':<7} {'ms':>7}  {'backup':<5}"
    print(header)
    print("-" * len(header))
    for row in rows:
        print(
            f"{row['version']:>3}  {row['name']:<50} {row['kind']:<6} {row['risk']:<4} "
            f"{row['status']:<7} {row['duration_ms'] or '-'!s:>7}  {row['backup_scope'] or '-'!s:<5}",
        )
    print("-" * len(header))
    print(
        f"迁移状态：applied={payload['applied']} pending={payload['pending']} failed={payload['failed']} "
        f"total={payload['total']}",
    )
    backups = payload["backups"]
    print(
        f"备份目录：{backups['dir']}  份数={backups['count']}  总大小={backups['total_mb']}MB  "
        f"磁盘余量={backups['free_mb']}MB",
    )
    if payload["checksum_mismatch"]:
        print(f"⚠️  checksum 漂移版本：{payload['checksum_mismatch']}（启动会阻断，需 rebaseline）")
    failed_versions = getattr(state, "failed_versions", set())
    if failed_versions:
        for version in sorted(failed_versions):
            row = state.failed[version]  # type: ignore[attr-defined]
            first_line = (row.error or "").strip().splitlines()
            print(f"❌ v{version} {row.name} 失败：{(first_line[0] if first_line else '')[:160]}")


# ---------------------------------------------------------------------------
# verify
# ---------------------------------------------------------------------------


def cmd_verify(args: argparse.Namespace) -> int:
    """校验注册表 / checksum / 备份文件 / failed 状态（有任一问题退出码 1）."""
    engine = _engine()
    problems: list[str] = []

    expected_versions = list(range(1, len(MIGRATIONS) + 1))
    actual_versions = [m.version for m in MIGRATIONS]
    if expected_versions != actual_versions:
        problems.append(f"注册表版本不连续：期望 {expected_versions[:3]}...，实际 {actual_versions[:3]}...")

    state = load_state(engine)
    for version, name, expected, actual in compute_checksum_mismatches(state):
        problems.append(f"checksum 漂移 v{version} {name}：expected={expected[:12]} actual={actual[:12]}")

    for version, row in sorted(state.applied.items()):
        if not row.backup_path:
            continue
        ok, detail = verify_backup_file(row.backup_path, row.backup_sha256 or "")
        if not ok:
            problems.append(f"备份校验失败 v{version} {row.name}：{row.backup_path} → {detail}")

    for version, row in sorted(state.failed.items()):
        problems.append(f"存在 failed 记录 v{version} {row.name}（需 retry 或 compensate）")

    if args.json:
        print(json.dumps({"ok": not problems, "problems": problems}, ensure_ascii=False, indent=2))
    else:
        print(f"校验项：注册表 {len(MIGRATIONS)} 项 / 已应用 {len(state.applied)} 项 / 失败 {len(state.failed)} 项")
        if problems:
            print("发现问题：")
            for item in problems:
                print(f"  - {item}")
        else:
            print("全部通过 ✓")
    return EXIT_PROBLEM if problems else EXIT_OK


# ---------------------------------------------------------------------------
# baseline / up / retry / rebaseline
# ---------------------------------------------------------------------------


def cmd_baseline(args: argparse.Namespace) -> int:
    """既有库基线登记（``--confirm`` 必填，``--dry-run`` 预演）."""
    if not args.confirm and not args.dry_run:
        print(
            "baseline 需要显式确认：\n"
            "  预演：python -m migrations.manage baseline --dry-run\n"
            "  实跑：python -m migrations.manage baseline --confirm",
        )
        return EXIT_REFUSED
    engine = _engine()
    try:
        executed = run_baseline(engine, confirm=True, dry_run=args.dry_run)
    except MigrationBlockedError as exc:
        print(f"[FATAL] {exc}", file=sys.stderr)
        return EXIT_PROBLEM
    if args.dry_run:
        print("dry-run 完成：未写库、未备份。")
        return EXIT_OK
    print(f"baseline 完成：登记 {len(executed)} 项")
    return EXIT_OK


def cmd_up(args: argparse.Namespace) -> int:  # noqa: ARG001 - argparse 回调签名统一
    """手工执行 pending 迁移（持锁；等价启动流程但不做 ``init_db``）."""
    engine = _engine()
    try:
        summary = run_startup_migrations(engine)
    except MigrationBlockedError as exc:
        print(f"[FATAL] {exc}", file=sys.stderr)
        return EXIT_PROBLEM
    if summary is None:
        print("legacy 模式：已执行旧硬编码迁移路径（无版本账本）")
        return EXIT_OK
    print(summary.as_log_line())
    return EXIT_OK


def cmd_retry(args: argparse.Namespace) -> int:
    """仅重跑指定 failed 版本（幂等）."""
    migration = _migration_or_exit(args.version)
    engine = _engine()
    try:
        retry(engine, migration.version, reason=args.reason)
    except MigrationBlockedError as exc:
        print(f"[FATAL] {exc}", file=sys.stderr)
        return EXIT_PROBLEM
    except Exception as exc:
        print(f"[FATAL] 重试失败：{type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_PROBLEM
    print(f"v{migration.version} {migration.name} 重试成功")
    return EXIT_OK


def cmd_rebaseline(args: argparse.Namespace) -> int:
    """把当前源码 checksum 写回账本（只允许无行为变化的重构）."""
    migration = _migration_or_exit(args.version)
    engine = _engine()
    try:
        rebaseline(engine, migration.version, reason=args.reason or "")
    except MigrationBlockedError as exc:
        print(f"[FATAL] {exc}", file=sys.stderr)
        return EXIT_PROBLEM
    print(f"v{migration.version} {migration.name} checksum 已重基线（审计已记录）")
    return EXIT_OK


# ---------------------------------------------------------------------------
# compensate / restore-hint
# ---------------------------------------------------------------------------


def cmd_compensate(args: argparse.Namespace) -> int:
    """执行补偿（dry-run / --yes / --force 闸门）."""
    from migrations.compensations.base import CompensationNotSupportedError

    migration = _migration_or_exit(args.version)
    engine = _engine()
    try:
        outcome = compensate(
            engine,
            migration.version,
            dry_run=args.dry_run,
            yes=args.yes,
            force=args.force,
            reason=args.reason,
            operator=operator_identity(),
        )
    except CompensationNotSupportedError as exc:
        print(f"[REFUSED] {exc}", file=sys.stderr)
        print_restore_hint(migration.version)
        return EXIT_REFUSED
    except MigrationBlockedError as exc:
        print(f"[REFUSED] {exc}", file=sys.stderr)
        return EXIT_REFUSED
    except Exception as exc:
        print(f"[FATAL] 补偿失败：{type(exc).__name__}: {exc}", file=sys.stderr)
        return EXIT_PROBLEM

    if outcome.exit_code == EXIT_REFUSED:
        print(f"[REFUSED] {outcome.notes}", file=sys.stderr)
        return EXIT_REFUSED
    label = "dry-run 预计影响" if args.dry_run else "已影响"
    print(f"v{migration.version} {migration.name}：{label} {outcome.affected_rows} 行")
    if outcome.notes:
        print(f"  {outcome.notes}")
    return EXIT_OK


def cmd_restore_hint(args: argparse.Namespace) -> int:
    """打印该版本的恢复 runbook 片段（备份路径 + pg_restore 命令 + 验证 SQL）."""
    migration = _migration_or_exit(args.version)
    print_restore_hint(migration.version)
    return EXIT_OK


def print_restore_hint(version: int) -> None:
    """输出可直接复制的恢复步骤（A12 要求：不留「需现场推断」的占位）.

    Args:
        version: 迁移版本号。

    """
    migration = MIGRATION_BY_VERSION.get(version)
    if migration is None:
        print(f"[ERROR] 未找到迁移 v{version}", file=sys.stderr)
        return
    engine = _engine()
    state = load_state(engine)
    row = state.applied.get(version) or state.failed.get(version)
    backup = row.backup_path if row and row.backup_path else None
    url_db = _db_name(engine)
    print(f"# 恢复指引：v{version} {migration.name}（kind={migration.kind} risk={migration.risk}）")
    print(f"# 备份范围：{migration.backup}  表：{', '.join(migration.backup_tables) or '-'}")
    if backup:
        print(f"# 备份文件：{backup}")
    elif migration.backup == "none":
        print("# 该迁移登记为 backup=none（纯新增，无数据改写），恢复方式：")
        print(f'#   python -m migrations.manage compensate {version} --yes --reason "回滚纯新增"')
        return
    else:
        print("# ⚠️ 账本中无该版本的备份文件（迁移可能尚未执行成功，或备份被 prune）。")
        print("#   请改用最近一次全库备份：ls -lt /app/backups/migrations/*.dump | head")

    backup_client = row.backup_client if row and row.backup_client else ""
    server = _server_version(engine)
    is_placeholder = backup.startswith("/app/backups/migrations/<")
    dump_arg = backup if is_placeholder else _container_backup_path(backup)

    print()
    print("# ⚠️ 归档格式与客户端版本强绑定（实测）：")
    print("#    pg_dump ≥17 产出的归档是 1.16 版，PG16 自带的 pg_restore 会直接拒绝：")
    print("#      pg_restore: error: unsupported version (1.16) in file header")
    print("#    另外 client ≥17 会写 SET transaction_timeout，PG16 报 unrecognized parameter。")
    print("#    ⇒ 恢复必须用**产生该备份的同一大版本客户端**，且目标 server ≥ 该版本。")
    if backup_client:
        print(f"#    本备份由 pg_dump {backup_client} 产出；当前 server 为 {server or '未知'}。")
        if _major_of(backup_client) > _major_of(server):
            print(
                f"#    ⚠️ 客户端大版本({_major_of(backup_client)}) > server 大版本({_major_of(server)})："
                "**PG16 无法直接恢复该备份**。",
            )
            print("#    可行路径（择一，均需人工判断）：")
            print("#      a) 用 postgres:<client 大版本>-alpine 起临时库并挂同一备份卷，恢复到临时库后 dump 成 SQL，")
            print("#         再用 psql 灌回 PG16（SET 语句会被忽略警告）；")
            print("#      b) 直接用 deploy-server.sh 的 backup_*.sql.gz 全库回放（plain SQL，无归档格式问题）；")
            print("#    —— 本迭代不提供自动化「跨大版本恢复」脚本（spec §18.2 边界）。")

    print()
    print("# 1) 恢复到**临时库**（不覆盖生产，便于比对；D-01 口径）")
    print("#    以下是**本机实测可跑通**的两段式配方（2026-10-19，client 18.6 / server 16.15）：")
    print("#    a. 先用同版本 client dump 一份 schema-only，恢复到临时库（建出空表）")
    print("#    b. 再灌本次的 data-only 备份（scope=table）——**不要加 --table 过滤**，")
    print("#       实测加 --table 会静默灌 0 行（archive 内的 schema 限定行为差异）")
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend psql \\')
    print('  -h db -U "$POSTGRES_USER" -d postgres \\')
    print('  -c "DROP DATABASE IF EXISTS restore_check;" \\')
    print('  -c "CREATE DATABASE restore_check OWNER \\"$POSTGRES_USER\\";"')
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend sh -c \\')
    print('  "pg_dump --format=custom --schema-only --no-owner \\')
    print('     --host db --username \\"$POSTGRES_USER\\" \\')
    print('     --dbname \\"$POSTGRES_DB\\" --file /tmp/restore_schema.dump \\')
    print('   && pg_restore --host db --username \\"$POSTGRES_USER\\" \\')
    print('     -d restore_check --no-owner --no-privileges /tmp/restore_schema.dump"')
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend pg_restore \\')
    print('  -h db -U "$POSTGRES_USER" -d restore_check --no-owner --no-privileges --data-only \\')
    print(f"  {dump_arg}")
    print()
    print("# 2) 取回原表的行数快照（与新库比对）")
    for table in migration.backup_tables or ("<涉及的表>",):
        print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend psql \\')
        print(f'  -h db -U "$POSTGRES_USER" -d restore_check -tAc "SELECT count(*) FROM {table}"')
    print("#    期望与生产一致：")
    for table in migration.backup_tables or ("<涉及的表>",):
        print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend psql \\')
        print(f'  -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM {table}"')
    print()
    print("# 3) 按表核对差异后，手工把需要回退的行合并回生产（本期不提供自动合并脚本，")
    print("#    spec §18.2 已声明该边界）")
    print("# 4) 验证：")
    print("docker compose exec backend .venv/bin/python -m migrations.manage verify")
    print(f"docker compose exec backend .venv/bin/python -m migrations.manage status | grep 'v{version:>3}'")
    print("# 5) 若确认无需保留该迁移的 schema 变更：")
    print(f"docker compose exec backend .venv/bin/python -m migrations.manage compensate {version} --dry-run")
    print()
    print(f"# 数据库：{url_db}")


def _major_of(version: str) -> int:
    """取版本号主版本（空串/不可解析 → 0）.

    Args:
        version: 形如 ``18.6`` 的版本串。

    Returns:
        主版本数字。

    """
    head = (version or "").split(".")[0].strip()
    return int(head) if head.isdigit() else 0


def _server_version(engine: Engine) -> str:
    """取服务端版本（恢复提示用；失败返回空串）.

    Args:
        engine: SQLAlchemy 引擎。

    Returns:
        版本串。

    """
    try:
        with engine.connect() as conn:
            return str(conn.execute(text("SHOW server_version")).scalar() or "")
    except Exception:
        return ""


def _container_backup_path(path: str) -> str:
    """把账本里的备份路径映射成**容器内**路径（恢复命令在 db 容器里执行）.

    账本记录的是执行器视角的绝对路径：容器内是 `/app/backups/migrations/x.dump`，
    本机开发是 `.../backend/backups/migrations/x.dump`。两者在 compose 中挂载到同一
    位置（`./backups:/app/backups`），因此统一按 `MIGRATION_BACKUP_DIR` 反推：
    取文件名拼到容器备份目录下。

    Args:
        path: 账本中的备份路径。

    Returns:
        容器内路径。

    """
    name = path.rsplit("/", 1)[-1]
    container_dir = Path("/app/backups/migrations")
    return str(container_dir / name)


def _db_name(engine: Engine) -> str:
    """当前连接的库名 + 服务端版本（排障用）."""
    try:
        with engine.connect() as conn:
            version = conn.execute(text("SHOW server_version")).scalar()
    except Exception:
        return str(engine.url.database)
    return f"{engine.url.database} (PostgreSQL {version})"


# ---------------------------------------------------------------------------
# argparse
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    """构造 CLI 解析器（8 个命令，参数与 spec §10 一致）."""
    parser = argparse.ArgumentParser(
        prog="python -m migrations.manage",
        description="Profo 迁移版本化管理（status/verify/baseline/up/retry/rebaseline/compensate/restore-hint）",
    )
    parser.add_argument("--debug-log", action="store_true", help="打开 DEBUG 级日志")
    sub = parser.add_subparsers(dest="command", required=True)

    status = sub.add_parser("status", help="查看迁移账本与备份概况")
    status.add_argument("--json", action="store_true", help="输出稳定 JSON 结构")
    status.set_defaults(func=cmd_status)

    verify = sub.add_parser("verify", help="校验注册表/checksum/备份/failed")
    verify.add_argument("--json", action="store_true", help="输出稳定 JSON 结构")
    verify.set_defaults(func=cmd_verify)

    baseline = sub.add_parser("baseline", help="既有库基线登记（幂等重跑 + 逐条记录）")
    baseline.add_argument("--confirm", action="store_true", help="必须显式确认（否则退出码 2）")
    baseline.add_argument("--dry-run", action="store_true", help="只打印计划，不写库不备份")
    baseline.set_defaults(func=cmd_baseline)

    up = sub.add_parser("up", help="手工执行 pending 迁移（持锁，等价启动流程）")
    up.add_argument("--to", type=int, default=None, help="（预留）执行到指定版本")
    up.set_defaults(func=cmd_up)

    retry_cmd = sub.add_parser("retry", help="重跑指定 failed 版本")
    retry_cmd.add_argument("version", help="版本号或迁移名")
    retry_cmd.add_argument("--reason", default=None, help="审计原因")
    retry_cmd.set_defaults(func=cmd_retry)

    rebase = sub.add_parser("rebaseline", help="把当前源码 checksum 写回账本（无行为变化的重构）")
    rebase.add_argument("version", help="版本号或迁移名")
    rebase.add_argument("--reason", required=True, help="审计原因（必填）")
    rebase.set_defaults(func=cmd_rebaseline)

    comp = sub.add_parser("compensate", help="补偿/回滚指定版本")
    comp.add_argument("version", help="版本号或迁移名")
    comp.add_argument("--dry-run", action="store_true", help="只统计不执行 DML")
    comp.add_argument("--yes", action="store_true", help="确认执行（无此参数只做 dry-run 提示）")
    comp.add_argument("--force", action="store_true", help="跳过行数上限与空表守卫")
    comp.add_argument("--reason", default=None, help="审计原因")
    comp.set_defaults(func=cmd_compensate)

    hint = sub.add_parser("restore-hint", help="打印恢复 runbook 片段")
    hint.add_argument("version", help="版本号或迁移名")
    hint.set_defaults(func=cmd_restore_hint)
    return parser


def main(argv: list[str] | None = None) -> int:
    """CLI 入口.

    Args:
        argv: 参数列表（默认取 ``sys.argv[1:]``）。

    Returns:
        退出码。

    """
    parser = build_parser()
    args = parser.parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.debug_log else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    if settings.migration_legacy_mode and args.command in {"baseline", "up"}:
        logger.warning("MIGRATION_LEGACY_MODE=true：baseline/up 将走旧硬编码路径（无版本账本）")
    try:
        return int(args.func(args))
    except _UnknownMigrationError as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return EXIT_PROBLEM


if __name__ == "__main__":
    sys.exit(main())
