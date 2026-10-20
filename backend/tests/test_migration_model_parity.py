"""ORM ↔ 数据库逐列一致性（T1.8 / 总纲 C2「parity」契约）。

为什么需要：新表在「全新库」由 ``Base.metadata.create_all`` 创建、在「既有库」由
迁移创建。两条路径的 DDL 若不一致，会出现「测试通过、生产缺列/缺默认值」。本文件
对版本账本两表（本迭代唯一豁免 C2 登记的表）逐列比对 ``information_schema`` 与 ORM。
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from models.system.schema_migration import MigrationCompensation, SchemaMigration

_TABLES = (SchemaMigration, MigrationCompensation)

# PG 类型名 → 允许的 information_schema.data_type 取值集合
# （SQLAlchemy 生成的 DDL 与 information_schema 的命名口径差异在此显式对齐）
_EXPECTED_SIMPLE_TYPES: dict[str, set[str]] = {
    "Integer": {"integer"},
    "BigInteger": {"bigint"},
    "String": {"character varying"},
    "Text": {"text"},
    "Boolean": {"boolean"},
    "DateTime": {"timestamp with time zone"},
}


def _normalized_db_type(db_type: object) -> str:
    """把 SQLAlchemy inspector 的类型字符串归一化为 PG 标准类型名.

    ``str()`` 对 PG 方言会给出 ``VARCHAR(64)`` / ``TIMESTAMP`` 这类内部名，
    需要映射回 ``information_schema.data_type`` 口径（character varying /
    timestamp with time zone），否则类型比对全是假失败。
    """
    text_repr = str(db_type).upper()
    if text_repr.startswith(("VARCHAR", "CHARACTER VARYING")):
        return "character varying"
    if text_repr.startswith("TIMESTAMP"):
        if "WITH TIME ZONE" in text_repr or text_repr == "TIMESTAMP":
            # 调用方能拿到 timezone 属性时以属性为准（见下方 tz 判定）
            return "timestamp with time zone" if getattr(db_type, "timezone", True) else "timestamp"
        return "timestamp"
    if text_repr.startswith("TEXT"):
        return "text"
    if text_repr.startswith("BIGINT"):
        return "bigint"
    if text_repr.startswith("INTEGER") or text_repr == "INT":
        return "integer"
    if text_repr.startswith("BOOLEAN") or text_repr == "BOOL":
        return "boolean"
    return text_repr.lower()


def test_version_table_columns_match_orm(test_engine: Engine) -> None:
    """``schema_migrations`` / ``migration_compensations`` 的列名与类型逐列一致."""
    inspector = inspect(test_engine)
    problems: list[str] = []
    for model in _TABLES:
        table_name = model.__tablename__
        if table_name not in inspector.get_table_names():
            problems.append(f"{table_name}: 表不存在")
            continue
        db_columns = {col["name"]: col for col in inspector.get_columns(table_name)}
        orm_columns = {col.name: col for col in model.__table__.columns}
        missing = sorted(set(orm_columns) - set(db_columns))
        extra = sorted(set(db_columns) - set(orm_columns))
        if missing:
            problems.append(f"{table_name}: 数据库缺列 {missing}")
        if extra:
            problems.append(f"{table_name}: 数据库多列 {extra}")
        for name in sorted(set(orm_columns) & set(db_columns)):
            orm_type = type(orm_columns[name].type).__name__
            allowed = _EXPECTED_SIMPLE_TYPES.get(orm_type)
            if allowed is None:
                problems.append(f"{table_name}.{name}: 未在类型映射表中登记 ORM 类型 {orm_type}")
                continue
            db_type = _normalized_db_type(db_columns[name]["type"])
            if db_type not in allowed:
                problems.append(f"{table_name}.{name}: ORM {orm_type} ≠ DB {db_type}")
    assert not problems, "ORM/DB 不一致：\n  " + "\n  ".join(problems)


def test_version_table_nullability_matches_orm(test_engine: Engine) -> None:
    """可空性逐列一致（``status``/``checksum`` 等 NOT NULL 列漏写会静默放过脏数据）."""
    inspector = inspect(test_engine)
    problems: list[str] = []
    for model in _TABLES:
        table_name = model.__tablename__
        db_columns = {col["name"]: col for col in inspector.get_columns(table_name)}
        for column in model.__table__.columns:
            db_nullable = db_columns[column.name]["nullable"]
            orm_nullable = bool(column.nullable)
            # 主键在 information_schema 中 nullable=false，ORM 侧 primary_key 也应为 False
            if db_nullable != orm_nullable:
                problems.append(f"{table_name}.{column.name}: ORM nullable={orm_nullable} ≠ DB {db_nullable}")
    assert not problems, "可空性不一致：\n  " + "\n  ".join(problems)


def test_version_table_primary_keys(test_engine: Engine) -> None:
    """主键定义一致（``schema_migrations`` 以 version 为主键，不是 id）."""
    inspector = inspect(test_engine)
    assert inspector.get_pk_constraint("schema_migrations")["constrained_columns"] == ["version"]
    assert inspector.get_pk_constraint("migration_compensations")["constrained_columns"] == ["id"]


def test_schema_migrations_name_unique(test_engine: Engine) -> None:
    """``name`` 唯一约束存在（防止同名迁移覆盖账本）."""
    with test_engine.connect() as conn:
        exists = conn.execute(
            text(
                "SELECT 1 FROM pg_constraint c "
                "JOIN pg_class t ON c.conrelid = t.oid "
                "WHERE t.relname = 'schema_migrations' AND c.contype IN ('u', 'p') "
                "AND pg_get_constraintdef(c.oid) LIKE '%(name)%' LIMIT 1",
            ),
        ).first()
    assert exists is not None, "schema_migrations.name 缺少唯一约束"


def test_created_at_columns_are_timestamptz(test_engine: Engine) -> None:
    """账本时间列必须是 ``timestamp with time zone``（总纲 C8）."""
    with test_engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT table_name, column_name, data_type FROM information_schema.columns "
                "WHERE table_name IN ('schema_migrations', 'migration_compensations') "
                "AND column_name IN ('started_at', 'applied_at', 'finished_at')",
            ),
        ).fetchall()
    assert rows, "未查到时间列"
    bad = [(table, column, dtype) for table, column, dtype in rows if dtype != "timestamp with time zone"]
    assert not bad, f"时间列时区类型错误：{bad}"
