"""获客中心跨模块漏斗服务.

口径对齐 ``services/recruit/funnel.py``（RecruitFunnelService.compute）：
分享次数 → 打开 PV/UV → 深度浏览 → 点击授权 → 留资 → 有效新客（招募 6 级）；
估价/预约/房源单仅具备 分享 → 打开 PV/UV → 留资/预约/承接留资 3 级。
UV 口径：招募=openid_hash（登录态），其余模块=visitor_id（匿名），
不可横向对比。时间窗口统一为 Asia/Shanghai 自然日、左闭右开。
"""

from dataclasses import dataclass, field

from sqlalchemy import ColumnElement, func
from sqlalchemy.orm import Session

from models import (
    Lead,
    ProjectBooking,
    ProjectShareEvent,
    ProjectVisit,
    RecruitLead,
    RecruitShareEvent,
    RecruitVisit,
    ValuationShareEvent,
    ValuationVisit,
)
from models.marketing.property_sheet import PropertySheetShareEvent, PropertySheetVisit
from schemas.growth_center import GrowthModule
from services.growth_center.identity import internal_creator_exists, resolve_backend_employee_ids
from services.growth_center.normalize import UV_METRIC_BY_MODULE, Window, resolve_window

# 招募 6 级漏斗标签
_RECRUIT_STEP_LABELS: list[tuple[str, str]] = [
    ("share", "分享次数"),
    ("pv", "打开 PV"),
    ("uv", "打开 UV"),
    ("deep_view", "深度浏览"),
    ("clicked_auth", "点击授权"),
    ("leads", "留资"),
    ("valid_leads", "有效新客"),
]

# 3 级模块漏斗标签（分享 → 打开 PV/UV → 留资/预约/承接留资）
_SIMPLE_STEP_LABELS: list[tuple[str, str]] = [
    ("share", "分享次数"),
    ("pv", "打开 PV"),
    ("uv", "打开 UV"),
]

_NOTES_RECRUIT = (
    "UV 口径：登录态 openid_hash（与其他模块匿名 visitor_id 口径不可横向对比）；"
    "有效新客已剔除内部员工标记；打开含非分享自然流量，转化率可 >100%。"
)
_NOTES_SIMPLE = (
    "UV 口径：匿名 visitor_id（与招募登录态 openid_hash 不可横向对比）；"
    "打开含非分享自然流量，转化率可 >100%；"
    "留资/预约级为模块全量留资口径（含直接进入，未按分享归因过滤；"
    "估价/房源单已剔除内部员工提交，与统一线索列表口径一致）。"
)
_NOTES_SHEET = _NOTES_SIMPLE + "转化承接复用估价留资链路（referrer 续传，leads.source_property_id 非空）。"
_NOTES_COMPARE = (
    "① 招募 UV 为登录态 openid_hash（需登录），其余模块为匿名 visitor_id，UV 不可跨模块横向对比；"
    "② 打开含非分享自然流量（扫码/搜索/直接访问），uv_percent 为真实百分比、可 >100%，"
    "超 100% 时由前端封顶渲染；③ 各模块以 share 为基准 100%；"
    "④ 留资级为模块全量留资口径（未按员工归因过滤，估价/房源单已剔除内部员工提交），"
    "房源单承接复用估价 leads。"
)


