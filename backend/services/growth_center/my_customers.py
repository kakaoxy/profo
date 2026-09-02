"""小程序「我的客户」聚合读服务（归属收窄 + 跨模块统一视图）.

与获客中心 admin 视图（``GrowthLeadService``）同构的 UNION ALL 聚合，差异：
- referrer 强制收窄为当前登录员工（归属服务端过滤，防越权）；
- 额外输出模块差异摘要列（估价小区/户型/面积/预期价、预约房源/时间、
  招募主营商圈/活动）与 ``source_property_id``（房源单短码/套数回表解析用）；
- module_counts / status_counts 为该用户全部线索口径，不受当前筛选影响。

写路径（状态流转/跟进记录）拆分至 ``my_customers_flow.py``（读写分层，
避免单文件超 500 行）。
"""

from collections.abc import Sequence
from typing import Any, TypeAlias

from sqlalchemy import DateTime, Integer, Numeric, String, case, cast, func, literal, select, union_all
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.sql.selectable import Select

from models import L4MarketingProject, Lead, ProjectBooking, RecruitCampaign, RecruitLead, User
from models.common.base import LeadStatus
from models.marketing.property_sheet import PropertyShareSheet, PropertyShareSheetItem
from schemas.growth_center import GrowthModule, LeadSource, UnifiedLeadStatus
from services.growth_center.identity import internal_creator_exists
from services.growth_center.lead_detail import GrowthLeadDetailService
from services.growth_center.normalize import map_valuation_status
from services.leads.core import LeadService
from services.leads.share_tracking import ValuationShareTrackingService
from services.marketing.public import PublicProjectService
from services.property_sheet.core import PropertySheetService
from services.recruit.lead import RecruitLeadService
from services.system.exceptions import ResourceNotFoundError
from utils.formatters import mask_phone

# UNION 分支构造返回：(语句, 统一状态列, 归属员工列, 创建时间列)
_Branch: TypeAlias = tuple[Select, ColumnElement, ColumnElement, ColumnElement]


def ensure_customer_lead_owned(db: Session, module: GrowthModule, lead_id: str, user_id: str) -> None:
    """归属校验：线索不存在或 referrer 非当前用户统一 404（防 IDOR，不泄露存在性）.

    Args:
        db: 数据库会话
        module: 获客模块
        lead_id: 线索ID（各模块原生ID字符串）
        user_id: 当前登录用户ID

    Raises:
        ResourceNotFoundError: 线索不存在或不归属当前用户

    """
    if module == GrowthModule.RECRUIT:
        exists_q = db.query(RecruitLead.id).filter(
            RecruitLead.id == lead_id,
            RecruitLead.referrer_employee_id == user_id,
        )
    elif module == GrowthModule.BOOKING:
        try:
            booking_id = int(lead_id)
        except ValueError as exc:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg) from exc
        exists_q = db.query(ProjectBooking.id).filter(
            ProjectBooking.id == booking_id,
            ProjectBooking.referrer_user_id == user_id,
        )
    else:
        # 估价/房源单共用 leads 表，按 source_property_id 判别模块归属；
        # 内部员工提交的线索不对外展示（与列表 internal_creator_exists 口径一致）
        query = db.query(Lead.id).filter(Lead.id == lead_id, Lead.referrer_id == user_id, Lead.is_deleted.is_(False))
        query = query.filter(~internal_creator_exists())
        if module == GrowthModule.SHEET:
            exists_q = query.filter(Lead.source_property_id.isnot(None))
        else:
            exists_q = query.filter(Lead.source_property_id.is_(None))
    if exists_q.first() is None:
        msg = "线索不存在"
        raise ResourceNotFoundError(msg)


