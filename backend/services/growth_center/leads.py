"""获客中心统一线索分页列表服务.

跨 4 条链路 UNION ALL 聚合（估价/房源单共用 leads 表、按 source_property_id
判别拆分；预约=project_bookings；招募=recruit_leads）。手机号 Fernet 加密
存储（随机 IV 不可 LIKE），不支持手机号搜索，search 仅匹配归属员工名；
脱敏输出由服务层解密后调用 mask_phone 完成。
"""

from collections.abc import Sequence
from datetime import date, datetime, time, timedelta
from typing import Any, TypeAlias
from zoneinfo import ZoneInfo

from sqlalchemy import String, case, cast, exists, false, func, literal, or_, select, union_all
from sqlalchemy.orm import Session, aliased
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from constants.role_codes import BACKEND_ROLE_CODES
from models import Lead, ProjectBooking, RecruitCampaign, RecruitLead, Role, User, user_roles
from models.common.base import LeadStatus
from schemas.growth_center import GrowthModule, LeadSource, UnifiedLeadStatus
from utils.formatters import escape_like, mask_phone

_CST = ZoneInfo("Asia/Shanghai")

# UNION 分支构造返回：(语句, 统一状态列, 原生状态列, 员工列, 时间列, 员工名列, 来源列)
_Branch: TypeAlias = tuple[
    Select, ColumnElement, ColumnElement, ColumnElement, ColumnElement, ColumnElement, ColumnElement
]


def _date_range(start_date: date | None, end_date: date | None) -> tuple[datetime | None, datetime | None]:
    """日期参数 → 留资时间窗口（Asia/Shanghai 自然日，左闭右开）.

    Args:
        start_date: 开始日期（含）
        end_date: 结束日期（含）

    Returns:
        (start_dt, end_dt)；两侧均可为 None

    """
    start_dt = None
    end_dt = None
    if start_date is not None:
        start_dt = datetime.combine(start_date, time.min, tzinfo=_CST)
    if end_date is not None:
        end_dt = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=_CST)
    return start_dt, end_dt


def _name_label() -> ColumnElement:
    """归属员工名称表达式（需 outer join User，nickname 缺失回退 username）."""
    return func.coalesce(User.nickname, User.username).label("employee_name")


def _internal_creator_exists() -> ColumnElement:
    """Creator 为内部员工（主角色或附加角色含后台角色）的 EXISTS 表达式.

    口径与 ``AuthService.has_backend_identity`` 一致：主角色或附加角色属于
    {admin, operator, user} 之一即视为内部员工。估价/房源单线索的客户即
    creator，内部员工经 C 端链路上报的线索不作外部客户展示，列表侧过滤。

    """
    backend_codes = list(BACKEND_ROLE_CODES)
    creator = aliased(User)
    primary = exists(
        select(1)
        .select_from(creator)
        .join(Role, Role.id == creator.role_id)
        .where(creator.id == Lead.creator_id, Role.code.in_(backend_codes)),
    )
    additional = exists(
        select(1)
        .select_from(user_roles)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(user_roles.c.user_id == Lead.creator_id, Role.code.in_(backend_codes)),
    )
    return or_(primary, additional)


