"""房产信息服务层.

处理单个房产详情查询和小区的快速搜索.
"""

import logging

from sqlalchemy.orm import Session

from models import Community, PropertyCurrent, PropertyMedia
from schemas import CommunitySearchResponse, PropertyDetailResponse

logger = logging.getLogger(__name__)


class PropertyService:
    """房产信息服务."""

    def get_detail(self, db: Session, property_id: int) -> PropertyDetailResponse:
        """获取房源详情.

        Args:
            db: 数据库会话
            property_id: 房源ID

        Returns:
            PropertyDetailResponse: 房源详情

        Raises:
            ValueError: 房源不存在或已删除

        """
        property_obj = (
            db.query(PropertyCurrent)
            .filter(
                PropertyCurrent.id == property_id,
                PropertyCurrent.is_active.is_(True),
            )
            .first()
        )
        if not property_obj:
            msg = "房源不存在"
            raise ValueError(msg)

        community = db.query(Community).filter(Community.id == property_obj.community_id).first()
        if not community:
            msg = "关联小区不存在"
            raise ValueError(msg)

        detail = PropertyDetailResponse.from_orm_with_calculations(property_obj, community)

        picture_links = (
            db.query(PropertyMedia.url)
            .filter(
                PropertyMedia.data_source == property_obj.data_source,
                PropertyMedia.source_property_id == property_obj.source_property_id,
            )
            .order_by(PropertyMedia.sort_order)
            .all()
        )
        detail.picture_links = [link[0] for link in picture_links] if picture_links else []

        return detail

    def search_communities(self, db: Session, q: str) -> list[CommunitySearchResponse]:
        """按名称搜索小区.

        Args:
            db: 数据库会话
            q: 搜索关键词

        Returns:
            list[CommunitySearchResponse]: 匹配的小区列表

        """
        results = db.query(Community).filter(Community.name.contains(q)).limit(20).all()
        return [
            CommunitySearchResponse(
                id=c.id,
                name=c.name,
                district=c.district,
                business_circle=c.business_circle,
            )
            for c in results
        ]


def get_property_service() -> PropertyService:
    """获取房产信息服务实例."""
    return PropertyService()
