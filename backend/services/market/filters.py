"""
房源查询筛选条件构建器
处理房源数据查询的各种筛选条件
"""
import logging
from typing import Optional, List

from sqlalchemy.orm import Query
from sqlalchemy import or_, and_

from models import PropertyCurrent, Community, PropertyStatus

logger = logging.getLogger(__name__)


def apply_filters(
    query: Query,
    status: Optional[str] = None,
    community_name: Optional[str] = None,
    districts: Optional[List[str]] = None,
    business_circles: Optional[List[str]] = None,
    orientations: Optional[List[str]] = None,
    floor_levels: Optional[List[str]] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    min_area: Optional[float] = None,
    max_area: Optional[float] = None,
    rooms: Optional[List[int]] = None,
    rooms_gte: Optional[int] = None
) -> Query:
    """
    应用筛选条件到查询对象

    Args:
        query: SQLAlchemy 查询对象
        status: 房源状态
        community_name: 小区名称
        districts: 行政区
        business_circles: 商圈
        orientations: 朝向
        floor_levels: 楼层级别
        min_price: 最低价格
        max_price: 最高价格
        min_area: 最小面积
        max_area: 最大面积
        rooms: 室数量列表
        rooms_gte: 最少室数量

    Returns:
        Query: 应用筛选后的查询对象
    """
    # 状态筛选
    if status:
        valid_statuses = ["在售", "成交"]
        if status in valid_statuses:
            if status == "在售":
                query = query.filter(PropertyCurrent.status == PropertyStatus.FOR_SALE)
            elif status == "成交":
                query = query.filter(PropertyCurrent.status == PropertyStatus.SOLD)
        else:
            logger.warning(f"未知状态筛选值: {status}，有效值为: {valid_statuses}")

    # 小区名称模糊搜索
    if community_name:
        query = query.filter(Community.name.like(f"%{community_name}%"))

    # 行政区筛选（多选）
    if districts:
        query = query.filter(Community.district.in_(districts))

    # 商圈筛选（多选）
    if business_circles:
        query = query.filter(Community.business_circle.in_(business_circles))

    # 价格范围筛选
    if min_price is not None or max_price is not None:
        # 根据状态选择价格字段
        if status == "在售":
            if min_price is not None:
                query = query.filter(PropertyCurrent.listed_price_wan >= min_price)
            if max_price is not None:
                query = query.filter(PropertyCurrent.listed_price_wan <= max_price)
        elif status == "成交":
            if min_price is not None:
                query = query.filter(PropertyCurrent.sold_price_wan >= min_price)
            if max_price is not None:
                query = query.filter(PropertyCurrent.sold_price_wan <= max_price)
        else:
            # 状态为空时，同时考虑挂牌价和成交价
            price_conditions = []
            if min_price is not None:
                price_conditions.append(
                    or_(
                        PropertyCurrent.listed_price_wan >= min_price,
                        PropertyCurrent.sold_price_wan >= min_price
                    )
                )
            if max_price is not None:
                price_conditions.append(
                    or_(
                        PropertyCurrent.listed_price_wan <= max_price,
                        PropertyCurrent.sold_price_wan <= max_price
                    )
                )
            if price_conditions:
                query = query.filter(and_(*price_conditions))

    # 面积范围筛选
    if min_area is not None:
        query = query.filter(PropertyCurrent.build_area >= min_area)
    if max_area is not None:
        query = query.filter(PropertyCurrent.build_area <= max_area)

    # 户型筛选
    if rooms:
        query = query.filter(PropertyCurrent.rooms.in_(rooms))
    if rooms_gte is not None:
        query = query.filter(PropertyCurrent.rooms >= rooms_gte)

    # 楼层级别筛选（多选）
    if floor_levels:
        query = query.filter(PropertyCurrent.floor_level.in_(floor_levels))

    # 朝向筛选（包含任意关键字）
    if orientations:
        orientation_conditions = []
        for ori in orientations:
            if ori:
                orientation_conditions.append(PropertyCurrent.orientation.like(f"%{ori}%"))
        if orientation_conditions:
            query = query.filter(or_(*orientation_conditions))

    return query
