"""钥匙管理普通密码组序号迁移.

为 project_normal_keys 表添加 seq 列（房源内稳定序号）并回填存量数据：
- 加列：幂等（_column_exists 检查），NOT NULL DEFAULT 0
- 回填：对每个含 seq=0 行的房源，按 created_at ASC, id ASC 整体重编号 1..N
  （整体重编号保证中断重跑幂等；只处理存在 seq=0 的房源，已正常编号的行不动）
"""

import logging
import uuid

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)


def add_normal_key_seq_column(engine: Engine) -> None:
    """为 project_normal_keys 表添加 seq 列并回填存量序号（幂等）."""
    if not _column_exists(engine, "project_normal_keys", "seq"):
        logger.info("迁移：为 project_normal_keys 表添加 seq 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE project_normal_keys ADD COLUMN seq INTEGER NOT NULL DEFAULT 0"))

    # 回填：单事务内处理所有仍存在 seq=0 行的房源（整体重编号，幂等）
    with engine.begin() as conn:
        project_rows = conn.execute(text("SELECT DISTINCT project_id FROM project_normal_keys WHERE seq = 0")).all()
        if not project_rows:
            return
        logger.info("迁移：回填 project_normal_keys.seq（%d 个房源）", len(project_rows))
        for (project_id,) in project_rows:
            row_ids = (
                conn.execute(
                    text("SELECT id FROM project_normal_keys WHERE project_id = :pid ORDER BY created_at ASC, id ASC"),
                    {"pid": str(project_id)},
                )
                .scalars()
                .all()
            )
            for index, row_id in enumerate(row_ids, start=1):
                conn.execute(
                    text("UPDATE project_normal_keys SET seq = :seq WHERE id = :id"),
                    {"seq": index, "id": str(row_id)},
                )
            logger.info("迁移：房源 %s 序号回填完成（%d 组）", uuid.UUID(str(project_id)), len(row_ids))
