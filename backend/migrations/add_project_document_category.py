"""为 project_documents 表添加 category 列（文书分类）."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def add_project_document_category(engine: Engine) -> None:
    """幂等添加 category 列到 project_documents 表.

    - 若表不存在则跳过（全新安装将由 create_all 创建）
    - 若 category 列不存在：ALTER TABLE ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'other'
    - 兜底回填：UPDATE ... SET category = 'other' WHERE category IS NULL
      （NOT NULL DEFAULT 在加列时已对存量行赋值，此处仅为防御性幂等回填）

    幂等：列已存在则跳过 ALTER；UPDATE 对非 NULL 行无副作用。
    """
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _column_exists 定义前导入本模块
    from migrations import _column_exists  # noqa: PLC0415

    inspector = inspect(engine)
    if "project_documents" not in inspector.get_table_names():
        return

    if not _column_exists(engine, "project_documents", "category"):
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE project_documents ADD COLUMN category VARCHAR(50) NOT NULL DEFAULT 'other'"),
            )

    # 兜底回填：防止存量行在 DEFAULT 应用前残留 NULL
    with engine.begin() as conn:
        conn.execute(text("UPDATE project_documents SET category = 'other' WHERE category IS NULL"))
