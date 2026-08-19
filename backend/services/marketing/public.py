"""C端公开项目服务.

职责: 处理C端公开项目相关的数据库查询.
"""

from sqlalchemy import Integer, and_, case, cast, desc, func, or_
from sqlalchemy.orm import Query, Session

from models import Community, L4MarketingMedia, L4MarketingProject, User
from models.marketing.l4_marketing import MarketingProjectStatus, PhotoCategory, PublishStatus
from settings import settings
from utils.formatters import escape_like
from utils.image_processing import derive_thumbnail_url
from utils.query_params import validate_sort_field


class PublicProjectService:
    """C端公开项目服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve_cover_images_batch(self, items: list[L4MarketingProject]) -> dict[int, tuple[str | None, str | None]]:
        """批量解析项目封面图片和缩略图 URL.

        封面图选择规则：优先营销照片（photo_category == 'marketing'）中
        sort_order 最小的一张；仅当无营销照片时才回退到改造照片（renovation）。
        分类信息只存在于 L4MarketingMedia 表（images JSON 数组为扁平 URL 列表，
        无法区分营销/改造），故统一按 in_(ids) 批量查询媒体表一次（避免 N+1），
        再按项目分组挑选。无任何媒体记录的项目回退到 images 数组首张。

        Returns:
            {item.id: (cover_image, cover_thumbnail_url)}

        """
        result: dict[int, tuple[str | None, str | None]] = {item.id: (None, None) for item in items}
        if not result:
            return result

        media_rows = (
            self.db.query(L4MarketingMedia)
            .filter(
                L4MarketingMedia.marketing_project_id.in_(list(result)),
                L4MarketingMedia.is_deleted.is_(False),
                L4MarketingMedia.media_type == "image",
            )
            .order_by(
                L4MarketingMedia.marketing_project_id,
                L4MarketingMedia.sort_order,
                L4MarketingMedia.id,
            )
            .all()
        )

        grouped: dict[int, list[L4MarketingMedia]] = {}
        for media in media_rows:
            grouped.setdefault(media.marketing_project_id, []).append(media)

        for project_id, rows in grouped.items():
            # 营销照片优先，无营销照片则回退到该房源首张（改造照片）
            marketing = next((m for m in rows if m.photo_category == PhotoCategory.MARKETING), None)
            chosen = marketing if marketing is not None else rows[0]
            result[project_id] = (chosen.file_url, chosen.thumbnail_url)

        # 无媒体记录的项目回退到 images JSON 数组首张，按命名规则推导缩略图
        for item in items:
            if result[item.id][0] is None:
                images = item.images or []
                if images:
                    result[item.id] = (images[0], derive_thumbnail_url(images[0]))

        return result

    def _apply_keyword_floor_filters(
        self,
        query: Query[L4MarketingProject],
        keyword: str | None,
        min_floor: int | None,
        max_floor: int | None,
    ) -> Query[L4MarketingProject]:
        """应用关键词与楼层筛选（get_published_projects 与 get_sold_projects 共用）.

        keyword 同时模糊匹配小区名(community_name)与商圈(Community.business_circle)，
        需 LEFT JOIN Community 表；floor_info 为 "15/28层" 字符串，楼层筛选时用
        split_part 提取 / 前数字并 CAST 为整数比较。
        """
        if keyword:
            kw = f"%{escape_like(keyword)}%"
            # JOIN Community 后按 OR 匹配小区名或商圈；JOIN 会过滤掉无 Community 记录的项目，
            # 故先 OR community_name 自身模糊匹配，保证无 Community 关联也能命中小区名
            query = query.outerjoin(Community, Community.id == L4MarketingProject.community_id).filter(
                or_(
                    L4MarketingProject.community_name.like(kw),
                    Community.business_circle.like(kw),
                )
            )
        if min_floor is not None or max_floor is not None:
            # floor_info 格式如 "2/共6层" 或 "15/28层"，仅对以「数字/」开头的记录筛选，避免 CAST 异常
            query = query.filter(L4MarketingProject.floor_info.regexp_match(r"^\d+/"))
            floor_num = cast(func.split_part(L4MarketingProject.floor_info, "/", 1), Integer)
            if min_floor is not None:
                query = query.filter(floor_num >= min_floor)
            if max_floor is not None:
                query = query.filter(floor_num <= max_floor)
        return query

    def get_published_projects(
        self,
        project_status: str | None = None,
        keyword: str | None = None,
        layout: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        min_area: float | None = None,
        max_area: float | None = None,
        min_floor: int | None = None,
        max_floor: int | None = None,
        sort_by: str = "sort_order",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[list[L4MarketingProject], int]:
        """获取已发布的房源列表.

        layout 改为前缀 LIKE 匹配，使「三室」命中「三室两厅」等。
        keyword 与 floor 筛选见 _apply_keyword_floor_filters。
        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
            L4MarketingProject.is_deleted.is_(False),
        )

        if project_status:
            query = query.filter(L4MarketingProject.project_status == project_status)
        query = self._apply_keyword_floor_filters(query, keyword, min_floor, max_floor)
        if layout:
            query = query.filter(L4MarketingProject.layout.like(f"{escape_like(layout)}%"))
        if min_price is not None:
            query = query.filter(L4MarketingProject.total_price >= min_price)
        if max_price is not None:
            query = query.filter(L4MarketingProject.total_price <= max_price)
        if min_area is not None:
            query = query.filter(L4MarketingProject.area >= min_area)
        if max_area is not None:
            query = query.filter(L4MarketingProject.area <= max_area)

        total = query.count()

        allowed_sort_fields = {
            "sort_order": L4MarketingProject.sort_order,
            "created_at": L4MarketingProject.created_at,
            "total_price": L4MarketingProject.total_price,
            "unit_price": L4MarketingProject.unit_price,
            "area": L4MarketingProject.area,
        }
        validated_sort_by = validate_sort_field(sort_by, allowed_sort_fields.keys(), "sort_order")
        if validated_sort_by == "sort_order":
            # 权重排序：与 admin 侧一致，权重越大越靠前，相同权重按创建时间倒序
            query = query.order_by(
                desc(L4MarketingProject.sort_order),
                desc(L4MarketingProject.created_at),
            )
        else:
            sort_column = allowed_sort_fields[validated_sort_by]
            query = query.order_by(sort_column.asc() if sort_order == "asc" else sort_column.desc())

        offset = (page - 1) * effective_page_size
        items = query.offset(offset).limit(effective_page_size).all()

        return items, total

    def get_sold_projects(
        self,
        keyword: str | None = None,
        min_floor: int | None = None,
        max_floor: int | None = None,
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[list[L4MarketingProject], int]:
        """获取已成交的房源案例列表."""
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value,
            L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
            L4MarketingProject.is_deleted.is_(False),
        )

        query = self._apply_keyword_floor_filters(query, keyword, min_floor, max_floor)

        total = query.count()
        items = (
            query.order_by(
                desc(L4MarketingProject.sort_order),
                desc(L4MarketingProject.created_at),
            )
            .offset((page - 1) * effective_page_size)
            .limit(effective_page_size)
            .all()
        )

        return items, total

    def get_project_detail(self, marketing_project_id: int) -> L4MarketingProject | None:
        """获取项目详情."""
        return (
            self.db.query(L4MarketingProject)
            .filter(
                and_(
                    L4MarketingProject.id == marketing_project_id,
                    L4MarketingProject.is_deleted.is_(False),
                ),
            )
            .first()
        )

    def get_project_media(self, marketing_project_id: int) -> list[L4MarketingMedia]:
        """获取项目媒体列表."""
        return (
            self.db.query(L4MarketingMedia)
            .filter(
                L4MarketingMedia.marketing_project_id == marketing_project_id,
                L4MarketingMedia.is_deleted.is_(False),
            )
            .order_by(L4MarketingMedia.sort_order)
            .all()
        )

    def get_consultant(self, consultant_id: str) -> User | None:
        """获取顾问信息."""
        return self.db.query(User).filter(User.id == consultant_id).first()

    def get_internal_contact_user(self, referrer_id: str) -> User | None:
        """按分享归属 ID 查找可展示联系方式的内部用户.

        仅当 referrer 指向一个 active 且有手机号的后台用户（主角色或附加角色
        命中 BACKEND_ROLE_CODES）时返回，否则返回 None 由路由回退房源顾问。
        避免循环依赖：has_backend_identity 在方法内 import。
        """
        user = self.db.query(User).filter(User.id == referrer_id).first()
        if not user or user.status != "active" or not user.phone:
            return None
        from services.system.auth import AuthService

        if not AuthService.has_backend_identity(user):
            return None
        return user

    def get_platform_stats(self) -> tuple[int, int, int]:
        """获取平台统计数据.

        Returns:
            (total_owners, on_sale_count, total_sold)

        """
        stats = self.db.query(
            func.count(
                func.distinct(
                    case(
                        (
                            and_(
                                L4MarketingProject.is_deleted.is_(False),
                                L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
                            ),
                            L4MarketingProject.community_id,
                        ),
                        else_=None,
                    ),
                ),
            ).label("total_owners"),
            func.count(
                case(
                    (
                        and_(
                            L4MarketingProject.is_deleted.is_(False),
                            L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
                            L4MarketingProject.project_status == MarketingProjectStatus.FOR_SALE.value,
                        ),
                        L4MarketingProject.id,
                    ),
                    else_=None,
                ),
            ).label("on_sale_count"),
            func.count(
                case(
                    (
                        and_(
                            L4MarketingProject.is_deleted.is_(False),
                            L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value,
                        ),
                        L4MarketingProject.id,
                    ),
                    else_=None,
                ),
            ).label("total_sold"),
        ).first()

        if not stats:
            return 0, 0, 0

        return stats.total_owners or 0, stats.on_sale_count or 0, stats.total_sold or 0
