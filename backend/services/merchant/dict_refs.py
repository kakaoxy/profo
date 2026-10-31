"""商户域字典项引用检查（V01 REQ-M13-003 / BR-M13-013–016）.

引用表与字段（V01 BR-M13-014）：
- ``merchant_cooperation_status`` → ``merchant_stores.cooperation_status``
- ``merchant_visit_result`` → ``merchant_visits.result``
- ``merchant_agreement_status`` → ``merchant_agreements.status``
- ``merchant_store_type`` → ``merchant_stores.store_type``（字段本期未建，存在后才检查）

V01 阶段业务表尚未创建：缺表/缺列一律按 0 引用处理，保证字典维护在分册上线前可用。
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine.reflection import Inspector
from sqlalchemy.orm import Session

REFERENCE_RULES: dict[str, tuple[tuple[str, str], ...]] = {
    "merchant_cooperation_status": (("merchant_stores", "cooperation_status"),),
    "merchant_store_type": (("merchant_stores", "store_type"),),
    "merchant_visit_result": (("merchant_visits", "result"),),
    "merchant_agreement_status": (("merchant_agreements", "status"),),
}


def _table_has_column(inspector: Inspector, table: str, column: str) -> bool:
    """表与列同时存在才视为可检查."""
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def count_references(db: Session, dict_code: str, code: str) -> int:
    """统计该字典项在业务表中的引用数（缺表/缺列按 0 处理）."""
    rules = REFERENCE_RULES.get(dict_code, ())
    if not rules:
        return 0

    inspector = inspect(db.get_bind())
    total = 0
    for table, column in rules:
        if not _table_has_column(inspector, table, column):
            continue
        # 表名/列名来自上方常量白名单，非用户输入；参数 code 走绑定变量
        count = db.execute(
            text(f'SELECT COUNT(*) FROM "{table}" WHERE "{column}" = :code'),  # noqa: S608
            {"code": code},
        ).scalar_one()
        total += int(count)
    return total


__all__ = ["REFERENCE_RULES", "count_references"]
