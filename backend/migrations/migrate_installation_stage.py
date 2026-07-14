"""迁移安装阶段数据到交付阶段."""

from sqlalchemy import text
from sqlalchemy.engine import Engine


def migrate_installation_stage_to_delivery(engine: Engine) -> None:
    """将 projects.renovation_stage='安装' 和 renovation_photos.stage='安装' 迁移为 '交付'."""
    with engine.begin() as conn:
        # 迁移项目装修阶段
        conn.execute(text("UPDATE projects SET renovation_stage = '交付' WHERE renovation_stage = '安装'"))
        # 迁移装修照片阶段
        conn.execute(text("UPDATE renovation_photos SET stage = '交付' WHERE stage = '安装'"))
