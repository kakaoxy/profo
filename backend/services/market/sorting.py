"""房源查询排序构建器.

处理房源数据查询的排序逻辑.
"""

from sqlalchemy import asc, case, desc, func
from sqlalchemy.orm import Query

from models import PropertyCurrent, PropertyStatus
from utils.query_params import validate_sort_field


def apply_sorting(query: Query, sort_by: str, sort_order: str) -> Query:
    """应用排序到查询对象.

    Args:
        query: SQLAlchemy 查询对象
        sort_by: 排序字段
        sort_order: 排序方向

    Returns:
        Query: 应用排序后的查询对象

    """
    # 映射排序字段
    sort_field_map = {
        "updated_at": PropertyCurrent.updated_at,
        "created_at": PropertyCurrent.created_at,
        "listed_price_wan": PropertyCurrent.listed_price_wan,
        "sold_price_wan": PropertyCurrent.sold_price_wan,
        "build_area": PropertyCurrent.build_area,
        "rooms": PropertyCurrent.rooms,
        "listed_date": PropertyCurrent.listed_date,
        "sold_date": PropertyCurrent.sold_date,
        # 前端使用的字段映射
        "total_price": case(
            (PropertyCurrent.status == PropertyStatus.FOR_SALE, PropertyCurrent.listed_price_wan),
            else_=PropertyCurrent.sold_price_wan,
        ),
        "unit_price": case(
            (
                PropertyCurrent.status == PropertyStatus.FOR_SALE,
                (PropertyCurrent.listed_price_wan * 10000) / func.nullif(PropertyCurrent.build_area, 0),
            ),
            else_=(PropertyCurrent.sold_price_wan * 10000) / func.nullif(PropertyCurrent.build_area, 0),
        ),
        "timeline": case(
            (PropertyCurrent.status == PropertyStatus.FOR_SALE, PropertyCurrent.listed_date),
            else_=PropertyCurrent.sold_date,
        ),
    }

    # 获取排序字段（白名单验证，非白名单字段回退到默认）
    validated_sort_by = validate_sort_field(sort_by, sort_field_map.keys(), "updated_at")
    sort_field = sort_field_map[validated_sort_by]

    # 应用排序方向
    return query.order_by(asc(sort_field)) if sort_order == "asc" else query.order_by(desc(sort_field))
