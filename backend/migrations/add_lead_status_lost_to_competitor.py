"""为 PostgreSQL leadstatus enum 收敛新增 'LOST_TO_COMPETITOR' 值（他司已成交终态）.

LeadStatus 枚举新增 LOST_TO_COMPETITOR = "lost_to_competitor"。leads.status 使用
SQLEnum(LeadStatus) 且未配 values_callable，SQLAlchemy 以枚举成员 .name（大写）
作为数据库原生 enum 标签做 bind（实测发送 'LOST_TO_COMPETITOR'）。因此 PG enum
标签必须统一为大写，与既有五个大写标签（PENDING_ASSESSMENT/PENDING_VISIT/
REJECTED/VISITED/SIGNED）一致；API/OpenAPI 层不受影响，继续使用小写 value
（"lost_to_competitor"），本次不改任何 API 语义/schema/Service 代码。

幂等收敛策略（三分支）：
- pg_type 检查 ``leadstatus`` 类型是否存在；不存在时输出告警并安全返回
  （类型由 Base.metadata.create_all 创建后再次启动即会补齐该值）
- pg_enum 已存在大写 'LOST_TO_COMPETITOR' → 直接返回（幂等复验通过）
- 仅存在小写 'lost_to_competitor'（历史脏数据）→ ALTER TYPE ... RENAME VALUE
  改名为大写，保留标签在枚举中的位置与既有引用
- 两者皆无（全新环境）→ ALTER TYPE ... ADD VALUE IF NOT EXISTS 添加大写值

PG 兼容性：ALTER TYPE ... ADD VALUE / RENAME VALUE 在 PG 12+ 允许在事务块内执行
（与既有迁移 migrate_add_ended_status 的执行方式一致）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _pg_quote_literal

logger = logging.getLogger(__name__)

_ENUM_LABEL = "LOST_TO_COMPETITOR"
_LEGACY_LOWER_LABEL = "lost_to_competitor"


def add_lead_status_lost_to_competitor(engine: Engine) -> None:
    """幂等收敛 PostgreSQL 原生 enum 类型 leadstatus 至含大写 'LOST_TO_COMPETITOR'.

    Args:
        engine: SQLAlchemy Engine 实例

    """
    if engine.dialect.name != "postgresql":
        return

    with engine.connect() as conn:
        type_exists = conn.execute(
            text("SELECT 1 FROM pg_type WHERE typname = 'leadstatus'"),
        ).scalar()
    if not type_exists:
        logger.warning("迁移：leadstatus enum type 不存在，跳过同步（应由 create_all 创建）")
        return

    with engine.begin() as conn:
        labels = {
            row[0]
            for row in conn.execute(
                text(
                    "SELECT e.enumlabel FROM pg_enum e "
                    "JOIN pg_type t ON e.enumtypid = t.oid "
                    "WHERE t.typname = 'leadstatus'",
                ),
            )
        }
        if _ENUM_LABEL in labels:
            return
        if _LEGACY_LOWER_LABEL in labels:
            conn.execute(
                text(
                    f"ALTER TYPE leadstatus RENAME VALUE {_pg_quote_literal(_LEGACY_LOWER_LABEL)} "
                    f"TO {_pg_quote_literal(_ENUM_LABEL)}",
                ),
            )
            logger.info("迁移：leadstatus enum 小写 'lost_to_competitor' 已改名为 'LOST_TO_COMPETITOR'")
            return
        conn.execute(text(f"ALTER TYPE leadstatus ADD VALUE IF NOT EXISTS {_pg_quote_literal(_ENUM_LABEL)}"))
        logger.info("迁移：leadstatus enum 新增值 'LOST_TO_COMPETITOR'")
