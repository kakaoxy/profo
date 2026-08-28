"""C端公开项目服务.

职责: 处理C端公开项目相关的数据库查询.
"""

from sqlalchemy import Integer, and_, case, cast, desc, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Query, Session

from models import (
    Community,
    L4MarketingMedia,
    L4MarketingProject,
    ProjectBooking,
    ProjectShareEvent,
    ProjectVisit,
    User,
)
from models.marketing.l4_marketing import MarketingProjectStatus, PhotoCategory, PublishStatus
from schemas.public import (
    PublicCustomerBookingItem,
    PublicShareEventRequest,
    PublicVisitEventRequest,
)
from services.system.exceptions import ConflictError, ResourceNotFoundError
from settings import settings
from utils.crypto import hash_phone
from utils.formatters import escape_like, mask_phone
from utils.image_processing import derive_thumbnail_url
from utils.query_params import validate_sort_field
from utils.time_windows import yesterday_window


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
            # 状态分组优先：在售 → 装修中(在途) → 过往案例(已售)；组内权重降序、同权重创建时间倒序
            status_priority = case(
                (L4MarketingProject.project_status == MarketingProjectStatus.FOR_SALE.value, 0),
                (L4MarketingProject.project_status == MarketingProjectStatus.IN_PROGRESS.value, 1),
                (L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value, 2),
                else_=3,
            )
            query = query.order_by(
                status_priority,
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
        """获取已发布且未删除的项目详情（C 端读口径，与列表/写入口径一致）."""
        return (
            self.db.query(L4MarketingProject)
            .filter(
                and_(
                    L4MarketingProject.id == marketing_project_id,
                    L4MarketingProject.is_deleted.is_(False),
                    L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
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

    def create_booking(
        self,
        user: User,
        marketing_project_id: int,
        visitor_id: str | None = None,
    ) -> tuple[ProjectBooking, L4MarketingProject, bool]:
        """创建房源预约（同一用户对同一房源幂等）.

        Args:
            user: 当前 C 端用户（需已绑定手机号）
            marketing_project_id: 房源ID
            visitor_id: 匿名访客ID（可选，用于回查访问埋点做分享归因）

        Returns:
            (预约记录, 房源, is_new)：is_new=False 表示命中既有预约

        Raises:
            ResourceNotFoundError: 房源不存在或未发布
            ConflictError: 用户未绑定手机号

        """
        project = self._get_published_project(marketing_project_id)
        if project is None:
            msg = "房源不存在或未发布"
            raise ResourceNotFoundError(msg)

        if not user.phone:
            msg = "请先绑定手机号后再预约看房"
            raise ConflictError(msg)

        existing = self._get_booking(user_id=user.id, marketing_project_id=marketing_project_id)
        if existing is not None:
            return existing, project, False

        booking = ProjectBooking(
            marketing_project_id=marketing_project_id,
            user_id=user.id,
            # phone 快照加密存储（EncryptedString 自动加解密），phone_hash 维持可比较性
            phone=user.phone,
            phone_hash=hash_phone(user.phone),
            referrer_user_id=self._resolve_booking_referrer(visitor_id),
        )
        try:
            self.db.add(booking)
            self.db.commit()
            self.db.refresh(booking)
        except IntegrityError:
            # 并发重复预约：uq_project_bookings_user_project 兜底，回查既有记录
            self.db.rollback()
            existing = self._get_booking(user_id=user.id, marketing_project_id=marketing_project_id)
            if existing is None:
                raise
            return existing, project, False
        return booking, project, True

    def _get_booking(self, *, user_id: str, marketing_project_id: int) -> ProjectBooking | None:
        """按 (user_id, marketing_project_id) 查既有预约."""
        return (
            self.db.query(ProjectBooking)
            .filter(
                ProjectBooking.user_id == user_id,
                ProjectBooking.marketing_project_id == marketing_project_id,
            )
            .first()
        )

    def _resolve_booking_referrer(self, visitor_id: str | None) -> str | None:
        """解析预约分享归因：该访客最近一次带 referrer 的房源访问埋点.

        project_visits 为免登录埋点（无 user_id 列），归因唯一可行键是前端
        生成的匿名 visitor_id；未提供或无带 referrer 的埋点时返回 None。
        """
        if not visitor_id:
            return None
        visit = (
            self.db.query(ProjectVisit)
            .filter(
                ProjectVisit.visitor_id == visitor_id,
                ProjectVisit.referrer_employee_id.isnot(None),
            )
            .order_by(desc(ProjectVisit.created_at))
            .first()
        )
        return visit.referrer_employee_id if visit else None

    def get_my_bookings(
        self,
        *,
        user_id: str,
        marketing_project_id: int | None = None,
    ) -> list[tuple[ProjectBooking, L4MarketingProject]]:
        """获取用户的预约列表（含房源快照），按预约时间倒序.

        Args:
            user_id: 用户ID
            marketing_project_id: 房源ID过滤（可选）

        Returns:
            [(预约记录, 房源)] 列表，created_at 倒序（相同时间按 id 倒序稳定排序）

        """
        query = (
            self.db.query(ProjectBooking, L4MarketingProject)
            .join(L4MarketingProject, L4MarketingProject.id == ProjectBooking.marketing_project_id)
            .filter(ProjectBooking.user_id == user_id)
        )
        if marketing_project_id is not None:
            query = query.filter(ProjectBooking.marketing_project_id == marketing_project_id)
        return query.order_by(desc(ProjectBooking.created_at), desc(ProjectBooking.id)).all()

    def get_my_customer_bookings(self, user_id: str) -> list[PublicCustomerBookingItem]:
        """归属我的预约客户列表（房源分享归因的员工侧「我的客户」）.

        按 ``ProjectBooking.referrer_user_id == user_id`` 过滤；inner join 房源
        （与 get_my_bookings 同决策：预约必然对应存在房源，缺失即脏数据不应展示），
        created_at 倒序（相同时间按 id 倒序稳定排序）。封面复用
        resolve_cover_images_batch 批量解析（避免 N+1）。
        """
        rows = (
            self.db.query(ProjectBooking, L4MarketingProject)
            .join(L4MarketingProject, L4MarketingProject.id == ProjectBooking.marketing_project_id)
            .filter(ProjectBooking.referrer_user_id == user_id)
            .order_by(desc(ProjectBooking.created_at), desc(ProjectBooking.id))
            .all()
        )
        projects = [project for _, project in rows]
        cover_map = self.resolve_cover_images_batch(projects)
        return [
            PublicCustomerBookingItem(
                id=booking.id,
                marketing_project_id=booking.marketing_project_id,
                project_title=project.title,
                community_name=project.community_name,
                cover_image=cover_map[project.id][0],
                layout=project.layout,
                total_price=float(project.total_price),
                # phone 为 EncryptedString 加密快照，读属性自动解密；mask_phone 空值返回 None，兜底空串
                customer_phone_masked=mask_phone(booking.phone) or "",
                created_at=booking.created_at,
            )
            for booking, project in rows
        ]

    def _get_published_project(self, marketing_project_id: int) -> L4MarketingProject | None:
        """获取已发布且未删除的房源（C 端写入口径，与 create_booking 一致）."""
        return (
            self.db.query(L4MarketingProject)
            .filter(
                and_(
                    L4MarketingProject.id == marketing_project_id,
                    L4MarketingProject.is_deleted.is_(False),
                    L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
                ),
            )
            .first()
        )

    def create_visit_event(self, marketing_project_id: int, data: PublicVisitEventRequest) -> ProjectVisit:
        """记录房源详情页访问埋点（PV +1，UV 按 visitor_id 去重）.

        referrer 非空即原样落库（与招募 visit 口径一致，不做内部用户校验）。

        Raises:
            ResourceNotFoundError: 房源不存在或未发布

        """
        project = self._get_published_project(marketing_project_id)
        if project is None:
            msg = "房源不存在或未发布"
            raise ResourceNotFoundError(msg)
        visit = ProjectVisit(
            visitor_id=data.visitor_id,
            referrer_employee_id=data.referrer,
            marketing_project_id=marketing_project_id,
            source=data.source,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def create_share_event(
        self,
        user: User,
        marketing_project_id: int,
        data: PublicShareEventRequest,
    ) -> ProjectShareEvent:
        """记录房源分享事件（employee_id 服务端取当前登录用户，禁止前端传入）.

        Raises:
            ResourceNotFoundError: 房源不存在或未发布

        """
        project = self._get_published_project(marketing_project_id)
        if project is None:
            msg = "房源不存在或未发布"
            raise ResourceNotFoundError(msg)
        event = ProjectShareEvent(
            employee_id=user.id,
            marketing_project_id=marketing_project_id,
            share_type=data.share_type,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def get_my_share_stats(self, user: User) -> dict[str, int]:
        """C 端「我的房源分享统计」：分享次数 / PV / UV / 留资（昨日 + 累计）.

        口径：share_count 按 ``ProjectShareEvent.employee_id``、pv/uv 按
        ``ProjectVisit.referrer_employee_id``（uv 为 distinct visitor_id）、
        lead_count 按 ``ProjectBooking.referrer_user_id``；昨日窗口为
        Asia/Shanghai 自然日（见 ``utils.time_windows.yesterday_window``）。
        """
        y_start, y_end = yesterday_window()
        share_q = self.db.query(ProjectShareEvent).filter(ProjectShareEvent.employee_id == user.id)
        visit_q = self.db.query(ProjectVisit).filter(ProjectVisit.referrer_employee_id == user.id)
        # 昨日窗口条件（不可变条件对象，pv/uv 两处复用）
        y_visit_window = [ProjectVisit.created_at >= y_start, ProjectVisit.created_at < y_end]
        uv_q = self.db.query(func.count(func.distinct(ProjectVisit.visitor_id))).filter(
            ProjectVisit.referrer_employee_id == user.id
        )
        lead_q = self.db.query(func.count(ProjectBooking.id)).filter(ProjectBooking.referrer_user_id == user.id)

        return {
            "share_count": int(share_q.count()),
            "pv": int(visit_q.count()),
            "uv": int(uv_q.scalar() or 0),
            "lead_count": int(lead_q.scalar() or 0),
            "yesterday_share_count": int(
                share_q.filter(ProjectShareEvent.created_at >= y_start, ProjectShareEvent.created_at < y_end).count()
            ),
            "yesterday_pv": int(visit_q.filter(*y_visit_window).count()),
            "yesterday_uv": int(uv_q.filter(*y_visit_window).scalar() or 0),
            "yesterday_lead_count": int(
                lead_q.filter(ProjectBooking.created_at >= y_start, ProjectBooking.created_at < y_end).scalar() or 0
            ),
        }

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
