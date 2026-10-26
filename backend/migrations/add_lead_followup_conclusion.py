"""为 lead_followups 增加跟进结论列（幂等）.

跟进记录新增「跟进结论」选填字段，记录与业主未谈拢的分歧点
（合作模式 / 价格 / 两者都不一致）。

- 幂等为 `lead_followups` 添加 `conclusion VARCHAR(30)`；
- 列可空且无默认值：存量跟进记录没有该事实，用默认值填充会把「没记录过」
  伪装成「结论=模式不一致」；展示层以「未填写」显式降级。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_TABLE = "lead_followups"
_COLUMN = "conclusion"
# 与 models/lead/lead.py::LeadFollowUp.conclusion 的 String(30) 保持逐字一致
_DDL = "ALTER TABLE lead_followups ADD COLUMN conclusion VARCHAR(30)"


def add_lead_followup_conclusion(engine: Engine) -> None:
    """幂等为 lead_followups 增加 conclusion 列.

    Args:
        engine: SQLAlchemy Engine 实例

    """
    if engine.dialect.name != "postgresql":
        return
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _helpers 导入之前导入本模块
    from migrations._helpers import _column_exists

    # 表不存在时跳过（全新库由 Base.metadata.create_all 覆盖）
    with engine.connect() as conn:
        exists = conn.execute(text("SELECT to_regclass(:name)"), {"name": f"public.{_TABLE}"}).scalar()
    if exists is None:
        logger.info("迁移：%s 不存在，跳过 %s 列创建", _TABLE, _COLUMN)
        return
    if _column_exists(engine, _TABLE, _COLUMN):
        return
    logger.info("迁移：%s 增加 %s 列（跟进结论）", _TABLE, _COLUMN)
    with engine.begin() as conn:
        conn.execute(text(_DDL))
