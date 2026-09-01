"""获客中心统一线索详情服务.

含归因链路时间线（员工分享/客户打开/深度浏览/授权留资）与模块差异化字段。
4 条链路的线索与埋点表间均无外键关联，时间线按「归属员工 + 模块 + 线索创建
时间之前最近一次事件」的归因启发式回溯（招募命中同活动；预约命中同房源），
未找到埋点或未发生的事件以 occurred=false 标记。
"""

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import (
    Lead,
    ProjectBooking,
    ProjectShareEvent,
    ProjectVisit,
    RecruitCampaign,
    RecruitLead,
    RecruitShareEvent,
    RecruitVisit,
    User,
    ValuationShareEvent,
    ValuationVisit,
)
from models.common.base import LeadStatus
from models.marketing.l4_marketing import L4MarketingProject
from models.marketing.property_sheet import (
    PropertyShareSheet,
    PropertyShareSheetItem,
    PropertySheetShareEvent,
    PropertySheetVisit,
)
from schemas.growth_center import GrowthModule, LeadSource, UnifiedLeadStatus
from services.growth_center.normalize import (
    BOOKING_NATIVE_STATUS,
    BOOKING_UNIFIED_STATUS,
    map_valuation_status,
    normalize_source,
)
from services.system.exceptions import ResourceNotFoundError
from utils.formatters import mask_phone


def _coalesce_name() -> Any:
    """员工名称表达式（nickname 缺失回退 username）."""
    return func.coalesce(User.nickname, User.username)


