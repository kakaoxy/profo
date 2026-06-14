"""C端公开项目服务.

职责: 处理C端公开项目相关的数据库查询.
"""

from datetime import datetime, timezone

from sqlalchemy import and_, case, desc, func
from sqlalchemy.orm import Session

from models import L4MarketingMedia, L4MarketingProject, User
from schemas.l4_marketing.enums import MarketingProjectStatus, PublishStatus
from utils.formatters import escape_like


class PublicProjectService:
    """C端公开项目服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve_cover_image(self, item: L4MarketingProject) -> str | None:
        """解析项目封面图片."""
        images = item.images or []
        cover_image = images[0] if images else None
        if not cover_image:
            first_media = (
                self.db.query(L4MarketingMedia)
                .filter(
                    L4MarketingMedia.marketing_project_id == item.id,
                    L4MarketingMedia.is_deleted.is_(False),
                    L4MarketingMedia.media_type == "image",
                )
                .order_by(L4MarketingMedia.sort_order)
                .first()
            )
            if first_media:
                cover_image = first_media.file_url
        return cover_image

    def get_published_projects(  # noqa: PLR0913
        self,
        project_status: str | None = None,
        community_name: str | None = None,
        layout: str | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        min_area: float | None = None,
        max_area: float | None = None,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[L4MarketingProject], int]:
        """获取已发布的房源列表."""
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
            L4MarketingProject.is_deleted.is_(False),
        )

        if project_status:
            query = query.filter(L4MarketingProject.project_status == project_status)
        if community_name:
            query = query.filter(L4MarketingProject.community_name.like(f"%{escape_like(community_name)}%"))
        if layout:
            query = query.filter(L4MarketingProject.layout == layout)
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
        sort_column = allowed_sort_fields.get(sort_by, L4MarketingProject.created_at)
        query = query.order_by(sort_column.asc() if sort_order == "asc" else sort_column.desc())

        offset = (page - 1) * page_size
        items = query.offset(offset).limit(page_size).all()

        return items, total

    def get_sold_projects(
        self,
        community_name: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[L4MarketingProject], int]:
        """获取已成交的房源案例列表."""
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value,
            L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
            L4MarketingProject.is_deleted.is_(False),
        )

        if community_name:
            query = query.filter(L4MarketingProject.community_name.like(f"%{escape_like(community_name)}%"))

        total = query.count()
        items = query.order_by(desc(L4MarketingProject.created_at)).offset((page - 1) * page_size).limit(page_size).all()

        return items, total

    def get_project_detail(self, project_id: int) -> L4MarketingProject | None:
        """获取项目详情."""
        return (
            self.db.query(L4MarketingProject)
            .filter(
                and_(
                    L4MarketingProject.id == project_id,
                    L4MarketingProject.is_deleted.is_(False),
                ),
            )
            .first()
        )

    def get_project_media(self, project_id: int) -> list[L4MarketingMedia]:
        """获取项目媒体列表."""
        return (
            self.db.query(L4MarketingMedia)
            .filter(
                L4MarketingMedia.marketing_project_id == project_id,
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
            (total_owners, on_sale_count, current_month_sold)
        """
        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

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
                            L4MarketingProject.updated_at >= month_start,
                        ),
                        L4MarketingProject.id,
                    ),
                    else_=None,
                ),
            ).label("current_month_sold"),
        ).first()

        if not stats:
            return 0, 0, 0

        return stats.total_owners or 0, stats.on_sale_count or 0, stats.current_month_sold or 0