class GrowthLeadService:
    """统一线索查询服务（只读聚合，不回写各业务线状态）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list(
        self,
        *,
        page: int,
        page_size: int,
        module: GrowthModule | None = None,
        status: UnifiedLeadStatus | None = None,
        employee_id: str | None = None,
        source: LeadSource | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        search: str | None = None,
    ) -> dict[str, Any]:
        """统一线索分页查询（created_at 倒序，跨表 UNION ALL）.

        Args:
            page: 页码
            page_size: 每页数量
            module: 模块筛选（None=全部）
            status: 统一状态筛选
            employee_id: 归属员工筛选
            source: 来源筛选（card/poster 仅招募可命中，估价/预约/房源单未埋点分享方式）
            start_date: 留资开始日期（含）
            end_date: 留资结束日期（含）
            search: 归属员工名模糊搜索（手机号加密存储不可搜索）

        Returns:
            {items: [行字典], total, page, page_size}

        """
        start_dt, end_dt = _date_range(start_date, end_date)
        search_like = f"%{escape_like(search.strip())}%" if search and search.strip() else None

        targets = [module] if module is not None else list(GrowthModule)
        branches = [
            self._build_branch(
                target,
                status=status,
                employee_id=employee_id,
                source=source,
                start_dt=start_dt,
                end_dt=end_dt,
                search_like=search_like,
            )
            for target in targets
        ]

        subq = union_all(*branches).subquery("unified_leads")
        total = int(self.db.execute(select(func.count()).select_from(subq)).scalar() or 0)

        page_stmt = (
            select(subq)
            .order_by(subq.c.created_at.desc(), subq.c.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        page_rows = self.db.execute(page_stmt).all()

        phones = self._resolve_masked_phones(page_rows)
        items = [
            {
                "id": row.id,
                "module": row.module,
                "unified_status": row.unified_status,
                "native_status": row.native_status,
                "phone_masked": phones.get((row.module, row.id)),
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "source": row.source,
                "created_at": row.created_at,
                "campaign_name": row.campaign_name,
                "is_internal": bool(row.is_internal),
            }
            for row in page_rows
        ]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    # ─── 分支构建 ─────────────────────────────────────────────────────────

    def _build_branch(
        self,
        module: GrowthModule,
        *,
        status: UnifiedLeadStatus | None,
        employee_id: str | None,
        source: LeadSource | None,
        start_dt: datetime | None,
        end_dt: datetime | None,
        search_like: str | None,
    ) -> Select:
        """构建单模块 UNION 分支（已应用全部筛选条件）."""
        stmt, unified, _native, employee, created, name, source_expr = self._branch_for(module)
        return self._apply_filters(
            stmt,
            unified,
            source_expr,
            employee,
            created,
            name,
            status=status,
            source=source,
            employee_id=employee_id,
            start_dt=start_dt,
            end_dt=end_dt,
            search_like=search_like,
        )

    def _branch_for(self, module: GrowthModule) -> _Branch:
        """按模块分发分支列定义."""
        if module == GrowthModule.RECRUIT:
            return self._recruit_branch()
        if module == GrowthModule.BOOKING:
            return self._booking_branch()
        return self._leads_branch(attributed_only=module == GrowthModule.SHEET)

    def _apply_filters(
        self,
        stmt: Select,
        unified: ColumnElement,
        source_expr: ColumnElement,
        employee: ColumnElement,
        created: ColumnElement,
        name: ColumnElement,
        *,
        status: UnifiedLeadStatus | None,
        source: LeadSource | None,
        employee_id: str | None,
        start_dt: datetime | None,
        end_dt: datetime | None,
        search_like: str | None,
    ) -> Select:
        """应用统一筛选（统一状态/来源/员工/时间窗/员工名模糊）."""
        if status is not None:
            stmt = stmt.filter(unified == status.value)
        if source is not None:
            stmt = stmt.filter(source_expr == source.value)
        if employee_id is not None:
            stmt = stmt.filter(employee == employee_id)
        if start_dt is not None:
            stmt = stmt.filter(created >= start_dt)
        if end_dt is not None:
            stmt = stmt.filter(created < end_dt)
        if search_like is not None:
            stmt = stmt.filter(name.ilike(search_like))
        return stmt

    # ─── 各模块分支列定义 ─────────────────────────────────────────────────

    @staticmethod
    def _recruit_branch() -> _Branch:
        """招募分支（campaign_name/is_internal 取表内字段，source 原生枚举）."""
        name = _name_label()
        unified = cast(RecruitLead.status, String).label("unified_status")
        native = cast(RecruitLead.status, String).label("native_status")
        source_expr = case(
            (RecruitLead.referrer_employee_id.is_(None), literal(LeadSource.DIRECT.value)),
            else_=cast(RecruitLead.source, String),
        ).label("source")
        stmt = (
            select(
                RecruitLead.id.label("id"),
                literal(GrowthModule.RECRUIT.value).label("module"),
                unified,
                native,
                RecruitLead.referrer_employee_id.label("employee_id"),
                name,
                source_expr,
                RecruitLead.created_at.label("created_at"),
                RecruitCampaign.name.label("campaign_name"),
                RecruitLead.is_internal.label("is_internal"),
            )
            .outerjoin(User, User.id == RecruitLead.referrer_employee_id)
            .outerjoin(RecruitCampaign, RecruitCampaign.id == RecruitLead.campaign_id)
        )
        return stmt, unified, native, RecruitLead.referrer_employee_id, RecruitLead.created_at, name, source_expr

    @staticmethod
    def _booking_branch() -> _Branch:
        """预约分支（无状态机，统一/原生状态固定 new；无 campaign/is_internal）."""
        name = _name_label()
        unified = literal(UnifiedLeadStatus.NEW.value).label("unified_status")
        native = literal("new").label("native_status")
        # 预约表无分享方式字段（card/poster 未埋点），归因线索的 source 按契约恒为
        # null（见 UnifiedLeadListItem.source 说明），不可从 ProjectVisit.source
        # （自由文本进入渠道）推断，勿臆造映射
        source_expr = case(
            (ProjectBooking.referrer_user_id.is_(None), literal(LeadSource.DIRECT.value)),
            else_=cast(None, String),
        ).label("source")
        stmt = select(
            cast(ProjectBooking.id, String(36)).label("id"),
            literal(GrowthModule.BOOKING.value).label("module"),
            unified,
            native,
            ProjectBooking.referrer_user_id.label("employee_id"),
            name,
            source_expr,
            ProjectBooking.created_at.label("created_at"),
            cast(None, String).label("campaign_name"),
            false().label("is_internal"),
        ).outerjoin(User, User.id == ProjectBooking.referrer_user_id)
        return stmt, unified, native, ProjectBooking.referrer_user_id, ProjectBooking.created_at, name, source_expr

    @staticmethod
    def _leads_branch(*, attributed_only: bool) -> _Branch:
        """Leads 表分支（估价/房源单，按 source_property_id 判别拆分）."""
        name = _name_label()
        module_value = GrowthModule.SHEET.value if attributed_only else GrowthModule.VALUATION.value
        unified = case(
            (Lead.status == LeadStatus.PENDING_ASSESSMENT, UnifiedLeadStatus.NEW.value),
            (Lead.status == LeadStatus.PENDING_VISIT, UnifiedLeadStatus.CONTACTED.value),
            (Lead.status == LeadStatus.VISITED, UnifiedLeadStatus.HIGH_INTENT.value),
            (Lead.status == LeadStatus.SIGNED, UnifiedLeadStatus.CONVERTED.value),
            else_=UnifiedLeadStatus.ELIMINATED.value,
        ).label("unified_status")
        native = cast(Lead.status, String).label("native_status")
        # 同预约分支：估价/房源单未埋点分享方式，归因线索的 source 按契约恒为 null
        source_expr = case(
            (Lead.referrer_id.is_(None), literal(LeadSource.DIRECT.value)),
            else_=cast(None, String),
        ).label("source")
        stmt = select(
            Lead.id.label("id"),
            literal(module_value).label("module"),
            unified,
            native,
            Lead.referrer_id.label("employee_id"),
            name,
            source_expr,
            Lead.created_at.label("created_at"),
            cast(None, String).label("campaign_name"),
            false().label("is_internal"),
        ).outerjoin(User, User.id == Lead.referrer_id)
        if attributed_only:
            stmt = stmt.filter(Lead.source_property_id.isnot(None))
        else:
            stmt = stmt.filter(Lead.source_property_id.is_(None))
        stmt = stmt.filter(Lead.is_deleted.is_(False))
        # 仅展示外部客户提交的线索：过滤 creator 为内部员工的估价/房源单线索
        stmt = stmt.filter(~_internal_creator_exists())
        return stmt, unified, native, Lead.referrer_id, Lead.created_at, name, source_expr

    # ─── 手机号脱敏（仅当前页，按模块回表解密） ────────────────────────────

    def _resolve_masked_phones(self, page_rows: Sequence[Any]) -> dict[tuple[str, str], str | None]:
        """回表解密当前页线索手机号并脱敏.

        招募/预约取表内手机号；估价/房源单共用 leads 表（无手机号列），
        客户手机号取自 creator 的 ``User.phone``（Fernet 自动解密），与
        ``LeadService.get_my_acquired_phone`` 同数据源。

        """
        phones: dict[tuple[str, str], str | None] = {}
        recruit_ids = [row.id for row in page_rows if row.module == GrowthModule.RECRUIT.value]
        booking_ids = [int(row.id) for row in page_rows if row.module == GrowthModule.BOOKING.value]
        leads_rows = [
            row for row in page_rows if row.module in (GrowthModule.VALUATION.value, GrowthModule.SHEET.value)
        ]
        leads_ids = [row.id for row in leads_rows]

        if recruit_ids:
            rows = self.db.query(RecruitLead.id, RecruitLead.phone).filter(RecruitLead.id.in_(recruit_ids)).all()
            for lead_id, phone in rows:
                phones[(GrowthModule.RECRUIT.value, lead_id)] = mask_phone(phone)
        if booking_ids:
            rows = (
                self.db.query(ProjectBooking.id, ProjectBooking.phone).filter(ProjectBooking.id.in_(booking_ids)).all()
            )
            for booking_id, phone in rows:
                phones[(GrowthModule.BOOKING.value, str(booking_id))] = mask_phone(phone)
        if leads_ids:
            creator_phones = dict(
                self.db.query(Lead.id, User.phone)
                .join(User, User.id == Lead.creator_id)
                .filter(Lead.id.in_(leads_ids))
                .all()
            )
            for row in leads_rows:
                phones[(row.module, row.id)] = mask_phone(creator_phones.get(row.id))
        return phones