@dataclass(frozen=True)
class ModuleFunnelSpec:
    """单模块漏斗查询规格（计数列/过滤条件）.

    主键计数列以显式 ``*_id_col`` 传入（而非存模型类后访问 ``.id``），
    避免对裸 ``type`` 属性做动态访问导致类型检查器报 attr-defined。
    """

    share_id_col: ColumnElement
    share_time_col: ColumnElement
    share_employee_col: ColumnElement
    visit_id_col: ColumnElement
    visit_time_col: ColumnElement
    visit_referrer_col: ColumnElement
    visit_uv_col: ColumnElement
    lead_id_col: ColumnElement
    lead_time_col: ColumnElement
    lead_referrer_col: ColumnElement
    # 留资级附加过滤（is_deleted / source_property_id 模块判别等）
    lead_filters: list[ColumnElement] = field(default_factory=list)
    # 有效新客附加过滤（招募 is_internal=False，其余模块无该字段）
    valid_leads_filter: ColumnElement | None = None
    # 招募专属访问级步骤：key → (标签, 过滤条件)（UV 去重口径）
    visit_extra_steps: dict[str, tuple[str, ColumnElement]] = field(default_factory=dict)
    step_labels: list[tuple[str, str]] = field(default_factory=list)
    notes: str = ""


_SPECS: dict[GrowthModule, ModuleFunnelSpec] = {
    GrowthModule.RECRUIT: ModuleFunnelSpec(
        share_id_col=RecruitShareEvent.id,
        share_time_col=RecruitShareEvent.shared_at,
        share_employee_col=RecruitShareEvent.employee_id,
        visit_id_col=RecruitVisit.id,
        visit_time_col=RecruitVisit.entered_at,
        visit_referrer_col=RecruitVisit.referrer_employee_id,
        visit_uv_col=RecruitVisit.openid_hash,
        lead_id_col=RecruitLead.id,
        lead_time_col=RecruitLead.created_at,
        lead_referrer_col=RecruitLead.referrer_employee_id,
        valid_leads_filter=RecruitLead.is_internal.is_(False),
        visit_extra_steps={
            "deep_view": ("深度浏览", RecruitVisit.is_deep_view.is_(True)),
            "clicked_auth": ("点击授权", RecruitVisit.clicked_auth.is_(True)),
        },
        step_labels=_RECRUIT_STEP_LABELS,
        notes=_NOTES_RECRUIT,
    ),
    GrowthModule.VALUATION: ModuleFunnelSpec(
        share_id_col=ValuationShareEvent.id,
        share_time_col=ValuationShareEvent.created_at,
        share_employee_col=ValuationShareEvent.employee_id,
        visit_id_col=ValuationVisit.id,
        visit_time_col=ValuationVisit.created_at,
        visit_referrer_col=ValuationVisit.referrer_employee_id,
        visit_uv_col=ValuationVisit.visitor_id,
        lead_id_col=Lead.id,
        lead_time_col=Lead.created_at,
        lead_referrer_col=Lead.referrer_id,
        lead_filters=[
            Lead.source_property_id.is_(None),
            Lead.is_deleted.is_(False),
            # 仅统计外部客户提交的估价线索，与统一线索列表口径一致
            ~internal_creator_exists(),
        ],
        step_labels=[*_SIMPLE_STEP_LABELS, ("leads", "留资")],
        notes=_NOTES_SIMPLE,
    ),
    GrowthModule.BOOKING: ModuleFunnelSpec(
        share_id_col=ProjectShareEvent.id,
        share_time_col=ProjectShareEvent.created_at,
        share_employee_col=ProjectShareEvent.employee_id,
        visit_id_col=ProjectVisit.id,
        visit_time_col=ProjectVisit.created_at,
        visit_referrer_col=ProjectVisit.referrer_employee_id,
        visit_uv_col=ProjectVisit.visitor_id,
        lead_id_col=ProjectBooking.id,
        lead_time_col=ProjectBooking.created_at,
        lead_referrer_col=ProjectBooking.referrer_user_id,
        step_labels=[*_SIMPLE_STEP_LABELS, ("leads", "预约")],
        notes=_NOTES_SIMPLE,
    ),
    GrowthModule.SHEET: ModuleFunnelSpec(
        share_id_col=PropertySheetShareEvent.id,
        share_time_col=PropertySheetShareEvent.created_at,
        share_employee_col=PropertySheetShareEvent.employee_id,
        visit_id_col=PropertySheetVisit.id,
        visit_time_col=PropertySheetVisit.created_at,
        visit_referrer_col=PropertySheetVisit.referrer_employee_id,
        visit_uv_col=PropertySheetVisit.visitor_id,
        lead_id_col=Lead.id,
        lead_time_col=Lead.created_at,
        lead_referrer_col=Lead.referrer_id,
        lead_filters=[
            Lead.source_property_id.isnot(None),
            Lead.is_deleted.is_(False),
            # 仅统计外部客户提交的房源单承接线索，与统一线索列表口径一致
            ~internal_creator_exists(),
        ],
        step_labels=[*_SIMPLE_STEP_LABELS, ("leads", "承接留资")],
        notes=_NOTES_SHEET,
    ),
}


