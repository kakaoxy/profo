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
import re
import sys
import time
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

    # 与「已发布冻结基线」比对（跨环境真源）：能一次性发现「某个环境账本漂移」。
    # 这是本地 dev 库被单独 rebaseline、而生产没有的典型事故的检测手段。
    from migrations.frozen_checksums import FROZEN_CHECKSUMS, FROZEN_MAX_VERSION

    drifted_vs_frozen = []
    for version in range(1, FROZEN_MAX_VERSION + 1):
        frozen_name, frozen_checksum = FROZEN_CHECKSUMS[version]
        row = state.applied.get(version)
        if row is None:
            continue  # 未应用不算漂移（新环境/新建库）
        if row.checksum != frozen_checksum:
            drifted_vs_frozen.append(
                f"v{version} {frozen_name}：账本={row.checksum[:12]} 已发布基线={frozen_checksum[:12]}"
            )
    problems.extend(f"与环境无关的已发布基线不一致：{item}" for item in drifted_vs_frozen)

    if args.json:
        print(json.dumps({"ok": not problems, "problems": problems}, ensure_ascii=False, indent=2))
    else:
        print(
            f"校验项：注册表 {len(MIGRATIONS)} 项 / 已应用 {len(state.applied)} 项 / "
            f"失败 {len(state.failed)} 项 / 冻结基线 {FROZEN_MAX_VERSION} 项"
        )
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


def cmd_freeze(args: argparse.Namespace) -> int:
    """把某个已发布迁移的**当前源码** checksum 写入冻结基线（需审计原因）.

    仅在「确认是纯重构、无行为变化」且**所有环境**都已同步的基础上使用。
    默认拒绝：必须同时提供 ``--reason`` 与 ``--confirm``，避免把漂移当成重构放行。
    """
    migration = _migration_or_exit(args.version)
    from migrations.checksum import checksum_of
    from migrations.frozen_checksums import FROZEN_CHECKSUMS, FROZEN_MAX_VERSION

    if migration.version > FROZEN_MAX_VERSION:
        print(
            f"[FATAL] v{migration.version} 超出冻结上限 v{FROZEN_MAX_VERSION}："
            "新增迁移不需要冻结（它还没发布），请先部署到生产再冻结",
            file=sys.stderr,
        )
        return EXIT_REFUSED
    frozen_name, frozen_checksum = FROZEN_CHECKSUMS[migration.version]
    actual = checksum_of(migration.fn)
    if actual == frozen_checksum:
        print(f"v{migration.version} {frozen_name} 与基线一致，无需更新")
        return EXIT_OK
    if not (args.reason or "").strip():
        print("[FATAL] 更新冻结基线必须提供 --reason（审计要求）", file=sys.stderr)
        return EXIT_REFUSED
    if not args.confirm:
        print(
            "更新冻结基线需要显式确认：\n"
            f"  v{migration.version} {frozen_name}\n"
            f"  基线: {frozen_checksum}\n"
            f"  源码: {actual}\n"
            "  ⚠️ 这会放行对已发布迁移的修改，仅在确认「无行为变化且所有环境同步」时使用。\n"
            f"  python -m migrations.manage freeze {migration.version} "
            '--reason "..." --confirm',
            file=sys.stderr,
        )
        return EXIT_REFUSED

    manifest = Path(__file__).with_name("frozen_checksums.py")
    text_src = manifest.read_text(encoding="utf-8")

    # 定位 + 解析后校验（2026-10-24 加固）：
    # 不再依赖「单行格式恰好如此」的隐式假设——实测 ``ruff format`` 会把超长条目
    # **折成多行**（本基线 94 条中有 8 条是折行形态），旧实现若只认单行会静默漏检。
    # 因此用「版本号锚点 + 紧随的 name/checksum」跨行匹配，两种形态都能处理：
    #   - 单行：  17: ("name", "<64 hex>"),
    #   - 折行：  17: (\n  "name",\n  "<64 hex>",\n),
    # 要求**恰好命中 1 处**；改完再整体解析前后对照，确认真只有目标版本变化才落盘。
    version = migration.version
    pattern = re.compile(
        rf"^(?P<indent>[ \t]*){version}:[ \t]*\([ \t]*\n?[ \t]*"
        r'(?P<q1>["\'])(?P<name>[^"\']+)(?P=q1)[ \t]*,[ \t]*\n?[ \t]*'
        r'(?P<q2>["\'])(?P<sum>[0-9a-f]{64})(?P=q2)[ \t]*,?[ \t]*\n?[ \t]*\)[ \t]*,',
        re.MULTILINE,
    )
    matches = list(pattern.finditer(text_src))
    if len(matches) != 1:
        print(
            f"[FATAL] 冻结基线中 v{version} 的条目命中 {len(matches)} 处（应为 1）。"
            "文件格式可能已变化，请手工核对后重试",
            file=sys.stderr,
        )
        return EXIT_PROBLEM
    hit = matches[0]
    if hit.group("name") != frozen_name or hit.group("sum") != frozen_checksum:
        print(
            f"[FATAL] v{version} 条目内容与预期不符："
            f"文件内={hit.group('name')}/{hit.group('sum')[:12]}，"
            f"预期={frozen_name}/{frozen_checksum[:12]}",
            file=sys.stderr,
        )
        return EXIT_PROBLEM

    # 统一改写为单行形态（ruff format 之后若仍超长会再次折行，不影响解析）
    new_line = f'{hit.group("indent")}{version}: ("{frozen_name}", "{actual}"),'
    updated = text_src[: hit.start()] + new_line + text_src[hit.end() :]

    # 解析级校验：改写前后各版本条目，应当只有目标版本发生变化。
    before_map = _parse_frozen_entries(text_src)
    after_map = _parse_frozen_entries(updated)
    changed = {v for v in set(before_map) | set(after_map) if before_map.get(v) != after_map.get(v)}
    if changed != {version}:
        print(
            f"[FATAL] 改写结果异常：受影响版本={sorted(changed)}（应仅 {version}），已放弃写入",
            file=sys.stderr,
        )
        return EXIT_PROBLEM

    manifest.write_text(updated, encoding="utf-8")
    print(f"v{version} {frozen_name} 冻结基线已更新：{frozen_checksum[:12]} → {actual[:12]}")
    print(f"  原因：{args.reason}")
    print("  ⚠️ 请确认所有环境（本地/测试/生产）账本已 rebaseline 后再提交本文件")
    return EXIT_OK


