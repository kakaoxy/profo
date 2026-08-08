"""C端公开项目服务.

职责: 处理C端公开项目相关的数据库查询.
"""

from sqlalchemy import Integer, and_, case, cast, desc, func, or_
from sqlalchemy.orm import Query, Session

from models import Community, L4MarketingMedia, L4MarketingProject, User
from models.marketing.l4_marketing import MarketingProjectStatus, PublishStatus
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

        images 非空的项目直接用首张 URL 推导缩略图；images 为空的项目统一
        一次 in_(ids) 查询媒体表，取每个项目 sort_order 最小的 image 记录。
        语义与逐条解析一致，避免循环内逐条查询造成 N+1。

        Returns:
            {item.id: (cover_image, cover_thumbnail_url)}

        """
        result: dict[int, tuple[str | None, str | None]] = {}
        fallback_ids: list[int] = []
        for item in items:
            images = item.images or []
            cover_image = images[0] if images else None
            if cover_image:
                # JSON 数组中的 URL 无存储缩略图，按命名规则推导
                result[item.id] = (cover_image, derive_thumbnail_url(cover_image))
            else:
                fallback_ids.append(item.id)
                result[item.id] = (None, None)

        if not fallback_ids:
            return result

        # 一次 in_(ids) 查询拉取媒体表，回退到已存储的 thumbnail_url
        media_rows = (
            self.db.query(L4MarketingMedia)
            .filter(
                L4MarketingMedia.marketing_project_id.in_(fallback_ids),
                L4MarketingMedia.is_deleted.is_(False),
                L4MarketingMedia.media_type == "image",
            )
            .order_by(L4MarketingMedia.marketing_project_id, L4MarketingMedia.sort_order)
            .all()
        )
        for media in media_rows:
            # 已按 sort_order 升序，每个项目仅取第一条（首图），后续重复跳过
            if result[media.marketing_project_id][0] is None:
                result[media.marketing_project_id] = (media.file_url, media.thumbnail_url)

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
        sort_by: str = "created_at",
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
            "created_at": L4MarketingProject.created_at,
            "total_price": L4MarketingProject.total_price,
            "unit_price": L4MarketingProject.unit_price,
            "area": L4MarketingProject.area,
        }
        validated_sort_by = validate_sort_field(sort_by, allowed_sort_fields.keys(), "created_at")
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
            query.order_by(desc(L4MarketingProject.created_at))
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
