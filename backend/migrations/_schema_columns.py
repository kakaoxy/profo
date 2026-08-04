"""Schema 列变更迁移.

包含 l4_marketing_projects / renovation_photos / property_media / project_renovations
等表的列添加、重命名与删除迁移，均为幂等执行。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)


def add_stage_completed_dates_column(engine: Engine) -> None:
    """为 l4_marketing_projects 表添加 stage_completed_dates 列（幂等）.

    存储各改造阶段完成日期，JSON 格式 {stage: "YYYY-MM-DD"}。
    """
    if _column_exists(engine, "l4_marketing_projects", "stage_completed_dates"):
        return
    logger.info("迁移：为 l4_marketing_projects 表添加 stage_completed_dates 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE l4_marketing_projects ADD COLUMN stage_completed_dates JSON"))


def add_thumbnail_url_to_photos(engine: Engine) -> None:
    """为 renovation_photos 与 property_media 表添加 thumbnail_url 列（幂等）.

    存储压缩后缩略图 URL，供列表展示加速使用。
    使用硬编码 DDL 字符串避免 f-string 拼接表名（AGENTS.md §11）。
    """
    from sqlalchemy import text  # noqa: PLC0415

    for table_name in ("renovation_photos", "property_media"):
        if _column_exists(engine, table_name, "thumbnail_url"):
            continue
        logger.info("迁移：为 %s 表添加 thumbnail_url 列", table_name)
        # table_name 来自硬编码元组,无注入风险;DDL 不支持绑定参数
        ddl = "ALTER TABLE " + table_name + " ADD COLUMN thumbnail_url TEXT"
        with engine.begin() as conn:
            conn.execute(text(ddl))


def add_renovation_extra_amount_columns(engine: Engine) -> None:
    """为 project_renovations 表添加定制柜/窗户/墙面处理金额列（幂等）.

    - custom_cabinet_amount / window_amount: 直接 ADD COLUMN（幂等）
    - wall_treatment_amount: 优先 RENAME COLUMN appliance_amount TO wall_treatment_amount
      （兼容已部署旧字段的存量数据）；若 appliance_amount 不存在则 ADD COLUMN。
    - 幂等：通过 _column_exists 检查跳过已存在列。
    - 使用硬编码 DDL 字符串避免 f-string 拼接列名（AGENTS.md §11）。
    """
    from sqlalchemy import text  # noqa: PLC0415

    # 1) custom_cabinet_amount / window_amount：直接加列
    # 列名与类型来自硬编码元组,无注入风险;DDL 不支持绑定参数
    for column_name, column_type_sql in (
        ("custom_cabinet_amount", "NUMERIC(15,2)"),
        ("window_amount", "NUMERIC(15,2)"),
    ):
        if _column_exists(engine, "project_renovations", column_name):
            continue
        logger.info("迁移：为 project_renovations 表添加 %s 列", column_name)
        ddl = "ALTER TABLE project_renovations ADD COLUMN " + column_name + " " + column_type_sql
        with engine.begin() as conn:
            conn.execute(text(ddl))

    # 2) wall_treatment_amount：优先重命名 appliance_amount，否则加列
    if _column_exists(engine, "project_renovations", "wall_treatment_amount"):
        return
    if _column_exists(engine, "project_renovations", "appliance_amount"):
        logger.info("迁移：重命名 project_renovations.appliance_amount → wall_treatment_amount")
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE project_renovations RENAME COLUMN appliance_amount TO wall_treatment_amount"),
            )
        return
    logger.info("迁移：为 project_renovations 表添加 wall_treatment_amount 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_renovations ADD COLUMN wall_treatment_amount NUMERIC(15, 2)"))


def drop_other_decoration_amount_column(engine: Engine) -> None:
    """移除 project_renovations 表的 other_decoration_amount 列（幂等）.

    前端已移除"其他装修"录入项，"其他费用"分组更名为"其他装修"，
    原 other_decoration_amount 列冗余，需移除避免脏数据。
    数据按用户决策丢弃。
    """
    from sqlalchemy import text  # noqa: PLC0415

    if not _column_exists(engine, "project_renovations", "other_decoration_amount"):
        return
    logger.info("迁移：移除 project_renovations.other_decoration_amount 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_renovations DROP COLUMN other_decoration_amount"))


def drop_soft_actual_cost_column(engine: Engine) -> None:
    """移除 project_renovations 表的 soft_actual_cost 列（幂等）.

    前端已移除"软装实际"录入项，后端模型/Schema/Service 白名单同步移除，
    DB 列也需移除以避免脏数据风险。
    """
    from sqlalchemy import text  # noqa: PLC0415

    if not _column_exists(engine, "project_renovations", "soft_actual_cost"):
        return
    logger.info("迁移：移除 project_renovations.soft_actual_cost 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_renovations DROP COLUMN soft_actual_cost"))


def add_contact_person_id_column(engine: Engine) -> None:
    """为 project_renovations 表添加 contact_person_id 列（幂等）."""
    from sqlalchemy import text  # noqa: PLC0415

    if _column_exists(engine, "project_renovations", "contact_person_id"):
        return
    logger.info("迁移：为 project_renovations 表添加 contact_person_id 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_renovations ADD COLUMN contact_person_id VARCHAR(36)"))
