"""
房源查询排序构建器
处理房源数据查询的排序逻辑
"""
from sqlalchemy.orm import Query
from sqlalchemy import desc, asc, case

from models import PropertyCurrent, PropertyStatus


def apply_sorting(query: Query, sort_by: str, sort_order: str) -> Query:
    """
    应用排序到查询对象

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
            else_=PropertyCurrent.sold_price_wan
        ),
        "unit_price": case(
            (PropertyCurrent.status == PropertyStatus.FOR_SALE,
             (PropertyCurrent.listed_price_wan * 10000) / PropertyCurrent.build_area),
            else_=(PropertyCurrent.sold_price_wan * 10000) / PropertyCurrent.build_area
        ),
        "timeline": case(
            (PropertyCurrent.status == PropertyStatus.FOR_SALE, PropertyCurrent.listed_date),
            else_=PropertyCurrent.sold_date
        )
    }

    # 获取排序字段
    sort_field = sort_field_map.get(sort_by, PropertyCurrent.updated_at)

    # 应用排序方向
    if sort_order == "asc":
        query = query.order_by(asc(sort_field))
    else:
        query = query.order_by(desc(sort_field))

    return query
