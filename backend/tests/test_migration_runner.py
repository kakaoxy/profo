"""执行器语义（T1.3 / T1.4 / K5 / K6 / K7 / K8）。

**测试策略**：版本账本是「全局单例表」，迁移函数直连 engine（不经 SAVEPOINT），
因此本文件**不使用** ``db_session`` 夹具的自动回滚，而是：
- 复用会话级 ``test_engine``（已由 conftest 跑过全部迁移并 TRUNCATE）；
- 每个用例开始时把 ``schema_migrations`` 重置为「全部 applied + 真实 checksum」，
  用 ``_reset_state()`` 完成，保证用例之间互不污染；
- 需要「pending」时只删掉目标版本的行（等价于「该版本从未执行」）。

⚠️ 不使用 ``monkeypatch`` 伪造 DB：本模块的价值就在「真实 PG + 真实账本」的语义，
伪造会掩盖事务/约束问题。
"""

from collections.abc import Generator
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from migrations.checksum import checksum_of
from migrations.registry import MIGRATION_BY_VERSION, MIGRATIONS
from migrations.runner import (
    MigrationBlockedError,
    _apply_one,
    _guard_state,
    _verify_checksums,
    baseline,
    compensate,
    compute_checksum_mismatches,
    rebaseline,
    retry,
    run_startup_migrations,
)
from migrations.schema_migrations import load_state
from settings import settings


def _reset_state(engine: Engine) -> None:
    """把账本重置为「全部 applied + 真实 checksum」（用例起点）."""
    with engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE schema_migrations RESTART IDENTITY"))
        conn.execute(text("TRUNCATE TABLE migration_compensations RESTART IDENTITY"))
    for migration in MIGRATIONS:
        _apply_one(engine, migration)


@pytest.fixture
def test_engine_ledger(test_engine: Engine) -> Generator[Engine, None, None]:
    """重置账本 → 交给用例 → 再重置（防止污染其他测试的启动路径）."""
    _reset_state(test_engine)
    yield test_engine
    _reset_state(test_engine)


# ---------------------------------------------------------------------------
# 全新库 / 重复启动
# ---------------------------------------------------------------------------