def _build_steps(values: list[tuple[str, str, int]]) -> list[dict]:
    """由有序数值列表构建漏斗步骤（含相对上一级转化率）.

    Args:
        values: (key, label, value) 有序列表

    Returns:
        步骤字典列表，conversion 为相对上一级的百分比（上一级为 0 时 None）

    """
    steps: list[dict] = []
    prev: int | None = None
    for key, label, value in values:
        conversion: float | None = None
        if prev is not None and prev > 0:
            conversion = round(value / prev * 100, 1)
        steps.append({"key": key, "label": label, "value": value, "conversion": conversion})
        prev = value
    return steps


class GrowthFunnelService:
    """跨模块漏斗统计服务（总览/对比/员工下钻共用同一口径）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ─── 单模块漏斗 ──────────────────────────────────────────────────────

    def module_funnel(self, module: GrowthModule, days: int) -> dict:
        """单模块漏斗各级数值.

        Args:
            module: 获客模块
            days: 统计窗口天数

        Returns:
            漏斗响应字典（module/days/uv_metric/notes/steps）

        """
        spec = _SPECS[module]
        window = resolve_window(days)
        values = self._compute_steps(spec, window, employee_id=None)
        return {
            "module": module.value,
            "days": days,
            "uv_metric": UV_METRIC_BY_MODULE[module],
            "notes": spec.notes,
            "steps": _build_steps(values),
        }

    # ─── 四模块对比 ──────────────────────────────────────────────────────

    def compare(self, days: int) -> dict:
        """四模块并排对比（各模块 share 基准 100%，percent 为真实值）.

        Args:
            days: 统计窗口天数

        Returns:
            对比响应字典（days/notes/modules）

        """
        window = resolve_window(days)
        rows: list[dict] = []
        for module in GrowthModule:
            spec = _SPECS[module]
            share = self._count_shares(spec, window)
            uv = self._count_visits(spec, window, distinct=True)
            leads = self._count_leads(spec, window)
            rows.append(
                {
                    "module": module.value,
                    "share_count": share,
                    "uv": uv,
                    "uv_percent": round(uv / share * 100, 1) if share > 0 else None,
                    "leads": leads,
                    "leads_percent": round(leads / share * 100, 1) if share > 0 else None,
                }
            )
        return {"days": days, "notes": _NOTES_COMPARE, "modules": rows}

    # ─── 员工维度下钻 ────────────────────────────────────────────────────

    def employee_drilldown(self, module: GrowthModule, days: int) -> dict:
        """员工维度漏斗各级数据（仅后台身份员工 + 未归因聚合行）.

        已过滤非后台身份（C 端）用户行：员工行合计与模块漏斗的差值
        即 C 端用户的分享/留资（模块漏斗为全量口径）。

        Args:
            module: 获客模块
            days: 统计窗口天数

        Returns:
            下钻响应字典（module/days/uv_metric/notes/items）

        """
        spec = _SPECS[module]
        window = resolve_window(days)

        # 各级按归属员工（含 NULL=未归因）分组计数，合并为员工 → {key: value}
        buckets: dict[str | None, dict[str, int]] = {}
        grouped_levels: list[tuple[str, dict[str | None, int]]] = [
            ("share", self._grouped_shares(spec, window)),
            ("pv", self._grouped_visits(spec, window, distinct=False)),
            ("uv", self._grouped_visits(spec, window, distinct=True)),
        ]
        grouped_levels.extend(
            (key, self._grouped_visits(spec, window, distinct=True, extra_key=key)) for key in spec.visit_extra_steps
        )
        grouped_levels.append(("leads", self._grouped_leads(spec, window)))
        if spec.valid_leads_filter is not None:
            grouped_levels.append(("valid_leads", self._grouped_leads(spec, window, valid_only=True)))

        for step_key, grouped in grouped_levels:
            for employee_id, value in grouped.items():
                buckets.setdefault(employee_id, {})[step_key] = value

        names = self._resolve_employee_names([eid for eid in buckets if eid is not None])
        # 仅保留具备后台身份的员工行（与员工 TOP 榜口径一致）；未归因（None）聚合行保留
        backend_ids = resolve_backend_employee_ids(self.db, [eid for eid in buckets if eid is not None])
        items: list[dict] = []
        for employee_id, values in buckets.items():
            if employee_id is not None and employee_id not in backend_ids:
                continue
            ordered: list[tuple[str, str, int]] = []
            for key, label in spec.step_labels:
                ordered.append((key, label, values.get(key, 0)))
            items.append(
                {
                    "employee_id": employee_id,
                    "employee_name": names.get(employee_id) if employee_id is not None else None,
                    "steps": _build_steps(ordered),
                }
            )
        # 按首级（分享）倒序，未归因聚合行置于末尾
        items.sort(key=lambda r: (r["employee_id"] is None, -(r["steps"][0]["value"] if r["steps"] else 0)))
        drilldown_note = (
            "含未归因（referrer 为空）聚合行（employee_id=null）；"
            "已过滤非后台身份（C 端）用户行，员工行合计与模块漏斗的差值即 C 端用户的分享/留资。"
        )
        return {
            "module": module.value,
            "days": days,
            "uv_metric": UV_METRIC_BY_MODULE[module],
            "notes": spec.notes + drilldown_note,
            "items": items,
        }

    # ─── 计数实现 ─────────────────────────────────────────────────────────

    def _compute_steps(
        self,
        spec: ModuleFunnelSpec,
        window: Window,
        *,
        employee_id: str | None,
    ) -> list[tuple[str, str, int]]:
        """按模块步骤定义计算各级数值（可选员工过滤）."""
        share = self._count_shares(spec, window, employee_id=employee_id)
        pv = self._count_visits(spec, window, employee_id=employee_id)
        uv = self._count_visits(spec, window, employee_id=employee_id, distinct=True)
        value_map = {"share": share, "pv": pv, "uv": uv}
        for key in spec.visit_extra_steps:
            value_map[key] = self._count_visits(spec, window, employee_id=employee_id, extra_key=key)
        value_map["leads"] = self._count_leads(spec, window, employee_id=employee_id)
        if spec.valid_leads_filter is not None:
            value_map["valid_leads"] = self._count_leads(spec, window, employee_id=employee_id, valid_only=True)
        return [(key, label, value_map[key]) for key, label in spec.step_labels]

    def _count_shares(
        self,
        spec: ModuleFunnelSpec,
        window: Window,
        *,
        employee_id: str | None = None,
    ) -> int:
        """分享次数（时间列按模块口径）."""
        q = self.db.query(func.count(spec.share_id_col)).filter(
            spec.share_time_col >= window.start,
            spec.share_time_col < window.end,
        )
        if employee_id is not None:
            q = q.filter(spec.share_employee_col == employee_id)
        return int(q.scalar() or 0)

    def _count_visits(
        self,
        spec: ModuleFunnelSpec,
        window: Window,
        *,
        employee_id: str | None = None,
        distinct: bool = False,
        extra_key: str | None = None,
    ) -> int:
        """访问级计数（PV 总数或 UV 去重，可附加深度浏览/点击授权条件）."""
        if distinct or extra_key is not None:
            q = self.db.query(func.count(func.distinct(spec.visit_uv_col)))
        else:
            q = self.db.query(func.count(spec.visit_id_col))
        q = q.filter(spec.visit_time_col >= window.start, spec.visit_time_col < window.end)
        if employee_id is not None:
            q = q.filter(spec.visit_referrer_col == employee_id)
        if extra_key is not None:
            q = q.filter(spec.visit_extra_steps[extra_key][1])
        return int(q.scalar() or 0)

    def _count_leads(
        self,
        spec: ModuleFunnelSpec,
        window: Window,
        *,
        employee_id: str | None = None,
        valid_only: bool = False,
    ) -> int:
        """留资级计数（含模块判别过滤；valid_only 叠加有效新客条件）."""
        q = self.db.query(func.count(spec.lead_id_col))
        q = q.filter(spec.lead_time_col >= window.start, spec.lead_time_col < window.end)
        for cond in spec.lead_filters:
            q = q.filter(cond)
        if employee_id is not None:
            q = q.filter(spec.lead_referrer_col == employee_id)
        if valid_only and spec.valid_leads_filter is not None:
            q = q.filter(spec.valid_leads_filter)
        return int(q.scalar() or 0)

    # ─── 员工分组计数（下钻） ─────────────────────────────────────────────

    def _grouped_shares(self, spec: ModuleFunnelSpec, window: Window) -> dict[str | None, int]:
        """按分享员工分组的分享次数."""
        rows = (
            self.db.query(spec.share_employee_col, func.count(spec.share_id_col))
            .filter(spec.share_time_col >= window.start, spec.share_time_col < window.end)
            .group_by(spec.share_employee_col)
            .all()
        )
        return {row[0]: int(row[1] or 0) for row in rows}

    def _grouped_visits(
        self,
        spec: ModuleFunnelSpec,
        window: Window,
        *,
        distinct: bool,
        extra_key: str | None = None,
    ) -> dict[str | None, int]:
        """按来源员工分组的访问级计数（PV/UV/深度浏览/点击授权）."""
        if distinct or extra_key is not None:
            value_expr = func.count(func.distinct(spec.visit_uv_col))
        else:
            value_expr = func.count(spec.visit_id_col)
        q = self.db.query(spec.visit_referrer_col, value_expr).filter(
            spec.visit_time_col >= window.start,
            spec.visit_time_col < window.end,
        )
        if extra_key is not None:
            q = q.filter(spec.visit_extra_steps[extra_key][1])
        rows = q.group_by(spec.visit_referrer_col).all()
        return {row[0]: int(row[1] or 0) for row in rows}

    def _grouped_leads(
        self,
        spec: ModuleFunnelSpec,
        window: Window,
        *,
        valid_only: bool = False,
    ) -> dict[str | None, int]:
        """按归属员工分组的留资计数."""
        q = self.db.query(spec.lead_referrer_col, func.count(spec.lead_id_col))
        q = q.filter(spec.lead_time_col >= window.start, spec.lead_time_col < window.end)
        for cond in spec.lead_filters:
            q = q.filter(cond)
        if valid_only and spec.valid_leads_filter is not None:
            q = q.filter(spec.valid_leads_filter)
        rows = q.group_by(spec.lead_referrer_col).all()
        return {row[0]: int(row[1] or 0) for row in rows}

    def _resolve_employee_names(self, employee_ids: list[str]) -> dict[str, str | None]:
        """批量解析员工名称（nickname 缺失回退 username）."""
        if not employee_ids:
            return {}
        from models import User

        name_label = func.coalesce(User.nickname, User.username)
        rows = self.db.query(User.id, name_label).filter(User.id.in_(employee_ids)).all()
        return {row[0]: row[1] for row in rows}


# 供员工排行等跨服务复用的模块漏斗规格注册表（只读）
MODULE_SPECS = _SPECS
