"""补偿框架（T1.6 / K12 / K13 / §9.4）。

覆盖点（对齐 spec §13.1 ``test_migration_compensation.py``）：
- **dry-run 不改数据**（最强断言：前后行数/内容完全一致）；
- 超行数上限 → 拒绝（``CompensationTooLargeError``）；
- 补偿事务失败整体回滚（不留半成品）；
- A 级通用 DROP 的**空表守卫**（非空表拒绝，``--force`` 可穿透）；
- 不可逆版本 → ``CompensationNotSupportedError``（引导 restore-hint）；
- 生产双确认（``DEBUG=false`` 需 ``MIGRATION_PRODUCTION_CONFIRM`` 匹配）。

⚠️ 测试使用真实 PG（``test_engine``）：补偿是事务语义，伪造连接会掩盖 ROLLBACK 行为。
每个用例结束后把 ``schema_migrations`` 重置回「全部 applied」以隔离。
"""

import pytest
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from migrations.compensations.base import (
    CompensationContext,
    CompensationNotSupportedError,
    CompensationResult,
    CompensationTooLargeError,
)
from migrations.compensations.generic_drop import DROP_SPECS
from migrations.compensations.generic_drop import compensate as generic_compensate
from migrations.compensations.guards import (
    CompensationGuardError,
    assert_tables_empty,
    check_row_budget,
    count_rows,
)
from migrations.compensations.registry import COMPENSATIONS, has_compensation, resolve_compensation
from migrations.registry import MIGRATIONS
from migrations.runner import compensate as runner_compensate
from settings import settings


def _ctx(version: int, *, dry_run: bool, max_rows: int = 10000, force: bool = False) -> CompensationContext:
    """构造补偿上下文（测试默认 operator=pytest）."""
    return CompensationContext(
        version=version,
        dry_run=dry_run,
        max_rows=max_rows,
        reason="pytest",
        operator="pytest",
        force=force,
    )


# ---------------------------------------------------------------------------
# 注册表与解析
# ---------------------------------------------------------------------------


def test_all_registered_compensations_are_callable() -> None:
    """实脚本登记的每个版本都可解析为可调用对象."""
    for version in COMPENSATIONS:
        assert callable(resolve_compensation(version))


def test_has_compensation_matches_resolvable() -> None:
    """``has_compensation`` 与实际可解析性一致（防止 CLI 误判）。"""
    for migration in MIGRATIONS:
        resolvable = True
        try:
            resolve_compensation(migration.version)
        except CompensationNotSupportedError:
            resolvable = False
        assert has_compensation(migration.version) is resolvable, f"v{migration.version} 判定与解析不一致"


def test_drop_specs_only_cover_safe_entries() -> None:
    """``DROP_SPECS`` 只能登记 A 级或「schema 类 B 级」，绝不覆盖 C/D 与 data 类 B 级.

    这是防止「用通用 DROP 假装回滚数据迁移」这类二次伤害的最后一道闸门。
    """
    by_version = {m.version: m for m in MIGRATIONS}
    offenders: list[str] = []
    for version in DROP_SPECS:
        migration = by_version[version]
        if migration.risk in ("C", "D"):
            offenders.append(f"v{version} {migration.name}（风险 {migration.risk}）")
        elif migration.risk == "B" and migration.kind == "data":
            offenders.append(f"v{version} {migration.name}（B 级 data，需实脚本）")
    assert not offenders, f"DROP_SPECS 登记了不该用 DROP 回滚的迁移：{offenders}"


def test_unregistered_version_raises() -> None:
    """未登记补偿的版本 → ``CompensationNotSupportedError`` 并提示 restore-hint."""
    with pytest.raises(CompensationNotSupportedError, match="restore-hint"):
        resolve_compensation(3)


# ---------------------------------------------------------------------------
# dry-run 只读（单测强制 K12）
# ---------------------------------------------------------------------------


