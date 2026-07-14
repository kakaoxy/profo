"""清理过期的 reserved 占位合同记录.

ContractNumberGenerator 采用「预占式」生成合同编号，会先 INSERT 一条
contract_status="reserved" 的占位记录。若用户获取编号后未完成项目创建，
该占位记录会残留。本迁移在启动时清理超过 24 小时的 reserved 记录，
释放编号空间供后续复用（编号本身不回收，但记录被删除后不会影响序号递增）。
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def cleanup_reserved_contracts(engine: Engine) -> None:
    """清理超过 24 小时的 reserved 占位合同记录（幂等）.

    Args:
        engine: SQLAlchemy 引擎

    """
    inspector = inspect(engine)
    if "project_contracts" not in inspector.get_table_names():
        return

    # PostgreSQL 与 SQLite 的 24 小时前时间表达式不同
    if engine.dialect.name == "postgresql":
        threshold_expr = "NOW() - INTERVAL '24 hours'"
    else:
        # SQLite
        threshold_expr = "datetime('now', '-24 hours')"

    # threshold_expr 来自硬编码条件分支，无注入风险；DDL 不支持绑定参数
    sql = (
        "DELETE FROM project_contracts "  # noqa: S608
        "WHERE contract_status = 'reserved' "
        "AND created_at < " + threshold_expr
    )
    with engine.begin() as conn:
        deleted = conn.execute(text(sql)).rowcount
    if deleted:
        logger.info("迁移：清理 %d 条过期 reserved 占位合同记录", deleted)
