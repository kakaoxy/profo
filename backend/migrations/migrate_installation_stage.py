"""迁移安装阶段数据到交付阶段."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def migrate_installation_stage_to_delivery(engine: Engine) -> None:
    """将 projects/renovation_photos/l4_marketing_media 中 '安装' 阶段数据迁移为 '交付'.

    覆盖所有使用 RenovationStage 枚举的列：
    - projects.renovation_stage
    - renovation_photos.stage
    - l4_marketing_media.renovation_stage (L4 营销媒体，曾遗漏导致列表 500)

    幂等：通过检查 PG enum 是否仍包含 '安装' 值判断是否需要迁移。
    若 enum 已不包含 '安装'（说明已迁移过），直接跳过，避免 PG enum 严格校验报错。
    """
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    target_tables = ("projects", "renovation_photos", "l4_marketing_media")
    if not any(t in existing_tables for t in target_tables):
        return

    with engine.begin() as conn:
        # 检查 renovationstage enum 是否仍包含 '安装' 值
        # 若 enum 已移除该值，说明已迁移过，跳过（PG enum 严格校验，直接 WHERE 会报错）
        has_installation = conn.execute(
            text(
                "SELECT 1 FROM pg_enum e "
                "JOIN pg_type t ON e.enumtypid = t.oid "
                "WHERE t.typname = 'renovationstage' AND e.enumlabel = '安装' "
                "LIMIT 1"
            ),
        ).first()
        if not has_installation:
            return

        # 迁移项目装修阶段
        if "projects" in existing_tables:
            conn.execute(text("UPDATE projects SET renovation_stage = '交付' WHERE renovation_stage = '安装'"))
        # 迁移装修照片阶段
        if "renovation_photos" in existing_tables:
            conn.execute(text("UPDATE renovation_photos SET stage = '交付' WHERE stage = '安装'"))
        # 迁移 L4 营销媒体装修阶段（曾遗漏，导致列表接口迭代 AppenderQuery 时报 LookupError）
        if "l4_marketing_media" in existing_tables:
            conn.execute(
                text("UPDATE l4_marketing_media SET renovation_stage = '交付' WHERE renovation_stage = '安装'"),
            )
