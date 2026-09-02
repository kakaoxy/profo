"""为 leads 表补建审核人查询索引（幂等）.

小程序评估工作台「已处理」参考组（``LeadQueryService.get_handled``）按
``auditor_id`` 过滤并按 ``audit_time`` 倒序截取最近 50 条，缺索引会全表扫描 +
filesort。``create_all`` 仅随建表创建索引，已部署环境需显式补建；
模型 ``Lead.__table_args__`` 已同步声明该索引以保持新库一致性。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_INDEX_NAME = "idx_lead_auditor_audit_time"


def add_lead_auditor_index(engine: Engine) -> None:
    """幂等补建 ``leads(auditor_id, audit_time)`` 复合索引.

    Args:
        engine: SQLAlchemy Engine 实例

    """
    if engine.dialect.name != "postgresql":
        return
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _helpers 导入之前导入本模块
    from migrations._helpers import _index_exists

    if _index_exists(engine, _INDEX_NAME):
        return
    logger.info("迁移：补建 leads(auditor_id, audit_time) 索引（评估工作台已处理查询）")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE INDEX idx_lead_auditor_audit_time ON leads (auditor_id, audit_time)",
            ),
        )
