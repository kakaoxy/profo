"""重建 idx_contract_no 为部分唯一索引并清理已删除项目的合同记录.

问题根因：
- idx_contract_no 原为普通唯一索引，不区分 is_deleted
- 项目软删除时未同步软删除合同记录，导致已删除项目的合同编号被永久占用
- 用户尝试用相同合同编号创建新项目时触发 UniqueViolation

修复内容：
1. 软删除已删除项目（projects.is_deleted=true）对应的合同记录
2. 重建 idx_contract_no 为部分唯一索引（WHERE is_deleted = false），
   仅对未删除记录强制唯一，允许已删除项目的合同编号被复用

幂等性：
- 软删除：仅更新 is_deleted=false 的记录，重复执行无副作用
- 索引重建：DROP INDEX IF EXISTS + CREATE UNIQUE INDEX IF NOT EXISTS
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def rebuild_contract_no_index(engine: Engine) -> None:
    """重建 idx_contract_no 为部分唯一索引并清理已删除项目的合同记录（幂等）.

    Args:
        engine: SQLAlchemy 引擎

    """
    inspector = inspect(engine)
    if "project_contracts" not in inspector.get_table_names():
        return
    if engine.dialect.name != "postgresql":
        return

    # 1. 软删除已删除项目对应的合同记录（释放合同编号）
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE project_contracts SET is_deleted = true, updated_at = NOW() "
                "WHERE is_deleted = false "
                "AND project_id IN (SELECT id FROM projects WHERE is_deleted = true)"
            ),
        )
        if result.rowcount:
            logger.info("迁移：软删除 %d 条已删除项目的合同记录", result.rowcount)

    # 2. 重建 idx_contract_no 为部分唯一索引
    #    先 DROP 旧索引（普通唯一索引），再 CREATE 新索引（部分唯一索引）
    #    CREATE UNIQUE INDEX IF NOT EXISTS 不会检查 WHERE 子句是否一致，
    #    因此必须先 DROP 再 CREATE
    with engine.connect() as conn:
        index_exists = conn.execute(
            text("SELECT 1 FROM pg_indexes WHERE indexname = 'idx_contract_no' LIMIT 1"),
        ).first()

    if index_exists:
        # 检查当前索引是否已是部分索引（WHERE 子句存在）
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_contract_no'"),
            ).first()

        if row and "WHERE (is_deleted = false)" in row[0]:
            # 已是部分唯一索引，无需重建
            return

        logger.info("迁移：重建 idx_contract_no 为部分唯一索引（WHERE is_deleted = false）")
        with engine.begin() as conn:
            conn.execute(text("DROP INDEX IF EXISTS idx_contract_no"))
            conn.execute(
                text("CREATE UNIQUE INDEX idx_contract_no ON project_contracts (contract_no) WHERE is_deleted = false"),
            )