class GrowthLeadDetailService:
    """统一线索详情服务（只读聚合）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, module: GrowthModule, lead_id: str) -> dict[str, Any]:
        """线索详情（归因时间线 + 模块差异化字段）.

        Args:
            module: 获客模块
            lead_id: 线索ID（各模块原生ID字符串）

        Returns:
            详情字典

        Raises:
            ResourceNotFoundError: 线索不存在或不属于该模块

        """
        if module == GrowthModule.RECRUIT:
            return self._recruit_detail(lead_id)
        if module == GrowthModule.BOOKING:
            return self._booking_detail(lead_id)
        if module == GrowthModule.SHEET:
            return self._sheet_detail(lead_id)
        return self._valuation_detail(lead_id)

    # ─── 招募 ─────────────────────────────────────────────────────────────

    def _recruit_detail(self, lead_id: str) -> dict[str, Any]:
        """招募线索详情（主营商圈/来源活动名/深度浏览/点击授权埋点最完整）."""
        lead = self.db.query(RecruitLead).filter(RecruitLead.id == lead_id).first()
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        campaign_name: str | None = None
        if lead.campaign_id:
            campaign_name = self.db.query(RecruitCampaign.name).filter(RecruitCampaign.id == lead.campaign_id).scalar()

        timeline_share = self._latest_before(
            RecruitShareEvent,
            RecruitShareEvent.shared_at,
            employee_col=RecruitShareEvent.employee_id,
            employee_id=lead.referrer_employee_id,
            before=lead.created_at,
            campaign_col=RecruitShareEvent.campaign_id,
            campaign_id=lead.campaign_id,
        )
        timeline_visit = self._latest_before(
            RecruitVisit,
            RecruitVisit.entered_at,
            employee_col=RecruitVisit.referrer_employee_id,
            employee_id=lead.referrer_employee_id,
            before=lead.created_at,
            campaign_col=RecruitVisit.campaign_id,
            campaign_id=lead.campaign_id,
        )

        timeline = [
            self._share_event(
                timeline_share is not None,
                timeline_share.shared_at if timeline_share else None,
                share_type=timeline_share.share_type.value if timeline_share else None,
            ),
            self._visit_event(
                timeline_visit is not None,
                timeline_visit.entered_at if timeline_visit else None,
                source=timeline_visit.source.value if timeline_visit else None,
            ),
            self._deep_view_event(
                occurred=timeline_visit is not None and timeline_visit.is_deep_view,
                occurred_at=(timeline_visit.exited_at or timeline_visit.entered_at) if timeline_visit else None,
                stayed_ms=timeline_visit.stayed_ms if timeline_visit else None,
            ),
            self._lead_submit_event(lead.created_at),
        ]

        return {
            "id": lead.id,
            "module": GrowthModule.RECRUIT.value,
            "unified_status": UnifiedLeadStatus(lead.status.value),
            "native_status": lead.status.value,
            "phone_masked": mask_phone(lead.phone),
            "employee_id": lead.referrer_employee_id,
            "employee_name": self._employee_name(lead.referrer_employee_id),
            "source": self._lead_source(lead.referrer_employee_id, lead.source.value, timeline_share),
            "created_at": lead.created_at,
            "campaign_name": campaign_name,
            "is_internal": lead.is_internal,
            "timeline": self._sorted_timeline(timeline),
            "main_business_area": lead.main_business_area,
        }

    # ─── 预约 ─────────────────────────────────────────────────────────────

    def _booking_detail(self, lead_id: str) -> dict[str, Any]:
        """预约线索详情（房源名称/预约时间；访问埋点按同房源 + 同归因员工回溯）."""
        try:
            booking_id = int(lead_id)
        except ValueError as exc:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg) from exc
        booking = self.db.query(ProjectBooking).filter(ProjectBooking.id == booking_id).first()
        if booking is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        property_title = (
            self.db.query(L4MarketingProject.title)
            .filter(L4MarketingProject.id == booking.marketing_project_id)
            .scalar()
        )

        timeline_share = self._latest_before(
            ProjectShareEvent,
            ProjectShareEvent.created_at,
            employee_col=ProjectShareEvent.employee_id,
            employee_id=booking.referrer_user_id,
            before=booking.created_at,
        )
        timeline_visit = self._latest_before(
            ProjectVisit,
            ProjectVisit.created_at,
            employee_col=ProjectVisit.referrer_employee_id,
            employee_id=booking.referrer_user_id,
            before=booking.created_at,
            extra_col=ProjectVisit.marketing_project_id,
            extra_value=booking.marketing_project_id,
        )

        timeline = [
            self._share_event(
                timeline_share is not None,
                timeline_share.created_at if timeline_share else None,
                share_type=timeline_share.share_type if timeline_share else None,
            ),
            self._visit_event(
                timeline_visit is not None,
                timeline_visit.created_at if timeline_visit else None,
                source=timeline_visit.source if timeline_visit else None,
            ),
            self._deep_view_event(occurred=False, occurred_at=None, stayed_ms=None),  # 预约链路无深度浏览埋点
            self._lead_submit_event(booking.created_at),
        ]

        return {
            "id": str(booking.id),
            "module": GrowthModule.BOOKING.value,
            "unified_status": BOOKING_UNIFIED_STATUS,
            "native_status": BOOKING_NATIVE_STATUS,
            "phone_masked": mask_phone(booking.phone),
            "employee_id": booking.referrer_user_id,
            "employee_name": self._employee_name(booking.referrer_user_id),
            "source": self._lead_source(booking.referrer_user_id, None, timeline_share),
            "created_at": booking.created_at,
            "campaign_name": None,
            "is_internal": False,
            "timeline": self._sorted_timeline(timeline),
            "property_title": property_title,
            "booking_time": booking.created_at,
        }

    # ─── 估价 / 房源单 ────────────────────────────────────────────────────

    def _valuation_detail(self, lead_id: str) -> dict[str, Any]:
        """估价线索详情（小区/面积/心理价等取自 leads 表本身）."""
        lead = self._get_leads_row(lead_id, attributed_only=False)
        share = self._latest_before(
            ValuationShareEvent,
            ValuationShareEvent.created_at,
            employee_col=ValuationShareEvent.employee_id,
            employee_id=lead.referrer_id,
            before=lead.created_at,
        )
        visit = self._latest_before(
            ValuationVisit,
            ValuationVisit.created_at,
            employee_col=ValuationVisit.referrer_employee_id,
            employee_id=lead.referrer_id,
            before=lead.created_at,
        )
        timeline = [
            self._share_event(
                share is not None, share.created_at if share else None, share_type=share.share_type if share else None
            ),
            self._visit_event(
                visit is not None, visit.created_at if visit else None, source=visit.source if visit else None
            ),
            self._deep_view_event(occurred=False, occurred_at=None, stayed_ms=None),  # 估价链路无深度浏览埋点
            self._lead_submit_event(lead.created_at),
        ]
        return {
            "id": lead.id,
            "module": GrowthModule.VALUATION.value,
            "unified_status": map_valuation_status(LeadStatus(lead.status.value)),
            "native_status": lead.status.value,
            "phone_masked": None,  # leads 表无手机号字段
            "employee_id": lead.referrer_id,
            "employee_name": self._employee_name(lead.referrer_id),
            "source": self._lead_source(lead.referrer_id, None, share),
            "created_at": lead.created_at,
            "campaign_name": None,
            "is_internal": False,
            "timeline": self._sorted_timeline(timeline),
            "community_name": lead.community_name,
            "area": float(lead.area) if lead.area is not None else None,
            "layout": lead.layout,
            "total_price": float(lead.total_price) if lead.total_price is not None else None,
            "eval_price": float(lead.eval_price) if lead.eval_price is not None else None,
            "expected_price": float(lead.expected_price) if lead.expected_price is not None else None,
        }

    def _sheet_detail(self, lead_id: str) -> dict[str, Any]:
        """房源单承接线索详情（来源房源单短码，取不到为 null）."""
        lead = self._get_leads_row(lead_id, attributed_only=True)
        share = self._latest_before(
            PropertySheetShareEvent,
            PropertySheetShareEvent.created_at,
            employee_col=PropertySheetShareEvent.employee_id,
            employee_id=lead.referrer_id,
            before=lead.created_at,
        )
        visit = self._latest_before(
            PropertySheetVisit,
            PropertySheetVisit.created_at,
            employee_col=PropertySheetVisit.referrer_employee_id,
            employee_id=lead.referrer_id,
            before=lead.created_at,
        )
        timeline = [
            self._share_event(
                share is not None, share.created_at if share else None, share_type=share.share_type if share else None
            ),
            self._visit_event(
                visit is not None, visit.created_at if visit else None, source=visit.source if visit else None
            ),
            self._deep_view_event(occurred=False, occurred_at=None, stayed_ms=None),  # 房源单链路无深度浏览埋点
            self._lead_submit_event(lead.created_at),
        ]
        return {
            "id": lead.id,
            "module": GrowthModule.SHEET.value,
            "unified_status": map_valuation_status(LeadStatus(lead.status.value)),
            "native_status": lead.status.value,
            "phone_masked": None,  # leads 表无手机号字段
            "employee_id": lead.referrer_id,
            "employee_name": self._employee_name(lead.referrer_id),
            "source": self._lead_source(lead.referrer_id, None, share),
            "created_at": lead.created_at,
            "campaign_name": None,
            "is_internal": False,
            "timeline": self._sorted_timeline(timeline),
            "sheet_code": self._resolve_sheet_code(lead.source_property_id),
        }

    # ─── 时间线事件构造 ───────────────────────────────────────────────────

    @staticmethod
    def _share_event(occurred: bool, occurred_at: datetime | None, *, share_type: str | None) -> dict[str, Any]:
        """员工分享事件."""
        return {
            "event": "share",
            "label": "员工分享",
            "occurred": occurred,
            "occurred_at": occurred_at,
            "share_type": share_type,
        }

    @staticmethod
    def _visit_event(occurred: bool, occurred_at: datetime | None, *, source: str | None) -> dict[str, Any]:
        """客户打开事件."""
        return {
            "event": "visit",
            "label": "客户打开",
            "occurred": occurred,
            "occurred_at": occurred_at,
            "source": source,
        }

    @staticmethod
    def _deep_view_event(occurred: bool, occurred_at: datetime | None, *, stayed_ms: int | None) -> dict[str, Any]:
        """深度浏览事件（仅招募链路埋点）。"""
        return {
            "event": "deep_view",
            "label": "深度浏览",
            "occurred": occurred,
            "occurred_at": occurred_at,
            "stayed_ms": stayed_ms,
        }

    @staticmethod
    def _lead_submit_event(occurred_at: datetime) -> dict[str, Any]:
        """授权留资事件（线索创建即发生）."""
        return {
            "event": "lead_submit",
            "label": "授权留资",
            "occurred": True,
            "occurred_at": occurred_at,
        }

    @staticmethod
    def _sorted_timeline(timeline: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """按时间排序（未发生/未埋点事件保持构造顺序置于末尾）."""
        return sorted(timeline, key=lambda e: (e["occurred_at"] is None, e["occurred_at"]))

    # ─── 通用查询 ─────────────────────────────────────────────────────────

    def _get_leads_row(self, lead_id: str, *, attributed_only: bool) -> Lead:
        """获取 leads 表线索行（按模块判别 source_property_id，已删除不可见）.

        Raises:
            ResourceNotFoundError: 不存在或已删除

        """
        query = self.db.query(Lead).filter(Lead.id == lead_id, Lead.is_deleted.is_(False))
        if attributed_only:
            query = query.filter(Lead.source_property_id.isnot(None))
        else:
            query = query.filter(Lead.source_property_id.is_(None))
        lead = query.first()
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        return lead

    def _latest_before(
        self,
        model: type,
        time_col: Any,
        *,
        employee_col: Any,
        employee_id: str | None,
        before: datetime,
        campaign_col: Any = None,
        campaign_id: str | None = None,
        extra_col: Any = None,
        extra_value: Any = None,
    ) -> Any | None:
        """归因启发式：归属员工在线索创建前最近一次埋点事件（未归因为 None）."""
        if employee_id is None:
            return None
        query = self.db.query(model).filter(
            employee_col == employee_id,
            time_col <= before,
        )
        if campaign_col is not None and campaign_id is not None:
            query = query.filter(campaign_col == campaign_id)
        if extra_col is not None:
            query = query.filter(extra_col == extra_value)
        return query.order_by(time_col.desc()).first()

    def _employee_name(self, employee_id: str | None) -> str | None:
        """归属员工名称（不存在时为 None）."""
        if employee_id is None:
            return None
        return self.db.query(_coalesce_name()).filter(User.id == employee_id).scalar()

    @staticmethod
    def _lead_source(
        referrer: str | None,
        native_source: str | None,
        share_event: Any | None,
    ) -> LeadSource | None:
        """统一来源：referrer 为空→direct；招募取原生 source；其余回溯分享事件 share_type."""
        if referrer is None:
            return LeadSource.DIRECT
        if native_source is not None:
            return LeadSource(native_source)
        if share_event is not None:
            return normalize_source(share_event.share_type)
        return None

    def _resolve_sheet_code(self, source_property_id: int | None) -> str | None:
        """由承接线索的 source_property_id 回溯来源房源单短码（取不到为 None）.

        归因语义为「线索由某房源（source_property_id）进入」——该房源可能出现在
        多个房源单中，取包含它的最早创建的房源单短码（能取到的为准）。

        """
        if source_property_id is None:
            return None
        row = (
            self.db.query(PropertyShareSheet.code)
            .join(
                PropertyShareSheetItem,
                PropertyShareSheetItem.sheet_id == PropertyShareSheet.id,
            )
            .filter(PropertyShareSheetItem.marketing_project_id == source_property_id)
            .order_by(PropertyShareSheet.created_at.asc(), PropertyShareSheet.id.asc())
            .first()
        )
        return row[0] if row is not None else None
