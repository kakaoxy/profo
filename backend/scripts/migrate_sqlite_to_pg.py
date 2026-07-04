"""一次性数据迁移脚本: SQLite -> PostgreSQL.

仅迁移项目管理相关的 12 张表(projects 及其子表):
project_documents, renovation_photos, project_renovations, project_status_logs,
finance_records, project_interactions, project_evaluations, project_follow_ups,
project_sales, project_owners, project_contracts, projects.

行为:
- 从旧 SQLite 数据库读取,写入新 PostgreSQL 数据库.
- 在目标库执行 Base.metadata.create_all 确保全部表结构存在.
- 为幂等性,插入前按子表优先顺序 DELETE 目标 12 张表的数据.
- SQLite 返回 naive datetime; PG 列为 TIMESTAMP WITH TIME ZONE,
  因此对所有 tzinfo 为 None 的 datetime 值附加 UTC 时区.

环境变量(主接口):
- SQLITE_SOURCE_URL: 源 SQLite URL, 默认 "sqlite:///./data.db".
- DATABASE_URL: 目标 PostgreSQL URL (例如 postgresql+psycopg://...),
  缺失则报错退出.

运行方式(在 backend 目录下):
    uv run python scripts/migrate_sqlite_to_pg.py

注意: 本脚本只导入 models.Base 以获取元数据, 不导入 settings/db,
以避免触发 JWT/wechat 等环境变量校验.
"""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.types import JSON, TypeDecorator

# 使脚本可作为脚本直接运行: 将 backend 目录加入 sys.path 以便 `from models import Base`.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import Base  # noqa: E402
from models.common.encrypted import EncryptedString  # noqa: E402
from utils.crypto import decrypt  # noqa: E402


# 子表优先(删除顺序); 插入时反序(父表优先).
# 注意: 模型实际表名为 "project_follow_ups"(中间有下划线),
# 而非任务描述中的 "project_followups".
DELETION_ORDER: list[str] = [
    "project_documents",
    "renovation_photos",
    "project_renovations",
    "project_status_logs",
    "finance_records",
    "project_interactions",
    "project_evaluations",
    "project_follow_ups",
    "project_sales",
    "project_owners",
    "project_contracts",
    "projects",
]

INSERTION_ORDER: list[str] = list(reversed(DELETION_ORDER))


def _get_urls() -> tuple[str, str]:
    """从环境变量读取源/目标数据库 URL.

    Returns:
        (sqlite_source_url, postgres_target_url)

    Raises:
        RuntimeError: 若 DATABASE_URL 未设置.
    """
    src_url: str = os.environ.get("SQLITE_SOURCE_URL", "sqlite:///./data.db")
    dst_url: str | None = os.environ.get("DATABASE_URL")
    if not dst_url:
        raise RuntimeError(
            "DATABASE_URL environment variable is not set. "
            "Set it to the target PostgreSQL URL, e.g. "
            "postgresql+psycopg://user:pass@host:5432/dbname"
        )
    return src_url, dst_url


def _read_rows(src_engine: Engine, table_name: str, table_obj: object) -> list[dict]:
    """从源库读取指定表的全部行, 返回处理后的字典列表.

    按目标表列类型对值做反序列化, 使后续 Core insert 时 type decorator 能正确工作:
    - EncryptedString 列: 源库原生 SQL 读出的是密文, 需先 decrypt 成明文,
      否则 Core insert 的 process_bind_param 会再次加密导致双重加密.
    - JSON 列: 源库原生 SQL 读出的是 JSON 字符串, 需先 json.loads 成 Python 对象,
      否则 Core insert 的 process_bind_param 会再次序列化导致双重序列化.
    - datetime: 若 tzinfo 为 None, 附加 UTC 时区.
    """
    # 预扫描列类型, 避免逐行逐列 isinstance 开销.
    col_types: dict[str, tuple[str, ...]] = {}
    for col in table_obj.columns:  # type: ignore[attr-defined]
        t = col.type
        kinds: tuple[str, ...] = ()
        if isinstance(t, EncryptedString):
            kinds = ("encrypted",)
        elif isinstance(t, JSON) or (isinstance(t, TypeDecorator) and isinstance(t.impl, JSON)):
            kinds = ("json",)
        col_types[col.name] = kinds

    rows: list[dict] = []
    with src_engine.connect() as conn:
        result = conn.execute(text(f"SELECT * FROM {table_name}"))
        for mapping in result.mappings():
            row_dict: dict = {}
            for key, value in mapping.items():
                kinds = col_types.get(key, ())
                if value is not None:
                    if "encrypted" in kinds and isinstance(value, str) and value:
                        value = decrypt(value)
                    elif "json" in kinds and isinstance(value, str) and value:
                        try:
                            value = json.loads(value)
                        except (json.JSONDecodeError, ValueError):
                            pass
                    elif isinstance(value, datetime) and value.tzinfo is None:
                        value = value.replace(tzinfo=timezone.utc)
                row_dict[key] = value
            rows.append(row_dict)
    return rows


def _migrate(src_engine: Engine, dst_engine: Engine) -> int:
    """执行迁移, 返回迁移的总行数.

    在单个目标事务内完成 DELETE + INSERT, 失败则整体回滚.
    """
    Base.metadata.create_all(bind=dst_engine)

    tables_meta = Base.metadata.tables
    for name in DELETION_ORDER:
        if name not in tables_meta:
            raise RuntimeError(
                f"Table {name!r} not found in Base.metadata.tables. "
                "Check model definitions."
            )

    total: int = 0
    try:
        with dst_engine.begin() as conn:
            # 幂等: 子表优先删除目标表数据.
            for name in DELETION_ORDER:
                conn.execute(text(f"DELETE FROM {name}"))
            # 父表优先插入.
            for name in INSERTION_ORDER:
                table_obj = tables_meta[name]
                rows = _read_rows(src_engine, name, table_obj)
                if rows:
                    conn.execute(table_obj.insert(), rows)
                print(f"{name}: migrated {len(rows)} rows")
                total += len(rows)
    except Exception as e:
        raise RuntimeError(f"Migration failed (transaction rolled back): {e}") from e
    return total


def main() -> int:
    """入口函数, 返回进程退出码 (0 成功, 1 失败)."""
    try:
        src_url, dst_url = _get_urls()
        src_engine: Engine = create_engine(src_url)
        dst_engine: Engine = create_engine(dst_url)
        try:
            total = _migrate(src_engine, dst_engine)
        finally:
            src_engine.dispose()
            dst_engine.dispose()
        print(f"Migration complete. Total: {total} rows across 12 tables.")
        return 0
    except Exception as e:
        print(f"Migration failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
