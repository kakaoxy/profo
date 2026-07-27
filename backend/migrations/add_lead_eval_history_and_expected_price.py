"""为线索模块添加评估历史表与 expected_price 列（幂等）.

- 幂等创建 `lead_eval_histories` 表（id/lead_id/eval_price/remark/evaluator_id/evaluated_at）
- 创建索引 `idx_lead_eval_history_lead` ON `lead_id`
- 幂等为 `leads` 表添加 `expected_price NUMERIC(15,2)` 列（可空）
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def add_lead_eval_history_and_expected_price(engine: Engine) -> None:
    """幂等创建评估历史表 + 为 leads 表添加 expected_price 列.

    - 表/列/索引已存在时跳过，不报错
    - 使用 inspect(engine).get_table_names() 检查表是否存在
    - 使用 _column_exists 检查列是否存在
    - 表与索引通过 Base.metadata.create_all 创建（与既有迁移模式一致），
      LeadEvalHistory.__table_args__ 已声明 Index("idx_lead_eval_history_lead", "lead_id")，
      create_all 会一并创建表与索引，checkfirst=True 保证幂等
    """
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _column_exists 定义前导入本模块
    from migrations import _column_exists  # noqa: PLC0415
    from models import Base  # noqa: PLC0415
    from models.lead.lead import LeadEvalHistory  # noqa: PLC0415

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    # 1. 创建 lead_eval_histories 表（含索引，幂等）
    # 使用 Base.metadata.create_all 与既有迁移模式统一
    if "lead_eval_histories" not in existing_tables:
        logger.info("迁移：创建 lead_eval_histories 表（含索引）")
        Base.metadata.create_all(
            bind=engine,
            tables=[LeadEvalHistory.__table__],
            checkfirst=True,
        )

    # 2. 为 leads 表添加 expected_price 列（幂等，可空）
    if not _column_exists(engine, "leads", "expected_price"):
        logger.info("迁移：为 leads 表添加 expected_price 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE leads ADD COLUMN expected_price NUMERIC(15,2)"))