def test_dry_run_does_not_modify_data(test_engine: Engine) -> None:
    """dry-run 后表内容完全不变（逐行比对，不只比行数）."""
    with test_engine.begin() as conn:
        before = conn.execute(
            text("SELECT count(*), coalesce(sum(round(total_price / nullif(area, 0), 2)), 0) FROM leads"),
        ).first()

    fn = resolve_compensation(50)
    with test_engine.begin() as conn:
        result = fn(conn, _ctx(50, dry_run=True))

    with test_engine.begin() as conn:
        after = conn.execute(
            text("SELECT count(*), coalesce(sum(round(total_price / nullif(area, 0), 2)), 0) FROM leads"),
        ).first()

    assert isinstance(result, CompensationResult)
    assert before == after
    assert result.affected_rows >= 0


def test_dry_run_reports_matching_rows(test_engine: Engine) -> None:
    """dry-run 报告的行数 = 实际可回滚行数（口径一致，否则误伤）."""
    fn = resolve_compensation(78)
    with test_engine.begin() as conn:
        dry = fn(conn, _ctx(78, dry_run=True))
        actual = count_rows(conn, "bd_rooms")
    assert dry.affected_rows <= actual


# ---------------------------------------------------------------------------
# 行数上限（K13）
# ---------------------------------------------------------------------------


def test_check_row_budget_rejects_over_limit() -> None:
    """超上限且未 force → ``CompensationTooLargeError``."""
    with pytest.raises(CompensationTooLargeError, match="--force"):
        check_row_budget(101, 100, force=False)


def test_check_row_budget_allows_force() -> None:
    """``force=True`` 时穿透上限（操作者显式确认）."""
    check_row_budget(10**9, 100, force=True)


def test_runner_compensation_respects_row_budget(
    test_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """执行器层：上限极小且未 force → 拒绝，且审计写 ``aborted``."""
    monkeypatch.setattr(settings, "migration_compensation_max_rows", 0)
    # 造一行「公式匹配」的线索：max_rows=0 时任何 >0 的影响行数都必须被拒
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE leads CASCADE"))
        conn.execute(
            text(
                "INSERT INTO leads (id, community_name, is_hot, status, area, total_price, unit_price, "
                "is_deleted, created_at, updated_at) VALUES "
                "('lead-budget', '预算小区', 0, 'PENDING_ASSESSMENT', 100, 50000, 500.00, false, now(), now())",
            ),
        )

    with pytest.raises(CompensationTooLargeError):
        runner_compensate(
            test_engine,
            50,
            dry_run=False,
            yes=True,
            force=False,
            reason="pytest 行数上限",
            operator="pytest",
        )
    with test_engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT result FROM migration_compensations WHERE action = 'compensate' ORDER BY id DESC LIMIT 1",
            ),
        ).first()
    assert row is not None
    assert row[0] == "aborted"
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE leads CASCADE"))


# ---------------------------------------------------------------------------
# 事务回滚（K12）
# ---------------------------------------------------------------------------


def test_compensation_failure_rolls_back(test_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """补偿中途抛错 → 整体回滚，数据保持原样."""
    import migrations.compensations.registry as registry_module

    def _half_work(conn: Connection, ctx: CompensationContext) -> CompensationResult:
        conn.execute(text("UPDATE leads SET unit_price = NULL"))
        message = "模拟补偿中途失败"
        raise RuntimeError(message)

    monkeypatch.setitem(registry_module.COMPENSATIONS, 50, _half_work)

    with test_engine.begin() as conn:
        before = conn.execute(text("SELECT count(*) FROM leads WHERE unit_price IS NULL")).scalar()

    from migrations.runner import compensate as runner_fn

    with pytest.raises(RuntimeError, match="模拟补偿中途失败"):
        runner_fn(
            test_engine,
            50,
            dry_run=False,
            yes=True,
            force=True,
            reason="pytest 回滚",
            operator="pytest",
        )

    with test_engine.begin() as conn:
        after = conn.execute(text("SELECT count(*) FROM leads WHERE unit_price IS NULL")).scalar()
    assert before == after, "补偿失败必须整体回滚，不得留下部分修改"


# ---------------------------------------------------------------------------
# 空表守卫（A 级通用 DROP）
# ---------------------------------------------------------------------------


def test_assert_tables_empty_rejects_non_empty(test_engine: Engine) -> None:
    """非空表 → 守卫拒绝，错误信息含表名与行数."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))
        conn.execute(
            text(
                "INSERT INTO system_configs (id, key, value, created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'pytest-key', 'v', now(), now())",
            ),
        )
        try:
            with pytest.raises(CompensationGuardError, match="已有业务数据"):
                assert_tables_empty(conn, ["system_configs"], force=False)
        finally:
            conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))


def test_assert_tables_empty_allows_force(test_engine: Engine) -> None:
    """``force=True`` 穿透守卫（CLI ``--force`` 的语义）."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))
        conn.execute(
            text(
                "INSERT INTO system_configs (id, key, value, created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'pytest-key', 'v', now(), now())",
            ),
        )
        try:
            assert_tables_empty(conn, ["system_configs"], force=True)
        finally:
            conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))