def _parse_frozen_entries(source: str) -> dict[int, tuple[str, str]]:
    """解析冻结基线源码里的 ``version: (name, checksum)`` 条目（用于改写后校验）.

    同时支持单行与 ``ruff format`` 折行两种形态（实测本基线有 8 条折行）。

    Args:
        source: ``frozen_checksums.py`` 的源码文本。

    Returns:
        ``{version: (name, checksum)}``。

    """
    entries: dict[int, tuple[str, str]] = {}
    for m in re.finditer(
        r"^[ \t]*(\d+):[ \t]*\([ \t]*\n?[ \t]*"
        r"([\"'])([^\"']+)\2[ \t]*,[ \t]*\n?[ \t]*"
        r"([\"'])([0-9a-f]{64})\4[ \t]*,?[ \t]*\n?[ \t]*\)",
        source,
        re.MULTILINE,
    ):
        entries[int(m.group(1))] = (m.group(3), m.group(5))
    return entries


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
        # 下方命令需要具体文件路径；此处必须退出，否则 backup 为 None 会在
        # startswith() 处抛 AttributeError（运维拿不到任何指引）。
        print_recent_backups()
        print_last_full_backup_restore(version, migration)
        print(f"\n# 数据库：{url_db}")
        return

    backup_client = row.backup_client if row and row.backup_client else ""
    server = _server_version(engine)
    is_placeholder = backup.startswith("/app/backups/migrations/<")
    dump_arg = backup if is_placeholder else _container_backup_path(backup)

    print()
    print("# ⚠️ 归档格式与客户端版本强绑定（实测 2026-10-20）：")
    print("#    pg_dump ≥17 产出的归档是 1.16 版，PG16 自带的 pg_restore 连读都读不了：")
    print("#      pg_restore: error: unsupported version (1.16) in file header")
    print("#    且 client ≥17 产出的 SQL 带 `SET transaction_timeout`（PG17 新增 GUC），")
    print("#    PG16 执行时报 unrecognized configuration parameter。")
    print("#    ⇒ 恢复必须用**产生该备份的同一大版本客户端**，且目标 server ≥ 该版本。")
    cross_major = bool(backup_client) and _major_of(backup_client) > _major_of(server)
    if backup_client:
        print(f"#    本备份由 pg_dump {backup_client} 产出；当前 server 为 {server or '未知'}。")
        if cross_major:
            print_cross_major_restore(_major_of(backup_client), _major_of(server), dump_arg)

    print()
    print("# 1) 恢复到**临时库**（不覆盖生产，便于比对；D-01 口径）")
    print("#    以下是**本机实测可跑通**的两段式配方（2026-10-19，client 18.6 / server 16.15）：")
    if cross_major:
        print("#    ⚠️ 跨大版本时本配方的 pg_restore **退出码=1**（SET transaction_timeout 被 PG16 拒绝，")
        print("#       但数据已灌入）——必须按第 2 步行数核对判定成败，不能只看退出码；")
        print("#       要拿到 exit=0 的确定性配方，改用上方「可靠路径 1」的 SQL 转换法。")
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


