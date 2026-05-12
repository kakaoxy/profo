"""
小区查询服务
处理小区的查询、搜索和分页逻辑
"""
import logging
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import Optional

from models.property import Community, PropertyCurrent
from schemas.community import (
    CommunityListResponse,
    CommunityResponse,
    DictionaryResponse,
)

logger = logging.getLogger(__name__)


class CommunityQueryService:
    """小区查询服务"""

    @staticmethod
    def _build_response(community: Community) -> CommunityResponse:
        return CommunityResponse(
            id=community.id,
            name=community.name,
            city_id=community.city_id,
            district=community.district,
            business_circle=community.business_circle,
            avg_price_wan=community.avg_price_wan,
            total_properties=community.total_properties,
            created_at=community.created_at
        )

    @staticmethod
    def query_communities(
        db: Session,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50
    ) -> CommunityListResponse:
        """
        查询小区列表

        Args:
            db: 数据库会话
            search: 小区名称搜索（模糊匹配）
            page: 页码
            page_size: 每页数量

        Returns:
            CommunityListResponse: 分页查询结果
        """
        stmt = db.query(
            Community,
            func.count(PropertyCurrent.id).label('property_count')
        ).outerjoin(
            PropertyCurrent,
            (PropertyCurrent.community_id == Community.id) & (PropertyCurrent.is_active.is_(True))
        ).filter(
            Community.is_active.is_(True)
        )

        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.filter(Community.name.like(search_pattern))

        stmt = stmt.group_by(Community.id)

        count_query = db.query(func.count(Community.id)).filter(Community.is_active.is_(True))
        if search:
            count_query = count_query.filter(Community.name.like(f"%{search}%"))
        total = count_query.scalar()

        stmt = stmt.order_by(Community.name).offset((page - 1) * page_size).limit(page_size)

        results = stmt.all()

        items = []
        for community, p_count in results:
            resp = CommunityResponse(
                id=community.id,
                name=community.name,
                city_id=community.city_id,
                district=community.district,
                business_circle=community.business_circle,
                avg_price_wan=community.avg_price_wan,
                total_properties=p_count,
                created_at=community.created_at
            )
            items.append(resp)

        logger.info(f"查询小区完成: 总数={total}, 页码={page}, 每页={page_size}, 返回={len(items)}")

        return CommunityListResponse(
            total=total,
            items=items
        )

    @staticmethod
    def query_dictionaries(
        db: Session,
        type: str,
        search: Optional[str] = None,
        limit: int = 50,
    ) -> DictionaryResponse:
        """
        返回行政区或商圈的去重列表

        Args:
            db: 数据库会话
            type: 字典类型 ("district" | "business_circle")
            search: 模糊搜索关键词
            limit: 返回数量上限

        Returns:
            DictionaryResponse: 字典响应
        """
        field_map = {
            "district": Community.district,
            "business_circle": Community.business_circle
        }

        if type not in field_map:
            raise ValueError(f"不支持的字典类型: {type}，支持的类型: {list(field_map.keys())}")

        target_column = field_map[type]

        query = db.query(distinct(target_column)).filter(
            target_column.isnot(None),
            target_column != ""
        )

        if search:
            query = query.filter(target_column.like(f"%{search}%"))

        query = query.order_by(target_column).limit(limit)

        results = query.all()
        values = [r[0] for r in results if r[0]]

        return DictionaryResponse(type=type, items=values)


def _find_existing_community_by_name(db: Session, name: str) -> Community | None:
    """
    根据名称查找已存在的小区（不区分大小写）

    Args:
        db: 数据库会话
        name: 小区名称

    Returns:
        找到的小区对象，不存在则返回 None
    """
    return db.query(Community).filter(
        Community.name.ilike(name),
        Community.is_active.is_(True)
    ).first()