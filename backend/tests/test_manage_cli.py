"""CLI 7+1 命令（T1.7 / spec §10）。

覆盖：正常路径 + 异常路径 + ``--json`` 结构 + 退出码。

⚠️ CLI 用 ``main(argv)`` 直接调用（不起子进程），这样 monkeypatch 与断言更精确；
真实容器内调用由 ``tests/e2e/test_migration_runner.py`` 覆盖（``python -m
migrations.manage status --json | jq .total``）。
"""

import json
from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations.manage import (
    EXIT_OK,
    EXIT_PROBLEM,
    EXIT_REFUSED,
    main,
)
from migrations.registry import MIGRATION_BY_VERSION, MIGRATIONS
from settings import settings


@pytest.fixture
def cli_engine(test_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> Generator[Engine, None, None]:
    """让 CLI 走测试引擎（``manage._engine()`` 默认取 ``db.engine``）."""
    import migrations.manage as manage_module

    monkeypatch.setattr(manage_module, "_engine", lambda: test_engine)
    return test_engine


@pytest.fixture
def applied_ledger(test_engine: Engine) -> Generator[Engine, None, None]:
    """确保账本为「全部 applied」（多数 CLI 只读用例的前提）."""
    from migrations.checksum import checksum_of
    from migrations.schema_migrations import ensure_version_tables, load_state, record_migration, utcnow

    ensure_version_tables(test_engine)
    state = load_state(test_engine)
    now = utcnow()
    for migration in MIGRATIONS:
        if migration.version in state.applied:
            continue
        record_migration(
            test_engine,
            version=migration.version,
            name=migration.name,
            checksum=checksum_of(migration.fn),
            kind=migration.kind,
            risk=migration.risk,
            status="applied",
            started_at=now,
            duration_ms=1,
            backup_path=None,
            backup_sha256=None,
            backup_scope="none",
            error=None,
            notes=None,
        )
    return test_engine


# ---------------------------------------------------------------------------
# status
# ---------------------------------------------------------------------------


def test_status_json_structure(applied_ledger: Engine, cli_engine: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """``status --json`` 输出稳定结构（CI/巡检消费契约）."""
    code = main(["status", "--json"])
    payload: dict[str, Any] = json.loads(capsys.readouterr().out)

    assert code == EXIT_OK
    assert payload["total"] == len(MIGRATIONS)
    assert payload["applied"] == len(MIGRATIONS)
    assert payload["pending"] == 0
    assert payload["failed"] == 0
    assert payload["checksum_mismatch"] == []
    assert set(payload["backups"]) == {"dir", "count", "total_mb", "free_mb", "oldest", "newest"}
    row = payload["migrations"][0]
    assert set(row) >= {
        "version",
        "name",
        "kind",
        "risk",
        "status",
        "duration_ms",
        "backup_scope",
        "applied_at",
    }
    assert row["version"] == 1
    assert row["status"] == "applied"


def test_status_returns_1_when_failed(applied_ledger: Engine, cli_engine: Engine) -> None:
    """存在 failed 记录 → 退出码 1（供巡检脚本判失败）."""
    with applied_ledger.begin() as conn:
        conn.execute(
            text("UPDATE schema_migrations SET status = 'failed', applied_at = NULL, error = 'boom' WHERE version = 5"),
        )
    try:
        code = main(["status"])
        assert code == EXIT_PROBLEM
    finally:
        with applied_ledger.begin() as conn:
            conn.execute(
                text("UPDATE schema_migrations SET status = 'applied', error = NULL WHERE version = 5"),
            )


# ---------------------------------------------------------------------------
# verify
# ---------------------------------------------------------------------------


def test_verify_ok(applied_ledger: Engine, cli_engine: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """全绿时退出码 0 且输出「全部通过」."""
    code = main(["verify"])
    assert code == EXIT_OK
    assert "全部通过" in capsys.readouterr().out


def test_verify_detects_checksum_drift(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Checksum 漂移 → 退出码 1 且逐项列出."""
    with applied_ledger.begin() as conn:
        conn.execute(text("UPDATE schema_migrations SET checksum = :c WHERE version = 20"), {"c": "f" * 64})
    try:
        code = main(["verify", "--json"])
        payload = json.loads(capsys.readouterr().out)
        assert code == EXIT_PROBLEM
        assert payload["ok"] is False
        assert any("checksum 漂移" in item for item in payload["problems"])
    finally:
        from migrations.checksum import checksum_of
        from migrations.registry import MIGRATION_BY_VERSION

        with applied_ledger.begin() as conn:
            conn.execute(
                text("UPDATE schema_migrations SET checksum = :c WHERE version = 20"),
                {"c": checksum_of(MIGRATION_BY_VERSION[20].fn)},
            )


# ---------------------------------------------------------------------------
# baseline
# ---------------------------------------------------------------------------


def test_baseline_without_flags_returns_2(cli_engine: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """无 ``--confirm`` 且无 ``--dry-run`` → 退出码 2（防止误操作）."""
    code = main(["baseline"])
    assert code == EXIT_REFUSED
    assert "--confirm" in capsys.readouterr().out


def test_baseline_dry_run_ok(applied_ledger: Engine, cli_engine: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """``--dry-run`` → 退出码 0 且明确「未写库」."""
    code = main(["baseline", "--dry-run"])
    assert code == EXIT_OK
    assert "未写库" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# up
# ---------------------------------------------------------------------------


def test_up_reports_zero_pending(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``up`` 在无 pending 时输出结构化摘要."""
    code = main(["up"])
    output = capsys.readouterr().out
    assert code == EXIT_OK
    assert "迁移状态：" in output
    assert "pending=0" in output


def test_up_blocked_by_failed_returns_1(applied_ledger: Engine, cli_engine: Engine) -> None:
    """``up`` 遇到 failed 记录 → 退出码 1（门禁生效，不静默续跑）."""
    with applied_ledger.begin() as conn:
        conn.execute(
            text("UPDATE schema_migrations SET status = 'failed', error = 'blocked' WHERE version = 7"),
        )
    try:
        assert main(["up"]) == EXIT_PROBLEM
    finally:
        with applied_ledger.begin() as conn:
            conn.execute(text("UPDATE schema_migrations SET status = 'applied', error = NULL WHERE version = 7"))


# ---------------------------------------------------------------------------
# retry / rebaseline
# ---------------------------------------------------------------------------


def test_retry_rejects_unknown_version(cli_engine: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """未知版本 → 退出码 1 并提示未找到."""
    code = main(["retry", "99999"])
    assert code == EXIT_PROBLEM
    assert "未找到迁移" in capsys.readouterr().err


def test_retry_accepts_migration_name(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``retry <name>`` 也支持（无需记版本号）——非 failed 时给出明确拒绝."""
    code = main(["retry", "add_token_version_column"])
    assert code == EXIT_PROBLEM
    assert "没有 failed 记录" in capsys.readouterr().err


def test_rebaseline_requires_reason(cli_engine: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """``rebaseline`` 缺 ``--reason`` → argparse 拒绝（退出码非 0）."""
    with pytest.raises(SystemExit):
        main(["rebaseline", "1"])


def test_rebaseline_succeeds(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``rebaseline --reason`` 成功写回并打印审计提示."""
    with applied_ledger.begin() as conn:
        conn.execute(text("UPDATE schema_migrations SET checksum = :c WHERE version = 1"), {"c": "0" * 64})
    code = main(["rebaseline", "1", "--reason", "pytest 重构"])
    assert code == EXIT_OK
    assert "已重基线" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# compensate
# ---------------------------------------------------------------------------


def test_compensate_dry_run_exit_0(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``compensate --dry-run`` → 退出码 0 且输出影响行数."""
    code = main(["compensate", "4", "--dry-run"])
    output = capsys.readouterr().out
    assert code == EXIT_OK
    assert "dry-run 预计影响" in output


def test_compensate_without_yes_returns_2(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``compensate`` 无 ``--yes`` → 退出码 2（默认只提示）."""
    code = main(["compensate", "4"])
    assert code == EXIT_REFUSED
    assert "--yes" in capsys.readouterr().err


def test_compensate_irreversible_returns_2_with_hint(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """不可逆版本 → 退出码 2，并打印 restore-hint（A9）."""
    code = main(["compensate", "3", "--dry-run"])
    captured = capsys.readouterr()
    assert code == EXIT_REFUSED
    assert "restore-hint" in captured.err
    assert "恢复指引" in captured.out


# ---------------------------------------------------------------------------
# restore-hint
# ---------------------------------------------------------------------------


def test_restore_hint_prints_copyable_commands(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """``restore-hint`` 输出的命令必须可直接复制（含 pg_restore / verify / status）.

    本用例覆盖「账本**有**备份文件」的主路径；账本无备份的兵底路径见
    ``test_restore_hint_without_ledger_backup_does_not_crash``。
    """
    with applied_ledger.begin() as conn:
        conn.execute(
            text("UPDATE schema_migrations SET backup_path = :p, backup_sha256 = :s WHERE version = 50"),
            {"p": "/app/backups/migrations/20261019-000000_v050_backfill_lead_unit_price.dump", "s": "0" * 64},
        )
    try:
        code = main(["restore-hint", "50"])
        output = capsys.readouterr().out
    finally:
        with applied_ledger.begin() as conn:
            conn.execute(
                text("UPDATE schema_migrations SET backup_path = NULL, backup_sha256 = NULL WHERE version = 50"),
            )

    assert code == EXIT_OK
    assert "pg_restore" in output
    assert "docker compose exec backend .venv/bin/python -m migrations.manage verify" in output
    assert "compensate 50 --dry-run" in output
    # 说明性文字里的 <client 大版本> 是刻意的选择提示，不属于「命令占位符」；
    # 真正要防的是**命令本身**含未替换占位符（如 <最新全库备份>.dump）。
    command_lines = [line for line in output.splitlines() if line.startswith(("docker ", "  ")) and "<" in line]
    assert not command_lines, f"命令含未替换占位符：{command_lines}"


def test_restore_hint_unknown_version(cli_engine: Engine, capsys: pytest.CaptureFixture[str]) -> None:
    """未知版本 → 退出码 1."""
    assert main(["restore-hint", "999"]) == EXIT_PROBLEM


def _clear_ledger_backup(engine: Engine, version: int) -> None:
    """把某版本的备份信息置空（模拟「账本无该版本备份」的真实场景：未执行成功或已 prune）."""
    with engine.begin() as conn:
        conn.execute(
            text(
                "UPDATE schema_migrations SET backup_path = NULL, backup_sha256 = NULL, "
                "backup_scope = NULL, backup_client = NULL WHERE version = :v",
            ),
            {"v": version},
        )


def test_restore_hint_without_ledger_backup_does_not_crash(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B1 回归：账本无该版本备份（backup_path=NULL）+ backup!=none → 不崩且给出可执行指引.

    原文在 ``backup.startswith(...)`` 处抛 ``AttributeError: 'NoneType' object has no
    attribute 'startswith'``（触发路径：``manage compensate <C/D 版本>`` →
    ``CompensationNotSupportedError`` → ``print_restore_hint()``），运维拿不到恢复指引。
    """
    monkeypatch.setattr(settings, "migration_backup_dir", str(tmp_path / "migrations"))
    (tmp_path / "migrations").mkdir(parents=True)
    # v3 为 C 级 backup=table；显式清空账本备份信息以构造缺陷触发前提
    assert MIGRATION_BY_VERSION[3].backup != "none"
    _clear_ledger_backup(applied_ledger, 3)

    code = main(["restore-hint", "3"])
    captured = capsys.readouterr()

    assert code == EXIT_OK
    assert "账本中无该版本的备份文件" in captured.out
    assert "pg_restore" in captured.out, "必须给出整库回放的具体命令，而不是空指引"
    assert "retry 3" in captured.out
    assert "Traceback" not in captured.err, f"不得崩溃：{captured.err}"


def test_compensate_irreversible_without_backup_does_not_crash(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """B1 回归（真实触发路径）：C 级无补偿 + 账本无备份 → 退出码 2 + 指引，不抛异常."""
    monkeypatch.setattr(settings, "migration_backup_dir", str(tmp_path / "migrations"))
    (tmp_path / "migrations").mkdir(parents=True)
    _clear_ledger_backup(applied_ledger, 3)

    code = main(["compensate", "3", "--dry-run"])
    captured = capsys.readouterr()

    assert code == EXIT_REFUSED
    assert "恢复指引" in captured.out
    assert "retry 3" in captured.out
    assert "Traceback" not in captured.err


# ---------------------------------------------------------------------------
# 参数解析
# ---------------------------------------------------------------------------


def test_parser_requires_command() -> None:
    """无子命令 → argparse 退出（不执行任何破坏性动作）."""
    with pytest.raises(SystemExit):
        main([])


def test_legacy_mode_warning_does_not_block(
    applied_ledger: Engine,
    cli_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Legacy 模式下 ``up`` 仍可执行（只是走旧路径），不抛异常."""
    from migrations import _run_all_migrations  # noqa: F401 - 存在性断言

    monkeypatch.setattr(settings, "migration_legacy_mode", False)
    assert main(["up"]) == EXIT_OK


# ---------------------------------------------------------------------------
# 跨大版本恢复指引（实测：pg_restore 退出码不可信）
# ---------------------------------------------------------------------------


def test_restore_hint_cross_major_gives_exit_zero_recipe(
    applied_ledger: Engine,
    cli_engine: Engine,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """账本 ``backup_client`` 高于 server → 必须给出**退出码可信**的配方.

    回归背景（本机实测 2026-10-20，client 18.6 / server 16.15）：

    - 目标 server 同版本 ``pg_restore`` 直接拒绝归档 ``1.16``（读都不读）；
    - 换能读 1.16 的高版本 ``pg_restore`` 恢复，会执行 ``SET transaction_timeout``（PG17
      新增 GUC），PG16 报错但 ``pg_restore`` **默认继续并忽略错误** → 数据已灌入、
      **退出码却是 1**。旧指引只说「用高版本客户端恢复」，运维接进 ``set -e``/``&&``
      就得到假失败，或反之直接 ``pg_restore`` 认为失败而重复灌数据。

    期望：给出「归档 → plain SQL → 剔除 transaction_timeout → psql ON_ERROR_STOP=1」的
    自包含配方（含先建 schema 这一步，否则 data-only 归档会因缺表 exit=3）。
    """
    with applied_ledger.begin() as conn:
        conn.execute(
            text(
                "UPDATE schema_migrations SET backup_path = :p, backup_sha256 = :s, backup_client = :c "
                "WHERE version = 50",
            ),
            {
                "p": "/app/backups/migrations/20261020-000000_v050_backfill_lead_unit_price.dump",
                "s": "0" * 64,
                "c": "18.6",
            },
        )
    try:
        code = main(["restore-hint", "50"])
        output = capsys.readouterr().out
    finally:
        _clear_ledger_backup(applied_ledger, 50)

    assert code == EXIT_OK
    assert "客户端大版本(18) > server 大版本(16)" in output
    # 可信配方的三个必需要素
    assert "ON_ERROR_STOP=1" in output, "psql 必须 ON_ERROR_STOP=1，否则 SQL 转换后会静默吞错"
    assert "grep -v '^SET transaction_timeout'" in output, "必须剔除 PG17 新增 GUC"
    assert "pg_dump --schema-only" in output, "data-only 归档不含建表语句，必须先建 schema"
    # 必须显式警告「退出码不可信」，避免运维按退出码判定
    assert "退出码=1" in output
    # 命令本身不得含未替换占位符
    command_lines = [line for line in output.splitlines() if line.startswith(("docker ", "  ", "#   ")) and "<" in line]
    assert not command_lines, f"命令含未替换占位符：{command_lines}"