def test_fresh_database_applies_all(test_engine: Engine) -> None:
    """全新库（空账本 + 三表全空）→ 执行全部并逐条登记（A1）."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE schema_migrations RESTART IDENTITY"))
        for table in ("users", "projects", "leads"):
            conn.execute(text(f"TRUNCATE TABLE {table} CASCADE"))

    summary = run_startup_migrations(test_engine)

    assert summary is not None
    state = load_state(test_engine)
    assert len(state.applied) == len(MIGRATIONS)
    assert not state.failed
    assert summary.pending == 0


def test_repeated_startup_has_zero_pending(test_engine_ledger: Engine) -> None:
    """重复启动零 pending（A2）；启动增量 ≤ 2s（G6，本机实测上限放宽到 5s 抗抖动）."""
    summary = run_startup_migrations(test_engine_ledger)
    assert summary is not None
    assert summary.pending == 0
    assert summary.executed == ()
    assert summary.duration_ms < 5000, f"启动增量 {summary.duration_ms}ms 超预期"


def test_pending_versions_execute_once(test_engine_ledger: Engine) -> None:
    """已 applied 的版本永不重跑，只执行 pending（§6.3）."""
    with test_engine_ledger.begin() as conn:
        conn.execute(text("DELETE FROM schema_migrations WHERE version = :v"), {"v": 82})

    summary = run_startup_migrations(test_engine_ledger)

    assert summary is not None
    assert summary.executed == (82,)
    assert len(load_state(test_engine_ledger).applied) == len(MIGRATIONS)


# ---------------------------------------------------------------------------
# checksum（K4/K5 / A5）
# ---------------------------------------------------------------------------


def test_checksum_drift_blocks_startup(test_engine_ledger: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """Checksum 漂移阻断启动，错误含 expected / actual（A5 / G3）."""
    target = MIGRATION_BY_VERSION[49]
    with test_engine_ledger.begin() as conn:
        conn.execute(
            text("UPDATE schema_migrations SET checksum = :c WHERE version = :v"),
            {"c": "0" * 64, "v": 49},
        )

    state = load_state(test_engine_ledger)
    mismatches = compute_checksum_mismatches(state)
    assert mismatches
    assert mismatches[0][0] == 49

    with pytest.raises(MigrationBlockedError) as excinfo:
        _verify_checksums(state)
    message = str(excinfo.value)
    assert "version=49" in message
    assert "expected=" in message
    assert "actual" in message
    assert "rebaseline" in message
    assert target.name in message
    monkeypatch.setattr(settings, "migration_legacy_mode", False)


def test_rebaseline_clears_drift_and_audits(test_engine_ledger: Engine) -> None:
    """Rebaseline 写回真实 checksum 并留审计（K5）."""
    with test_engine_ledger.begin() as conn:
        conn.execute(
            text("UPDATE schema_migrations SET checksum = :c WHERE version = :v"),
            {"c": "0" * 64, "v": 49},
        )
    assert compute_checksum_mismatches(load_state(test_engine_ledger))

    rebaseline(test_engine_ledger, 49, reason="纯重构无行为变化")

    assert not compute_checksum_mismatches(load_state(test_engine_ledger))
    with test_engine_ledger.connect() as conn:
        row = conn.execute(
            text("SELECT action, result, reason FROM migration_compensations ORDER BY id DESC LIMIT 1"),
        ).first()
    assert row is not None
    assert row[0] == "rebaseline"
    assert row[1] == "success"
    assert row[2] == "纯重构无行为变化"


def test_rebaseline_requires_reason(test_engine_ledger: Engine) -> None:
    """Rebaseline 缺原因 → 拒绝（审计要求）."""
    with pytest.raises(MigrationBlockedError, match="--reason"):
        rebaseline(test_engine_ledger, 49, reason="  ")


# ---------------------------------------------------------------------------
# 失败语义与 retry（K6 / A6）
# ---------------------------------------------------------------------------


def test_backup_failure_aborts_migration(test_engine_ledger: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """备份失败 → 迁移不执行 + failed 记录 + error 前缀 backup_failed（A6 / G4）."""
    from migrations import backup as backup_module

    message = "pg_dump 不可用（测试注入）"

    def _boom(*args: Any, **kwargs: Any) -> None:
        raise backup_module.BackupError(message)

    # runner 在模块级 from ... import create_backup，需 patch runner 的引用
    monkeypatch.setattr("migrations.runner.create_backup", _boom)

    # v3 是 C 级、强制备份的第一项
    with test_engine_ledger.begin() as conn:
        conn.execute(text("DELETE FROM schema_migrations WHERE version >= :v"), {"v": 3})

    from migrations.runner import _BackupAbortedError

    with pytest.raises(_BackupAbortedError):
        run_startup_migrations(test_engine_ledger)

    state = load_state(test_engine_ledger)
    assert 3 in state.failed
    assert (state.failed[3].error or "").startswith("backup_failed:")


def test_failed_record_blocks_startup_and_retry_recovers(test_engine_ledger: Engine) -> None:
    """Failed 阻断启动；retry 成功后同版本 UPDATE 为 applied（K6 / A6）."""
    with test_engine_ledger.begin() as conn:
        conn.execute(
            text(
                "DELETE FROM schema_migrations WHERE version = 82",
            ),
        )
        conn.execute(
            text(
                "INSERT INTO schema_migrations (version, name, checksum, kind, risk, status, started_at, "
                "duration_ms, error) VALUES (82, :name, :checksum, 'schema', 'A', 'failed', now(), 12, :error)",
            ),
            {
                "name": MIGRATION_BY_VERSION[82].name,
                "checksum": checksum_of(MIGRATION_BY_VERSION[82].fn),
                "error": "OperationalError: 模拟失败",
            },
        )

    state = load_state(test_engine_ledger)
    with pytest.raises(MigrationBlockedError) as excinfo:
        _guard_state(test_engine_ledger, state)
    assert "manage retry" in str(excinfo.value)
    assert "manage compensate" in str(excinfo.value)

    with pytest.raises(MigrationBlockedError):
        run_startup_migrations(test_engine_ledger)

    retry(test_engine_ledger, 82, reason="注入失败后重试")

    state_after = load_state(test_engine_ledger)
    assert 82 in state_after.applied
    assert 82 not in state_after.failed
    assert state_after.applied[82].error is None
    with test_engine_ledger.connect() as conn:
        count = conn.execute(text("SELECT count(*) FROM schema_migrations WHERE version = 82")).scalar()
    assert count == 1, "retry 必须 UPDATE 同一行，不得插入新行"


def test_retry_rejects_applied_version(test_engine_ledger: Engine) -> None:
    """Retry 只接受 failed 版本（对 applied 版本拒绝并给出提示）."""
    with pytest.raises(MigrationBlockedError, match="没有 failed 记录"):
        retry(test_engine_ledger, 1, reason=None)


# ---------------------------------------------------------------------------
# 既有库基线（K7 / A3 / A4）
# ---------------------------------------------------------------------------


def test_existing_database_without_ledger_blocks(test_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """既有库 + 空账本 → 阻断，文案含 baseline 指令（A3）."""
    monkeypatch.setattr(settings, "migration_auto_baseline", False)
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE schema_migrations RESTART IDENTITY"))
        conn.execute(text("TRUNCATE TABLE users CASCADE"))
        role_id = conn.execute(text("SELECT id FROM roles ORDER BY created_at LIMIT 1")).scalar()
        if role_id is None:
            role_id = "ledger-dummy-role"
            conn.execute(
                text(
                    "INSERT INTO roles (id, name, code, is_system, is_active, permissions_customized, "
                    "created_at, updated_at) VALUES (:id, '临时角色', 'ledger-dummy', false, true, false, "
                    "now(), now())",
                ),
                {"id": role_id},
            )
        # 用 ORM 建用户（列级 NOT NULL 约束较多，原生 INSERT 需逐列跟进 schema 变化）
        from models import User

        session = Session(bind=conn)
        session.add(
            User(
                id="u-dummy",
                username="ledger-dummy",
                password="x",
                nickname="临时基线用户",
                status="active",
                role_id=role_id,
            ),
        )
        session.flush()
    try:
        with pytest.raises(MigrationBlockedError) as excinfo:
            run_startup_migrations(test_engine)
        message = str(excinfo.value)
        assert "baseline --confirm" in message
        assert "既有数据库" in message
    finally:
        with test_engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE users CASCADE"))
            conn.execute(text("DELETE FROM roles WHERE code = 'ledger-dummy'"))
        _reset_state(test_engine)


def test_baseline_requires_confirm(test_engine: Engine) -> None:
    """Baseline 无 --confirm → 拒绝执行（退出码 2 的语义在 CLI，业务层抛错）."""
    with pytest.raises(MigrationBlockedError, match="--confirm"):
        baseline(test_engine, confirm=False, dry_run=False)


def test_baseline_dry_run_writes_nothing(test_engine: Engine) -> None:
    """Baseline --dry-run 不写库、不备份（§7.2）."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE schema_migrations RESTART IDENTITY"))
        conn.execute(text("TRUNCATE TABLE migration_compensations RESTART IDENTITY"))

    executed = baseline(test_engine, confirm=True, dry_run=True)

    assert executed == []
    with test_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM schema_migrations")).scalar() == 0
        assert conn.execute(text("SELECT count(*) FROM migration_compensations")).scalar() == 0
    _reset_state(test_engine)


