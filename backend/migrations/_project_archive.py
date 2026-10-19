"""项目归档状态迁移.

为 ``projects`` 表补充独立的归档标记列（不动 ProjectStatus 生命周期枚举）：

- is_archived: 归档标记（默认 false）
- archived_at: 归档日期（业务口径，Date 与 finance_settled_date 先例一致）
- archived_note: 归档说明

幂等：逐列 ``_column_exists`` 检查；存量数据无需回填（默认 false）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)


def add_project_archive_columns(engine: Engine) -> None:
    """为 projects 表添加归档状态相关列（幂等）."""
    if not _column_exists(engine, "projects", "is_archived"):
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE projects ADD COLUMN is_archived BOOLEAN NOT NULL DEFAULT false"),
            )
        logger.info("迁移：projects 表新增 is_archived 列")

    if not _column_exists(engine, "projects", "archived_at"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN archived_at DATE"))
        logger.info("迁移：projects 表新增 archived_at 列")

    if not _column_exists(engine, "projects", "archived_note"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN archived_note VARCHAR(500)"))
        logger.info("迁移：projects 表新增 archived_note 列")
