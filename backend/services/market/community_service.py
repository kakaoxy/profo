"""小区查询服务.

处理小区的查询、搜索和分页逻辑.
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import distinct, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.property import Community, PropertyCurrent
from schemas.community import (
    CommunityCreateRequest,
    CommunityListResponse,
    CommunityResponse,
    DictionaryResponse,
)
from schemas.public import PublicCommunitySearchItem
from services.system.exceptions import ConflictError, ServiceException, ValidationError
from settings import settings
from utils.formatters import escape_like

logger = logging.getLogger(__name__)


class CommunityQueryService:
    """小区查询服务."""

    @staticmethod
    def build_response_from_community(community: Community) -> CommunityResponse:
        return CommunityResponse.model_validate(community)

    @staticmethod
    def search_public_communities(
        db: Session,
        keyword: str,
        limit: int = 20,
    ) -> list[PublicCommunitySearchItem]:
        """C端公开搜索小区.

        Args:
            db: 数据库会话
            keyword: 搜索关键词
            limit: 返回条数限制

        Returns:
            list[PublicCommunitySearchItem]: 搜索结果列表

        """
        communities = (
            db.query(Community)
            .filter(
                Community.is_active.is_(True),
                Community.name.like(f"%{escape_like(keyword)}%"),
            )
            .order_by(Community.name)
            .limit(limit)
            .all()
        )

        return [
            PublicCommunitySearchItem(
                id=c.id,
                name=c.name,
                district=c.district,
                business_circle=c.business_circle,
            )
            for c in communities
        ]

    @staticmethod
    def query_communities(
        db: Session,
        search: str | None = None,
        page: int = 1,
        page_size: int | None = None,
    ) -> CommunityListResponse:
        """查询小区列表.

        Args:
            db: 数据库会话
            search: 小区名称搜索（模糊匹配）
            page: 页码
            page_size: 每页数量

        Returns:
            CommunityListResponse: 分页查询结果

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        stmt = (
            db.query(
                Community,
                func.count(PropertyCurrent.id).label("property_count"),
            )
            .outerjoin(
                PropertyCurrent,
                (PropertyCurrent.community_id == Community.id) & (PropertyCurrent.is_active.is_(True)),
            )
            .filter(
                Community.is_active.is_(True),
            )
        )

        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.filter(Community.name.like(search_pattern))

        stmt = stmt.group_by(Community.id)

        count_query = db.query(func.count(Community.id)).filter(Community.is_active.is_(True))
        if search:
            count_query = count_query.filter(Community.name.like(f"%{search}%"))
        total = count_query.scalar()

        stmt = stmt.order_by(Community.name).offset((page - 1) * effective_page_size).limit(effective_page_size)

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
                created_at=community.created_at,
            )
            items.append(resp)

        logger.info("查询小区完成: 总数=%s, 页码=%s, 每页=%s, 返回=%s", total, page, effective_page_size, len(items))

        return CommunityListResponse(
            total=total,
            items=items,
        )

    @staticmethod
    def query_dictionaries(
        db: Session,
        dict_type: str,
        search: str | None = None,
        limit: int = 50,
    ) -> DictionaryResponse:
        """返回行政区或商圈的去重列表.

        Args:
            db: 数据库会话
            dict_type: 字典类型 ("district" | "business_circle")
            search: 模糊搜索关键词
            limit: 返回数量上限

        Returns:
            DictionaryResponse: 字典响应

        """
        field_map = {
            "district": Community.district,
            "business_circle": Community.business_circle,
        }

        if dict_type not in field_map:
            msg = f"不支持的字典类型: {dict_type}，支持的类型: {list(field_map.keys())}"
            raise ValidationError(msg)

        target_column = field_map[dict_type]

        query = db.query(distinct(target_column)).filter(
            target_column.isnot(None),
            target_column != "",
        )

        if search:
            query = query.filter(target_column.like(f"%{search}%"))

        query = query.order_by(target_column).limit(limit)

        results = query.all()
        values = [r[0] for r in results if r[0]]

        return DictionaryResponse(type=dict_type, items=values)

    @staticmethod
    def create_community(db: Session, body: CommunityCreateRequest) -> CommunityResponse:
        """创建新小区.

        如果同名小区已存在，直接返回已有小区信息.

        Args:
            db: 数据库会话
            body: 小区创建请求数据

        Returns:
            CommunityResponse: 创建的小区响应

        Raises:
            ServiceException: 数据库操作失败时

        """
        existing = _find_existing_community_by_name(db, body.name)

        if existing:
            logger.info("小区已存在，直接返回: %s (ID: %s)", existing.name, existing.id)
            return CommunityQueryService.build_response_from_community(existing)

        new_community = Community(
            id=str(uuid.uuid4()),
            name=body.name.strip(),
            district=body.district,
            business_circle=body.business_circle,
            city_id=None,
            avg_price_wan=None,
            total_properties=0,
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        db.add(new_community)

        try:
            db.commit()
            db.refresh(new_community)
            logger.info("创建新小区成功: %s (ID: %s)", new_community.name, new_community.id)
        except IntegrityError as e:
            db.rollback()
            logger.warning("创建小区时发生唯一约束冲突: %s, 错误: %s", body.name, e)
            existing = _find_existing_community_by_name(db, body.name)
            if existing:
                return CommunityQueryService.build_response_from_community(existing)
            raise ServiceException("创建小区失败") from e
        except Exception:
            db.rollback()
            logger.exception("创建小区发生数据库错误")
            raise ServiceException("创建小区失败")

        return CommunityQueryService.build_response_from_community(new_community)


def _find_existing_community_by_name(db: Session, name: str) -> Community | None:
    """根据名称查找已存在的小区（不区分大小写）.

    Args:
        db: 数据库会话
        name: 小区名称

    Returns:
        找到的小区对象，不存在则返回 None

    """
    return (
        db.query(Community)
        .filter(
            Community.name.ilike(name),
            Community.is_active.is_(True),
        )
        .first()
    )


# 依赖注入工厂函数
def get_community_service() -> CommunityQueryService:
    """获取小区查询服务实例."""
    return CommunityQueryService()