def print_cross_major_restore(client_major: int, server_major: int, dump_arg: str) -> None:
    """打印「备份客户端大版本 > 目标 server 大版本」时的可执行恢复路径.

    为什么单列一个函数：跨大版本不是「跑一下 pg_restore 就行」，而是**退出码不可信**。
    本机实测（2026-10-20，client 18.6 归档 1.16 / server 16.15）：

    - 目标 server 同版本的 ``pg_restore`` **直接拒绝**归档：
      ``pg_restore: error: unsupported version (1.16) in file header``（连 TOC 都不读）；
    - 换用高版本 ``pg_restore``（能读 1.16）恢复时，它会在开头执行
      ``SET transaction_timeout = 0``（PG17 新增 GUC），PG16 报
      ``unrecognized configuration parameter``，而 ``pg_restore`` 默认「继续并忽略错误」
      → 数据实际已灌入，**退出码却是 1**。任何 ``set -e`` / ``&&`` 链条会误判为失败。

    因此这里只给**退出码可信**的两条路径：SQL 转换法（推荐，实测 exit=0）与部署全库备份回放。

    Args:
        client_major: 备份产出端的 pg_dump 主版本。
        server_major: 目标 server 主版本。
        dump_arg: 容器内的备份文件路径。

    """
    print(
        f"#    ⚠️ 客户端大版本({client_major}) > server 大版本({server_major})："
        f"**PG{server_major} 自带的 pg_restore 无法直接恢复该备份**（归档格式高于其可读上限）。",
    )
    print("#")
    print("#    可靠路径 1（推荐，实测 exit=0）：两端都转 plain SQL 并剔除高版本 GUC，再 psql 回放")
    print("#      为什么必须自包含：data-only 归档里没有建表语句，临时库必须先建 schema（原先缺这一步，实测 exit=3）。")
    print("#      为什么不能只看 pg_restore 退出码：它默认「出错继续」，会给出 exit=1 的假失败。")
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend sh -c \\')
    print('  "psql --host db --username \\"$POSTGRES_USER\\" -d postgres \\')
    print('     -c \\"DROP DATABASE IF EXISTS restore_check;\\" \\')
    print('     -c \\"CREATE DATABASE restore_check OWNER \\\\"$POSTGRES_USER\\\\";\\""')
    print("#    a) 建 schema（用同一客户端的 plain 输出，避免归档格式问题）")
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend sh -c \\')
    print('  "pg_dump --schema-only --no-owner --host db --username \\"$POSTGRES_USER\\" \\')
    print('     --dbname \\"$POSTGRES_DB\\" --file /tmp/schema.sql \\')
    print("   && grep -v '^SET transaction_timeout' /tmp/schema.sql > /tmp/schema.clean.sql \\")
    print('   && psql --host db --username \\"$POSTGRES_USER\\" -d restore_check \\')
    print('        -v ON_ERROR_STOP=1 -q -f /tmp/schema.clean.sql"')
    print("#    b) 灌本次备份的数据部分")
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend sh -c \\')
    print(f'  "pg_restore --no-owner --no-privileges -f /tmp/data.sql {dump_arg} \\')
    print("   && grep -v '^SET transaction_timeout' /tmp/data.sql > /tmp/data.clean.sql \\")
    print('   && psql --host db --username \\"$POSTGRES_USER\\" -d restore_check \\')
    print('        -v ON_ERROR_STOP=1 -q -f /tmp/data.clean.sql"')
    print("#    注：后端镜像的 postgresql-client 为 17.x（D-03），其 pg_restore 能读 1.16 归档；")
    print(f"#        但目标 server 是 {server_major}，故必须经上面的 SQL 转换，不能直接 pg_restore。")
    print("#")
    print("#    可靠路径 2（数据应急）：回放部署脚本的全库备份 backup_*.sql.gz")
    print("#      —— 它由 deploy-server.sh 在 db 容器内用**与 server 同版本**的 pg_dump 产出，")
    print("#         无归档格式问题，实测其内容不含 transaction_timeout；用 psql -v ON_ERROR_STOP=1 回放。")
    print("#         宿主备份已收紧为 root-only（600），需以 root 读取或先 scp 到临时位置。")
    print("#")
    print("#    ⚠️ 不要直接 backend pg_restore 本备份：实测 exit=1（数据已灌入，退出码却是失败）。")
    print("#    —— 本迭代不提供自动化「跨大版本恢复」脚本（spec §18.2 边界）。")


