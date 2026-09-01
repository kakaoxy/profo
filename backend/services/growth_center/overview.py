"""获客中心总览聚合服务.

KPI（今日线索/待跟进/有效新客/整体转化率）、线索来源构成、逐日线索趋势。
时间窗口统一为 Asia/Shanghai 自然日、左闭右开；口径与漏斗服务一致：
- 今日线索 = 4 链路今日留资合计
- 待跟进 = 统一状态 new 的未处理量（预约无状态机，全部计入）
- 有效新客 = 近 30 天留资，剔除 is_internal（仅招募可标记）
- 整体转化率 = 有效新客 ÷ 分享次数（近 30 天）
"""

from datetime import timedelta

from sqlalchemy import ColumnElement, func
from sqlalchemy.orm import Session

from models import (
    Lead,
    ProjectBooking,
    ProjectShareEvent,
    RecruitLead,
    RecruitLeadStatus,
    RecruitShareEvent,
    ValuationShareEvent,
)
from models.common.base import LeadStatus
from models.marketing.property_sheet import PropertySheetShareEvent
from schemas.growth_center import GrowthModule
from services.growth_center.normalize import Window, resolve_window, today_window

# 趋势/占比返回的模块顺序（固定，前端配色依赖）
_MODULE_ORDER: tuple[GrowthModule, ...] = (
    GrowthModule.VALUATION,
    GrowthModule.BOOKING,
    GrowthModule.SHEET,
    GrowthModule.RECRUIT,
)

_VALID_DAYS = 30