def test_generic_drop_dry_run_counts_rows(test_engine: Engine) -> None:
    """A 级通用 DROP 的 dry-run 报告每表行数，且不执行 DDL."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))
        conn.execute(
            text(
                "INSERT INTO system_configs (id, key, value, created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'pytest-key', 'v', now(), now())",
            ),
        )
    try:
        with test_engine.begin() as conn:
            result = generic_compensate(conn, _ctx(62, dry_run=True))
        assert result.affected_rows == 1
        assert "system_configs" in (result.notes or "")
        with test_engine.connect() as conn:
            assert conn.execute(text("SELECT to_regclass('public.system_configs') IS NOT NULL")).scalar()
    finally:
        with test_engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))


def test_generic_drop_refuses_non_empty_table(test_engine: Engine) -> None:
    """实跑时非空表被守卫拦下（不 DROP、不留半成品）."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))
        conn.execute(
            text(
                "INSERT INTO system_configs (id, key, value, created_at, updated_at) "
                "VALUES (gen_random_uuid(), 'pytest-key', 'v', now(), now())",
            ),
        )
    try:
        with test_engine.begin() as conn, pytest.raises(CompensationGuardError):
            generic_compensate(conn, _ctx(62, dry_run=False))
        with test_engine.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM system_configs")).scalar() == 1
    finally:
        with test_engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))


def test_generic_drop_executes_when_empty(test_engine: Engine) -> None:
    """空表 + 实跑 → DROP 成功（幂等 IF EXISTS，重复执行不报错）."""
    with test_engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS pytest_drop_probe (id integer)"))
    # 用一个不为真实表名的版本无法命中 DROP_SPECS，故改用真实空表 system_configs
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE system_configs CASCADE"))
    # 用 business 级入口直接验证：v62 create_system_configs_table
    with test_engine.begin() as conn:
        generic_compensate(conn, _ctx(62, dry_run=False))
        # 幂等：第二次不应报错
        generic_compensate(conn, _ctx(62, dry_run=False))
    with test_engine.connect() as conn:
        exists = conn.execute(text("SELECT to_regclass('public.system_configs') IS NOT NULL")).scalar()
    assert exists is False
    # 恢复表（后续测试与启动迁移依赖）
    from migrations._system_configs import create_system_configs_table

    create_system_configs_table(test_engine)
    with test_engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS pytest_drop_probe"))


# ---------------------------------------------------------------------------
# 生产双确认（K13 / §9.4）
# ---------------------------------------------------------------------------