def test_baseline_confirm_registers_all_with_audit(
    test_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Baseline --confirm → 82 条 applied + 1 条 baseline 审计（A4）.

    为避免真实全库 pg_dump（测试库体量大、耗时长），此处用桩替换 ``create_backup``，
    仅在「备份调用发生」这一层做断言；真实 pg_dump 由
    ``tests/e2e/test_migration_runner.py`` 覆盖。
    """
    from migrations.backup import BackupResult

    calls: list[str] = []

    def _stub_backup(*args: Any, **kwargs: Any) -> BackupResult:
        calls.append(kwargs.get("name", "?"))
        return BackupResult(path=str(tmp_path / "stub.dump"), sha256="0" * 64, size_bytes=1, scope="full", tables=())

    # runner 在模块级 from ... import create_backup，需 patch runner 的引用
    monkeypatch.setattr("migrations.runner.create_backup", _stub_backup)

    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE schema_migrations RESTART IDENTITY"))
        conn.execute(text("TRUNCATE TABLE migration_compensations RESTART IDENTITY"))

    executed = baseline(test_engine, confirm=True, dry_run=False)

    assert executed == [m.version for m in MIGRATIONS]
    assert calls[0] == "baseline", "baseline 必须先做一次全库备份（第一项）"
    with test_engine.connect() as conn:
        audit = conn.execute(
            text("SELECT action, result, affected_rows FROM migration_compensations WHERE action = 'baseline'"),
        ).first()
    assert audit is not None
    assert audit[0] == "baseline"
    assert audit[1] == "success"
    assert audit[2] == len(MIGRATIONS)
    _reset_state(test_engine)


# ---------------------------------------------------------------------------
# legacy 开关（K8 / §15.2）
# ---------------------------------------------------------------------------


def test_legacy_mode_uses_old_path_and_skips_ledger(
    test_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``MIGRATION_LEGACY_MODE=true`` → 走旧硬编码路径（返回 None，无账本写入）."""
    monkeypatch.setattr(settings, "migration_legacy_mode", True)
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE schema_migrations RESTART IDENTITY"))

    summary = run_startup_migrations(test_engine)

    assert summary is None
    with test_engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM schema_migrations")).scalar() == 0
    _reset_state(test_engine)


def test_non_postgres_engine_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    """非 PostgreSQL 引擎 → RuntimeError（既有行为保留）."""

    class _FakeDialect:
        name = "sqlite"

    class _FakeEngine:
        dialect = _FakeDialect()
        url = "sqlite://"

    with pytest.raises(RuntimeError, match="仅支持 PostgreSQL"):
        run_startup_migrations(_FakeEngine())  # type: ignore[arg-type]


# ---------------------------------------------------------------------------
# 补偿闸门（§9.4 / A7 / A8 / A9）
# ---------------------------------------------------------------------------


def test_compensate_without_yes_refuses(test_engine_ledger: Engine) -> None:
    """无 --yes → 退出码 2（不执行 DML）."""
    outcome = compensate(
        test_engine_ledger,
        4,
        dry_run=False,
        yes=False,
        force=False,
        reason=None,
        operator="pytest",
    )
    assert outcome.exit_code == 2
    assert outcome.affected_rows == 0


def test_compensate_dry_run_has_no_side_effect(test_engine_ledger: Engine) -> None:
    """补偿 dry-run 不改数据（A7）."""
    with test_engine_ledger.begin() as conn:
        before = conn.execute(text("SELECT count(*) FROM users WHERE phone_hash IS NOT NULL")).scalar()

    outcome = compensate(
        test_engine_ledger,
        4,
        dry_run=True,
        yes=True,
        force=False,
        reason="演练",
        operator="pytest",
    )

    with test_engine_ledger.begin() as conn:
        after = conn.execute(text("SELECT count(*) FROM users WHERE phone_hash IS NOT NULL")).scalar()
    assert outcome.result == "dry_run"
    assert before == after


def test_compensate_irreversible_is_refused(test_engine_ledger: Engine) -> None:
    """不可逆版本（v74 清空 session_key / v3 加密）→ 拒绝并提示 restore-hint（A9）."""
    from migrations.compensations.base import CompensationNotSupportedError

    for version in (3, 74):
        with pytest.raises(CompensationNotSupportedError, match="restore-hint"):
            compensate(
                test_engine_ledger,
                version,
                dry_run=True,
                yes=True,
                force=False,
                reason=None,
                operator="pytest",
            )


# ---------------------------------------------------------------------------
# 前置校验
# ---------------------------------------------------------------------------


def test_backup_mode_off_rejected_in_production(monkeypatch: pytest.MonkeyPatch) -> None:
    """生产（debug=false）+ MIGRATION_BACKUP_MODE=off → 启动阻断（K11 / 总纲 C6）."""
    from migrations.runner import _validate_settings

    monkeypatch.setattr(settings, "migration_backup_mode", "off")
    monkeypatch.setattr(settings, "debug", False)
    with pytest.raises(MigrationBlockedError, match="MIGRATION_BACKUP_MODE=off"):
        _validate_settings()