def print_recent_backups(limit: int = 5) -> None:
    """列出备份目录中最近的若干份备份（账本无该版本备份时的替代依据）.

    目录不可读时给出可复制的排查命令，不抛异常（本函数是错误路径上的指引输出）。

    Args:
        limit: 最多列出份数。

    """
    directory = Path(settings.migration_backup_dir)
    print(f"# 最近备份（{directory}）：")
    try:
        files = sorted(
            (p for p in directory.iterdir() if p.is_file() and p.suffix == ".dump"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )[:limit]
    except OSError as exc:
        print(f"#   ⚠️ 备份目录不可读（{exc}）；请在宿主执行：ls -lt /app/backups/migrations | head")
        return
    if not files:
        print("#   ⚠️ 目录下没有任何 .dump 备份；改用部署脚本的全库备份（见下方 3)）")
        return
    for item in files:
        stamp = time.strftime("%Y-%m-%d %H:%M", time.localtime(item.stat().st_mtime))
        print(f"#   {stamp}  {item.name}")


def print_last_full_backup_restore(version: int, migration: Migration) -> None:
    """打印「用最近一次全库备份整库回放」的具体命令（账本无该版本备份时的兜底路径）.

    不猜测备份文件名与客户端版本：先要求操作者确认文件，再给同一容器内的回放命令。

    Args:
        version: 迁移版本号。
        migration: 注册表登记项（用于列出涉及的表）。

    """
    print()
    print("# 兜底路径：整库回放到**临时库**（不覆盖生产），与生产比对后手工合并")
    print("#   1) 选定一份备份文件（上一段列表中的最新全库备份），并确认其 pg_dump 大版本：")
    print("#        docker compose exec backend sh -c 'pg_restore --version'")
    print("#   2) 起临时库并回放（<备份文件> 换成上一步选定的文件名，只替换这一处）：")
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend psql \\')
    print('  -h db -U "$POSTGRES_USER" -d postgres \\')
    print('  -c "DROP DATABASE IF EXISTS restore_check;" \\')
    print('  -c "CREATE DATABASE restore_check OWNER \\"$POSTGRES_USER\\";"')
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend pg_restore \\')
    print('  -h db -U "$POSTGRES_USER" -d restore_check --no-owner --no-privileges \\')
    print("  /app/backups/migrations/<备份文件>")
    print("#   3) 核对涉及表的行数（期望与生产一致）：")
    for table in migration.backup_tables or ("<涉及的表>",):
        print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend psql \\')
        print(f'  -h db -U "$POSTGRES_USER" -d restore_check -tAc "SELECT count(*) FROM {table}"')
        print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend psql \\')
        print(f'  -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM {table}"')
    print("#   4) 回放完成后删除临时库，按差异手工合并（本期不提供自动合并脚本，spec §18.2 边界）：")
    print('docker compose exec -T -e PGPASSWORD="$POSTGRES_PASSWORD" backend psql \\')
    print('  -h db -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS restore_check;"')
    print("#   5) 核对版本账本与整体状态：")
    print("docker compose exec backend .venv/bin/python -m migrations.manage status --json")
    print("docker compose exec backend .venv/bin/python -m migrations.manage verify")
    print(f"#   6) 该版本（v{version} {migration.name}）若需重新执行：")
    print(
        f"docker compose exec backend .venv/bin/python -m migrations.manage retry {version} "
        f'--reason "账本无备份，按全库备份恢复"',
    )


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

    freeze = sub.add_parser(
        "freeze",
        help="更新已发布迁移的冻结基线（仅在确认无行为变化且全环境同步时使用）",
    )
    freeze.add_argument("version", help="版本号或迁移名")
    freeze.add_argument("--reason", required=True, help="审计原因（必填）")
    freeze.add_argument("--confirm", action="store_true", help="显式确认（否则只打印提示）")
    freeze.set_defaults(func=cmd_freeze)

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
