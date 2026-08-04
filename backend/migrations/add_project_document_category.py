"""为 project_documents 表添加 category 列（文书分类）."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def add_project_document_category(engine: Engine) -> None:
    """幂等添加 category 列到 project_documents 表.

    - 若表不存在则跳过（全新安装将由 create_all 创建）
    - 若 category 列不存在：ALTER TABLE ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'other'
      并立即兜底回填存量行（防御性，NOT NULL DEFAULT 通常已赋值）

    幂等：列已存在则完全跳过（无 ALTER、无 UPDATE）。
    """
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _column_exists 定义前导入本模块
    from migrations import _column_exists

    inspector = inspect(engine)
    if "project_documents" not in inspector.get_table_names():
        return

    if _column_exists(engine, "project_documents", "category"):
        return

    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE project_documents ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'other'"),
        )
        # 兜底回填：防止存量行在 DEFAULT 应用前残留 NULL
        conn.execute(text("UPDATE project_documents SET category = 'other' WHERE category IS NULL"))