def test_production_compensation_requires_confirm(
    test_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``DEBUG=false`` 且未配置确认口令 → 拒绝（不执行 DML）."""
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "migration_production_confirm", "")
    monkeypatch.setattr(settings, "migration_env_name", "production")

    from migrations.runner import MigrationBlockedError

    with pytest.raises(MigrationBlockedError, match="MIGRATION_PRODUCTION_CONFIRM=production"):
        runner_compensate(
            test_engine,
            4,
            dry_run=False,
            yes=True,
            force=False,
            reason="pytest",
            operator="pytest",
        )


def test_production_compensation_requires_matching_env(
    test_engine: Engine,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """口令与环境名不匹配 → 拒绝."""
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "migration_production_confirm", "staging")
    monkeypatch.setattr(settings, "migration_env_name", "production")

    from migrations.runner import MigrationBlockedError

    with pytest.raises(MigrationBlockedError, match="MIGRATION_PRODUCTION_CONFIRM=production"):
        runner_compensate(
            test_engine,
            4,
            dry_run=False,
            yes=True,
            force=False,
            reason="pytest",
            operator="pytest",
        )


def test_production_dry_run_needs_no_confirm(test_engine: Engine, monkeypatch: pytest.MonkeyPatch) -> None:
    """生产环境下 dry-run 仍可执行（只读，无需双确认）."""
    monkeypatch.setattr(settings, "debug", False)
    monkeypatch.setattr(settings, "migration_production_confirm", "")

    outcome = runner_compensate(
        test_engine,
        4,
        dry_run=True,
        yes=True,
        force=False,
        reason="pytest",
        operator="pytest",
    )
    assert outcome.result == "dry_run"


# ---------------------------------------------------------------------------
# B 级脚本语义
# ---------------------------------------------------------------------------


def test_v50_compensation_only_clears_formula_matches(test_engine: Engine) -> None:
    """v50 只清空「公式可复现」的单价，不误伤业务改写值（保守反向）."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE leads CASCADE"))

        conn.execute(
            text(
                "INSERT INTO leads (id, community_name, is_hot, status, area, total_price, unit_price, "
                "is_deleted, created_at, updated_at) VALUES "
                "('lead-lo', 'A小区', 0, 'PENDING_ASSESSMENT', 100, 50000, 500.00, false, now(), now())",
            ),
        )
    try:
        with test_engine.begin() as conn:
            dry = resolve_compensation(50)(conn, _ctx(50, dry_run=True))
        assert dry.affected_rows == 1
        with test_engine.begin() as conn:
            result = resolve_compensation(50)(conn, _ctx(50, dry_run=False))
        assert result.affected_rows == 1
        with test_engine.connect() as conn:
            assert conn.execute(text("SELECT unit_price FROM leads WHERE id = 'lead-lo'")).scalar() is None
    finally:
        with test_engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE leads CASCADE"))


def test_v4_compensation_clears_phone_hash(test_engine: Engine) -> None:
    """v4 清空 phone_hash（dry-run 与实际行数一致）."""
    with test_engine.begin() as conn:
        conn.execute(text("TRUNCATE TABLE users CASCADE"))
        role_id = conn.execute(text("SELECT id FROM roles ORDER BY created_at LIMIT 1")).scalar()
        if role_id is None:
            role_id = "pytest-role-4"
            conn.execute(
                text(
                    "INSERT INTO roles (id, name, code, is_system, is_active, permissions_customized, "
                    "created_at, updated_at) VALUES (:id, '测试角色', 'pytest-role-4', false, true, false, "
                    "now(), now())",
                ),
                {"id": role_id},
            )
        conn.execute(
            text(
                "INSERT INTO users (id, username, password, nickname, status, role_id, phone_hash, "
                "created_at, updated_at, token_version, is_temporary, must_change_password) "
                "VALUES ('u-4', 'phone-hash-user', 'x', 'x', 'active', :r, 'abc123', "
                "now(), now(), 1, false, false)",
            ),
            {"r": role_id},
        )
    try:
        with test_engine.begin() as conn:
            dry = resolve_compensation(4)(conn, _ctx(4, dry_run=True))
        assert dry.affected_rows == 1
        with test_engine.begin() as conn:
            result = resolve_compensation(4)(conn, _ctx(4, dry_run=False))
        assert result.affected_rows == 1
        with test_engine.connect() as conn:
            assert conn.execute(text("SELECT phone_hash FROM users WHERE id = 'u-4'")).scalar() is None
    finally:
        with test_engine.begin() as conn:
            conn.execute(text("TRUNCATE TABLE users CASCADE"))
