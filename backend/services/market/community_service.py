"""小区查询服务.

处理小区的查询、搜索和分页逻辑.
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import distinct, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models.property import Community, CommunityAlias, PropertyCurrent
from schemas.community import (
    CommunityAliasResponse,
    CommunityCreateRequest,
    CommunityListResponse,
    CommunityResponse,
    CommunityUpdateRequest,
    DictionaryResponse,
)
from schemas.public import PublicCommunitySearchItem
from services.system.exceptions import ConflictError, ResourceNotFoundError, ServiceException, ValidationError
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
            search_pattern = f"%{escape_like(search)}%"
            stmt = stmt.filter(Community.name.like(search_pattern, escape="\\"))

        stmt = stmt.group_by(Community.id)

        count_query = db.query(func.count(Community.id)).filter(Community.is_active.is_(True))
        if search:
            count_query = count_query.filter(Community.name.like(f"%{escape_like(search)}%", escape="\\"))
        total = count_query.scalar()

        stmt = stmt.order_by(Community.name).offset((page - 1) * effective_page_size).limit(effective_page_size)

        results = stmt.all()

        community_ids = [community.id for community, _ in results]
        aliases_map = _fetch_aliases_map(db, community_ids)

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
                is_active=community.is_active,
                created_at=community.created_at,
                aliases=aliases_map.get(community.id, []),
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
        district: str | None = None,
    ) -> DictionaryResponse:
        """返回行政区或商圈的去重列表.

        Args:
            db: 数据库会话
            dict_type: 字典类型 ("district" | "business_circle")
            search: 模糊搜索关键词
            limit: 返回数量上限
            district: 区域（行政区）精确过滤；None/空串时不限制

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

        # 区域精确过滤（对 business_circle 字典生效；district 字典传此参数无意义但无害）
        if district:
            query = query.filter(Community.district == district)

        if search:
            query = query.filter(target_column.like(f"%{escape_like(search)}%", escape="\\"))

        query = query.order_by(target_column).limit(limit)

        results = query.all()
        values = [r[0] for r in results if r[0]]

        return DictionaryResponse(type=dict_type, items=values)

    @staticmethod
    def query_business_circles(
        db: Session,
        district: str | None = None,
        search: str | None = None,
        limit: int = 200,
    ) -> DictionaryResponse:
        """按区域返回去重商圈字典列表.

        Args:
            db: 数据库会话
            district: 区域（行政区）精确过滤；None/空串时不限制
            search: 商圈名称模糊搜索
            limit: 返回数量上限

        Returns:
            DictionaryResponse: 商圈字典响应 (type="business_circle")

        """
        return CommunityQueryService.query_dictionaries(
            db=db,
            dict_type="business_circle",
            search=search,
            limit=limit,
            district=district,
        )

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
            id=uuid.uuid4(),
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
            msg = "创建小区失败"
            raise ServiceException(msg) from e
        except Exception:
            db.rollback()
            logger.exception("创建小区发生数据库错误")
            msg = "创建小区失败"
            raise ServiceException(msg) from None

        return CommunityQueryService.build_response_from_community(new_community)

    @staticmethod
    def update_community(db: Session, community_id: str, body: CommunityUpdateRequest) -> CommunityResponse:
        """更新小区信息.

        仅更新 body 中显式提供的字段（PATCH 语义）.

        Args:
            db: 数据库会话
            community_id: 小区ID
            body: 小区更新请求数据

        Returns:
            CommunityResponse: 更新后的小区响应

        Raises:
            ResourceNotFoundError: 小区不存在
            ConflictError: 小区名称冲突
            ServiceException: 数据库操作失败

        """
        community = db.query(Community).filter(Community.id == community_id).first()
        if not community:
            msg = "小区不存在"
            raise ResourceNotFoundError(msg)

        update_data = body.model_dump(exclude_unset=True)

        try:
            for field, value in update_data.items():
                setattr(community, field, value)

            db.commit()
            db.refresh(community)
            logger.info("更新小区成功: %s (ID: %s)", community.name, community.id)
        except IntegrityError as e:
            db.rollback()
            logger.warning("更新小区时发生唯一约束冲突: %s, 错误: %s", community_id, e)
            msg = "小区名称已存在"
            raise ConflictError(msg) from e
        except Exception:
            db.rollback()
            logger.exception("更新小区发生数据库错误")
            msg = "更新小区失败"
            raise ServiceException(msg) from None

        aliases_map = _fetch_aliases_map(db, [community.id])
        resp = CommunityQueryService.build_response_from_community(community)
        resp.aliases = aliases_map.get(community.id, [])
        return resp


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
            func.lower(Community.name).like(escape_like(name).lower(), escape="\\"),
            Community.is_active.is_(True),
        )
        .first()
    )


def _fetch_aliases_map(
    db: Session,
    community_ids: list[str],
) -> dict[str, list[CommunityAliasResponse]]:
    """单次查询批量获取小区别名(合并历史),按 community_id 分组.

    过滤软删除项,避免 N+1 查询.

    Args:
        db: 数据库会话
        community_ids: 需要查询别名的小区ID列表

    Returns:
        dict[str, list[CommunityAliasResponse]]: community_id -> 别名响应列表

    """
    if not community_ids:
        return {}

    aliases: list[CommunityAlias] = (
        db.query(CommunityAlias)
        .filter(
            CommunityAlias.community_id.in_(community_ids),
            CommunityAlias.is_deleted.is_(False),
        )
        .all()
    )

    grouped: dict[str, list[CommunityAliasResponse]] = {}
    for alias in aliases:
        grouped.setdefault(alias.community_id, []).append(CommunityAliasResponse.model_validate(alias))
    return grouped


# 依赖注入工厂函数
def get_community_service() -> CommunityQueryService:
    """获取小区查询服务实例."""
    return CommunityQueryService()
