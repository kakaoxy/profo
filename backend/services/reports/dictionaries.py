"""报表字典查询服务.

提供报表筛选栏所需的动态字典数据（数据来源/户型/楼层/最近更新时间）.
从 Router 层下沉至 Service 层，遵循 Router→Service→Model 分层约定.
"""

from __future__ import annotations

from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models import PropertyCurrent

DictType = Literal["data_source", "rooms", "floor_level", "last_updated"]


def get_dictionary_items(db: Session, dict_type: DictType) -> list[str]:
    """查询报表字典数据.

    Args:
        db: 数据库会话
        dict_type: 字典类型

    Returns:
        字典项字符串列表

    """
    if dict_type == "data_source":
        query = (
            select(PropertyCurrent.data_source)
            .where(PropertyCurrent.data_source.isnot(None))
            .distinct()
            .order_by(PropertyCurrent.data_source)
        )
        return list(db.execute(query).scalars().all())

    if dict_type == "rooms":
        query = (
            select(PropertyCurrent.rooms)
            .where(PropertyCurrent.rooms.isnot(None))
            .distinct()
            .order_by(PropertyCurrent.rooms)
        )
        return [str(r) for r in db.execute(query).scalars().all()]

    if dict_type == "floor_level":
        query = (
            select(PropertyCurrent.floor_level)
            .where(PropertyCurrent.floor_level.isnot(None))
            .distinct()
            .order_by(PropertyCurrent.floor_level)
        )
        return list(db.execute(query).scalars().all())

    query = select(func.max(PropertyCurrent.updated_at))
    last_updated = db.execute(query).scalar()
    return [last_updated.isoformat()] if last_updated is not None else []