class MyCustomerService:
    """我的客户聚合读服务（列表/计数/角标/分享统计/详情/手机号）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ─── 列表 ─────────────────────────────────────────────────────────────

    def list(
        self,
        *,
        user_id: str,
        page: int,
        page_size: int,
        module: GrowthModule | None = None,
        status: UnifiedLeadStatus | None = None,
    ) -> dict[str, Any]:
        """我的客户分页查询（created_at 倒序，跨表 UNION ALL，归属收窄）.

        Args:
            user_id: 当前登录员工ID（referrer 收窄）
            page: 页码
            page_size: 每页数量
            module: 模块筛选（None=全部）
            status: 统一状态筛选

        Returns:
            {items, total, page, page_size, module_counts, status_counts}
            两个 counts 均为该用户全部线索口径，不受 module/status 筛选影响

        """
        targets = [module] if module is not None else list(GrowthModule)
        branches = [self._build_branch(target, user_id=user_id, status=status) for target in targets]

        subq = union_all(*branches).subquery("my_customers")
        total = int(self.db.execute(select(func.count()).select_from(subq)).scalar() or 0)

        page_stmt = (
            select(subq)
            .order_by(subq.c.created_at.desc(), subq.c.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        page_rows = self.db.execute(page_stmt).all()

        phones = self._resolve_masked_phones(page_rows)
        sheet_infos = self._resolve_sheet_infos(page_rows)
        items = [
            {
                "id": row.id,
                "module": row.module,
                "unified_status": row.unified_status,
                "native_status": row.native_status,
                "phone_masked": phones.get((row.module, row.id)),
                "source": row.source,
                "created_at": row.created_at,
                "campaign_name": row.campaign_name,
                "community_name": row.community_name,
                "layout": row.layout,
                "area": float(row.area) if row.area is not None else None,
                "expected_price": float(row.expected_price) if row.expected_price is not None else None,
                "property_title": row.property_title,
                "booking_time": row.booking_time,
                "sheet_code": None,
                "sheet_item_count": None,
                "main_business_area": row.main_business_area,
            }
            for row in page_rows
        ]
        # 房源单短码与套数需回表解析（UNION 分支不携带），仅 sheet 行需要
        for item, row in zip(items, page_rows, strict=True):
            if row.module == GrowthModule.SHEET.value:
                code, count = sheet_infos.get(row.id, (None, None))
                item["sheet_code"] = code
                item["sheet_item_count"] = count

        module_counts, status_counts = self.counts(user_id=user_id)
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "module_counts": module_counts,
            "status_counts": status_counts,
        }

    def counts(self, *, user_id: str) -> tuple[dict[str, int], dict[str, int]]:
        """该用户全部线索口径的模块计数与统一状态计数（一次 GROUP BY 聚合）.

        Returns:
            (module_counts, status_counts)，键为枚举 .value 字符串

        """
        branches = [self._build_branch(target, user_id=user_id, status=None) for target in GrowthModule]
        subq = union_all(*branches).subquery("my_customer_counts")
        rows = self.db.execute(
            select(subq.c.module, subq.c.unified_status, func.count().label("cnt")).group_by(
                subq.c.module,
                subq.c.unified_status,
            ),
        ).all()
        # 补全全部模块/状态键（无数据的计数为 0），前端无需容错缺键
        module_counts: dict[str, int] = {m.value: 0 for m in GrowthModule}
        status_counts: dict[str, int] = {s.value: 0 for s in UnifiedLeadStatus}
        for row in rows:
            module_counts[row.module] = module_counts.get(row.module, 0) + int(row.cnt)
            status_counts[row.unified_status] = status_counts.get(row.unified_status, 0) + int(row.cnt)
        return module_counts, status_counts

    def badge(self, *, user_id: str) -> int:
        """角标计数：统一状态为 new 的线索数（全部线索口径）."""
        _, status_counts = self.counts(user_id=user_id)
        return status_counts.get(UnifiedLeadStatus.NEW.value, 0)

    # ─── 分享统计（4 链路求和） ────────────────────────────────────────────

    def share_stats(self, user: User) -> dict[str, int]:
        """「我的客户」漏斗统计：四链路既有 my/share-stats 逐字段求和.

        复用各线服务保证口径一致（share/pv/uv/lead_count × 昨日/累计）；
        UV 为四链路 UV 数值求和（招募=openid_hash，其余=匿名 visitor_id，
        口径差异由前端脚注说明，此处不做跨口径去重）。

        """
        keys = (
            "share_count",
            "pv",
            "uv",
            "lead_count",
            "yesterday_share_count",
            "yesterday_pv",
            "yesterday_uv",
            "yesterday_lead_count",
        )
        parts = [
            ValuationShareTrackingService(self.db).get_my_share_stats(user),
            PublicProjectService(self.db).get_my_share_stats(user),
            PropertySheetService(self.db).get_my_share_stats(user),
            RecruitLeadService(self.db).get_my_share_stats(user),
        ]
        return {key: sum(int(part[key]) for part in parts) for key in keys}

    # ─── 详情 / 手机号 ────────────────────────────────────────────────────

    def detail(self, *, module: GrowthModule, lead_id: str, user_id: str) -> dict[str, Any]:
        """线索详情：归属校验后复用统一线索详情服务（时间线 + 模块差异字段）.

        Raises:
            ResourceNotFoundError: 线索不存在或不归属当前用户

        """
        ensure_customer_lead_owned(self.db, module, lead_id, user_id)
        return GrowthLeadDetailService(self.db).get(module, lead_id)

    def phone(self, *, module: GrowthModule, lead_id: str, user: User) -> dict[str, Any]:
        """查看归属线索完整手机号.

        分发：估价/房源单复用 ``LeadService.get_my_acquired_phone``（同数据源
        lead.creator.phone，referrer 校验内置 404）；招募/预约查看即联系——
        ``new`` 线索隐式流转为 ``contacted``（其他状态不动），返回流转后最新
        状态供前端就地更新卡片；招募复用 ``RecruitLeadService.get_my_lead_phone``，
        预约为本模块实现（referrer_user_id 校验，404 防 IDOR）。估价/房源单
        查看号码不改变任何状态。

        Returns:
            {phone, unified_status, native_status}

        Raises:
            ResourceNotFoundError: 线索不存在或不归属当前用户

        """
        if module == GrowthModule.RECRUIT:
            phone, lead_status = RecruitLeadService(self.db).get_my_lead_phone(user, lead_id)
            return {
                "phone": phone,
                "unified_status": UnifiedLeadStatus(lead_status.value),
                "native_status": lead_status.value,
            }
        if module == GrowthModule.BOOKING:
            # 直接带归属条件查询（id + referrer_user_id），单次查询完成存在性+归属校验（404 防 IDOR）
            try:
                booking_id = int(lead_id)
            except ValueError as exc:
                msg = "线索不存在"
                raise ResourceNotFoundError(msg) from exc
            booking = (
                self.db.query(ProjectBooking)
                .filter(ProjectBooking.id == booking_id, ProjectBooking.referrer_user_id == user.id)
                .first()
            )
            if booking is None:
                msg = "线索不存在"
                raise ResourceNotFoundError(msg)
            # 查看即联系：new → contacted 隐式流转（与招募线语义一致），非 new 不动
            if booking.status == UnifiedLeadStatus.NEW.value:
                booking.status = UnifiedLeadStatus.CONTACTED.value
                try:
                    self.db.commit()
                    self.db.refresh(booking)
                except Exception:
                    self.db.rollback()
                    raise
            return {
                "phone": booking.phone,
                "unified_status": UnifiedLeadStatus(booking.status),
                "native_status": booking.status,
            }
        # 估价/房源单：归属校验（404）→ 复用估价线解密 → 回读最新原生状态
        ensure_customer_lead_owned(self.db, module, lead_id, user.id)
        phone = LeadService(self.db).get_my_acquired_phone(user_id=user.id, lead_id=lead_id)
        native = self.db.query(Lead.status).filter(Lead.id == lead_id).scalar()
        unified = map_valuation_status(LeadStatus(native.value)) if native is not None else UnifiedLeadStatus.NEW
        return {
            "phone": phone,
            "unified_status": unified,
            "native_status": native.value if native is not None else "",
        }

    # ─── UNION 分支构建（归属收窄 + 摘要列） ──────────────────────────────

    def _build_branch(
        self,
        module: GrowthModule,
        *,
        user_id: str,
        status: UnifiedLeadStatus | None,
    ) -> Select:
        """构建单模块 UNION 分支（referrer 收窄为当前用户，已应用状态筛选）."""
        stmt, unified, employee, _created = self._branch_for(module)
        stmt = stmt.filter(employee == user_id)
        if status is not None:
            stmt = stmt.filter(unified == status.value)
        return stmt

    def _branch_for(self, module: GrowthModule) -> _Branch:
        """按模块分发分支列定义（各分支摘要列对齐，缺失列 cast None 补位）."""
        if module == GrowthModule.RECRUIT:
            return self._recruit_branch()
        if module == GrowthModule.BOOKING:
            return self._booking_branch()
        return self._leads_branch(attributed_only=module == GrowthModule.SHEET)

    @staticmethod
    def _recruit_branch() -> _Branch:
        """招募分支（source 原生枚举，referrer 为空按契约归 direct）."""
        unified = cast(RecruitLead.status, String).label("unified_status")
        source_expr = case(
            (RecruitLead.referrer_employee_id.is_(None), literal(LeadSource.DIRECT.value)),
            else_=cast(RecruitLead.source, String),
        ).label("source")
        stmt = select(
            RecruitLead.id.label("id"),
            literal(GrowthModule.RECRUIT.value).label("module"),
            unified,
            cast(RecruitLead.status, String).label("native_status"),
            RecruitLead.referrer_employee_id.label("employee_id"),
            source_expr,
            RecruitLead.created_at.label("created_at"),
            RecruitCampaign.name.label("campaign_name"),
            RecruitLead.main_business_area.label("main_business_area"),
            cast(None, String).label("community_name"),
            cast(None, String).label("layout"),
            cast(None, Numeric).label("area"),
            cast(None, Numeric).label("expected_price"),
            cast(None, String).label("property_title"),
            cast(None, DateTime(timezone=True)).label("booking_time"),
            cast(None, Integer).label("source_property_id"),
        ).outerjoin(RecruitCampaign, RecruitCampaign.id == RecruitLead.campaign_id)
        return stmt, unified, RecruitLead.referrer_employee_id, RecruitLead.created_at

    def _booking_branch(self) -> _Branch:
        """预约分支（原生状态即统一 5 态，读 project_bookings.status；房源标题 join 营销房源表）."""
        unified = cast(ProjectBooking.status, String).label("unified_status")
        # 预约表无分享方式字段（card/poster 未埋点），归因线索的 source 按契约
        # 恒为 null（对齐 GrowthLeadService._booking_branch），direct 由 referrer
        # 为空时给出，非空归因时为 null
        source_expr = case(
            (ProjectBooking.referrer_user_id.is_(None), literal(LeadSource.DIRECT.value)),
            else_=cast(None, String),
        ).label("source")
        stmt = select(
            cast(ProjectBooking.id, String(36)).label("id"),
            literal(GrowthModule.BOOKING.value).label("module"),
            unified,
            cast(ProjectBooking.status, String).label("native_status"),
            ProjectBooking.referrer_user_id.label("employee_id"),
            source_expr,
            ProjectBooking.created_at.label("created_at"),
            cast(None, String).label("campaign_name"),
            cast(None, String).label("main_business_area"),
            cast(None, String).label("community_name"),
            cast(None, String).label("layout"),
            cast(None, Numeric).label("area"),
            cast(None, Numeric).label("expected_price"),
            L4MarketingProject.title.label("property_title"),
            ProjectBooking.created_at.label("booking_time"),
            cast(None, Integer).label("source_property_id"),
        ).outerjoin(L4MarketingProject, L4MarketingProject.id == ProjectBooking.marketing_project_id)
        return stmt, unified, ProjectBooking.referrer_user_id, ProjectBooking.created_at

    def _leads_branch(self, *, attributed_only: bool) -> _Branch:
        """Leads 表分支（估价/房源单，按 source_property_id 判别拆分）."""
        module_value = GrowthModule.SHEET.value if attributed_only else GrowthModule.VALUATION.value
        unified = case(
            (Lead.status == LeadStatus.PENDING_ASSESSMENT, UnifiedLeadStatus.NEW.value),
            (Lead.status == LeadStatus.PENDING_VISIT, UnifiedLeadStatus.CONTACTED.value),
            (Lead.status == LeadStatus.VISITED, UnifiedLeadStatus.HIGH_INTENT.value),
            (Lead.status == LeadStatus.SIGNED, UnifiedLeadStatus.CONVERTED.value),
            else_=UnifiedLeadStatus.ELIMINATED.value,
        ).label("unified_status")
        source_expr = case(
            (Lead.referrer_id.is_(None), literal(LeadSource.DIRECT.value)),
            else_=cast(None, String),
        ).label("source")
        stmt = select(
            Lead.id.label("id"),
            literal(module_value).label("module"),
            unified,
            cast(Lead.status, String).label("native_status"),
            Lead.referrer_id.label("employee_id"),
            source_expr,
            Lead.created_at.label("created_at"),
            cast(None, String).label("campaign_name"),
            cast(None, String).label("main_business_area"),
            Lead.community_name.label("community_name"),
            Lead.layout.label("layout"),
            Lead.area.label("area"),
            Lead.expected_price.label("expected_price"),
            cast(None, String).label("property_title"),
            cast(None, DateTime(timezone=True)).label("booking_time"),
            Lead.source_property_id.label("source_property_id"),
        )
        if attributed_only:
            stmt = stmt.filter(Lead.source_property_id.isnot(None))
        else:
            stmt = stmt.filter(Lead.source_property_id.is_(None))
        stmt = stmt.filter(Lead.is_deleted.is_(False))
        # 仅展示外部客户提交的线索：过滤 creator 为内部员工的估价/房源单线索
        stmt = stmt.filter(~internal_creator_exists())
        return stmt, unified, Lead.referrer_id, Lead.created_at

    # ─── 分页后回表解析（脱敏手机号 / 房源单短码与套数） ──────────────────

    def _resolve_masked_phones(self, page_rows: Sequence[Any]) -> dict[tuple[str, str], str | None]:
        """回表解密当前页线索手机号并脱敏（口径与 GrowthLeadService 一致）.

        招募取 RecruitLead.phone、预约取 ProjectBooking.phone；估价/房源单共用
        leads 表（无手机号列），客户手机号取自 creator 的 ``User.phone``。

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
                .all(),
            )
            for row in leads_rows:
                phones[(row.module, row.id)] = mask_phone(creator_phones.get(row.id))
        return phones

    def _resolve_sheet_infos(self, page_rows: Sequence[Any]) -> dict[str, tuple[str | None, int | None]]:
        """回表解析房源单承接线索的来源房源单短码与套数.

        归因语义为「线索由某房源（source_property_id）进入」——该房源可能出现在
        多个房源单中，取包含它的最早创建的房源单（与
        ``GrowthLeadDetailService._resolve_sheet_code`` 启发式一致）；
        套数为该房源单的明细数（「共 N 套」）。取不到为 (None, None)。
        批量回表：全部 sheet 行固定 2 次查询（最早房源单 + 分组计数），避免逐行 N+1。

        """
        infos: dict[str, tuple[str | None, int | None]] = {}
        sheet_rows = [row for row in page_rows if row.module == GrowthModule.SHEET.value]
        prop_ids = [row.source_property_id for row in sheet_rows if row.source_property_id is not None]
        if not prop_ids:
            return infos
        # 查询 1：各房源关联的全部房源单（按创建时间升序），首个即该房源最早创建的房源单
        sheet_rows_db = (
            self.db.query(
                PropertyShareSheetItem.marketing_project_id,
                PropertyShareSheet.id,
                PropertyShareSheet.code,
            )
            .join(PropertyShareSheet, PropertyShareSheetItem.sheet_id == PropertyShareSheet.id)
            .filter(PropertyShareSheetItem.marketing_project_id.in_(prop_ids))
            .order_by(PropertyShareSheet.created_at.asc(), PropertyShareSheet.id.asc())
            .all()
        )
        first_by_prop: dict[int, tuple[int, str]] = {}
        for prop_id, sheet_id, code in sheet_rows_db:
            first_by_prop.setdefault(prop_id, (sheet_id, code))
        # 查询 2：相关房源单明细数分组计数
        sheet_ids = {sheet_id for sheet_id, _ in first_by_prop.values()}
        item_counts = (
            dict(
                self.db.query(PropertyShareSheetItem.sheet_id, func.count(PropertyShareSheetItem.id))
                .filter(PropertyShareSheetItem.sheet_id.in_(sheet_ids))
                .group_by(PropertyShareSheetItem.sheet_id)
                .all(),
            )
            if sheet_ids
            else {}
        )
        for lead_row in sheet_rows:
            if lead_row.source_property_id is None:
                continue
            entry = first_by_prop.get(lead_row.source_property_id)
            if entry is None:
                infos[lead_row.id] = (None, None)
                continue
            infos[lead_row.id] = (entry[1], int(item_counts.get(entry[0], 0)))
        return infos