class GrowthOverviewService:
    """获客总览聚合服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ─── KPI ─────────────────────────────────────────────────────────────

    def kpi(self) -> dict:
        """总览 KPI 4 卡片."""
        today = today_window()
        window = resolve_window(_VALID_DAYS)

        today_leads = sum(self._count_leads_by_module(None, today).values())
        pending = self._count_pending()
        valid_map = self._count_leads_by_module(module=None, window=window, valid_only=True)
        valid_new_customers = sum(valid_map.values())

        share_count = self._count_shares(window)
        conversion_rate: float | None = None
        if share_count > 0:
            conversion_rate = round(valid_new_customers / share_count * 100, 1)

        return {
            "today_leads": today_leads,
            "pending_followups": pending,
            "valid_new_customers": valid_new_customers,
            "conversion_rate": conversion_rate,
        }

    # ─── 来源构成 ─────────────────────────────────────────────────────────

    def source_breakdown(self, days: int) -> dict:
        """各模块线索数与占比（近 N 天）."""
        window = resolve_window(days)
        count_map = self._count_leads_by_module(module=None, window=window)
        total = sum(count_map.values())
        items: list[dict] = []
        for module in _MODULE_ORDER:
            count = count_map.get(module, 0)
            items.append(
                {
                    "module": module.value,
                    "count": count,
                    "percent": round(count / total * 100, 1) if total > 0 else None,
                }
            )
        return {"days": days, "total": total, "items": items}

    # ─── 逐日趋势 ─────────────────────────────────────────────────────────

    def trend(self, days: int) -> dict:
        """逐日线索数（4 链路合计，Asia/Shanghai 自然日分组，缺日补 0）."""
        window = resolve_window(days)
        counts: dict[str, int] = {}
        for day_expr, time_col, extra in self._lead_sources():
            q = self.db.query(day_expr.label("day"), func.count()).filter(
                time_col >= window.start,
                time_col < window.end,
            )
            for cond in extra:
                q = q.filter(cond)
            rows = q.group_by(day_expr).all()
            for period, count in rows:
                key = period.strftime("%Y-%m-%d")
                counts[key] = counts.get(key, 0) + int(count or 0)

        points: list[dict] = []
        cursor = window.start
        while cursor < window.end:
            key = cursor.strftime("%Y-%m-%d")
            points.append({"date": key, "count": counts.get(key, 0)})
            cursor += timedelta(days=1)
        return {"days": days, "points": points}

    # ─── 内部实现 ─────────────────────────────────────────────────────────

    @staticmethod
    def _cst_day_expr(col: ColumnElement) -> ColumnElement:
        """CST 自然日分组表达式（timestamptz → Asia/Shanghai 日截断）."""
        return func.date_trunc("day", func.timezone("Asia/Shanghai", col))

    def _lead_sources(self) -> list[tuple]:
        """4 链路留资源（日期表达式, 时间列, 附加过滤）——估价/房源单按 source_property_id 判别拆分."""
        return [
            (
                self._cst_day_expr(Lead.created_at),
                Lead.created_at,
                [Lead.source_property_id.is_(None), Lead.is_deleted.is_(False)],
            ),
            (
                self._cst_day_expr(Lead.created_at),
                Lead.created_at,
                [Lead.source_property_id.isnot(None), Lead.is_deleted.is_(False)],
            ),
            (self._cst_day_expr(ProjectBooking.created_at), ProjectBooking.created_at, []),
            (self._cst_day_expr(RecruitLead.created_at), RecruitLead.created_at, []),
        ]

    def _count_leads_by_module(
        self,
        module: GrowthModule | None,
        window: Window | None = None,
        *,
        valid_only: bool = False,
    ) -> dict[GrowthModule, int]:
        """按模块统计线索数（module=None 统计全部；window=None 不限时间）."""
        targets = [module] if module is not None else list(_MODULE_ORDER)
        result: dict[GrowthModule, int] = {}
        for target in targets:
            result[target] = self._count_leads(target, window, valid_only=valid_only)
        return result

    def _count_leads(self, module: GrowthModule, window: Window | None, *, valid_only: bool = False) -> int:
        """单模块线索数（valid_only 时剔除招募 is_internal，其余模块无该字段）."""
        if module == GrowthModule.RECRUIT:
            q = self.db.query(func.count(RecruitLead.id))
            if window is not None:
                q = q.filter(RecruitLead.created_at >= window.start, RecruitLead.created_at < window.end)
            if valid_only:
                q = q.filter(RecruitLead.is_internal.is_(False))
            return int(q.scalar() or 0)
        if module == GrowthModule.BOOKING:
            q = self.db.query(func.count(ProjectBooking.id))
            if window is not None:
                q = q.filter(ProjectBooking.created_at >= window.start, ProjectBooking.created_at < window.end)
            return int(q.scalar() or 0)

        # 估价 / 房源单：leads 表按 source_property_id 判别拆分
        q = self.db.query(func.count(Lead.id)).filter(Lead.is_deleted.is_(False))
        if module == GrowthModule.VALUATION:
            q = q.filter(Lead.source_property_id.is_(None))
        else:
            q = q.filter(Lead.source_property_id.isnot(None))
        if window is not None:
            q = q.filter(Lead.created_at >= window.start, Lead.created_at < window.end)
        return int(q.scalar() or 0)

    def _count_pending(self) -> int:
        """待跟进 = 统一状态 new 的未处理量（全量，不限时间）."""
        valuation = (
            self.db.query(func.count(Lead.id))
            .filter(
                Lead.status == LeadStatus.PENDING_ASSESSMENT,
                Lead.is_deleted.is_(False),
            )
            .scalar()
            or 0
        )
        booking = self.db.query(func.count(ProjectBooking.id)).scalar() or 0
        recruit = (
            self.db.query(func.count(RecruitLead.id)).filter(RecruitLead.status == RecruitLeadStatus.NEW).scalar() or 0
        )
        return int(valuation) + int(booking) + int(recruit)

    def _count_shares(self, window: Window) -> int:
        """4 模块分享次数合计（转化率分母）."""
        total = 0
        for model, col in (
            (ValuationShareEvent, ValuationShareEvent.created_at),
            (ProjectShareEvent, ProjectShareEvent.created_at),
            (PropertySheetShareEvent, PropertySheetShareEvent.created_at),
            (RecruitShareEvent, RecruitShareEvent.shared_at),
        ):
            total += int(
                self.db.query(func.count(model.id)).filter(col >= window.start, col < window.end).scalar() or 0
            )
        return total
