"""获客中心员工维度聚合服务.

员工获客 TOP 榜：近 N 天按分享归因线索数倒序的员工排行（4 模块合计），
含分享次数、归因线索数与转化率。员工漏斗下钻由 ``GrowthFunnelService.
employee_drilldown`` 提供（同一时间窗同一口径，合计与模块漏斗一致）。

员工维度统一口径：仅统计具备后台身份的用户（主角色或附加角色命中
BACKEND_ROLE_CODES）；C 端用户的分享/归因记录不计入员工统计。
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import User
from schemas.growth_center import GrowthModule
from services.growth_center.funnel import MODULE_SPECS, ModuleFunnelSpec
from services.growth_center.identity import resolve_backend_employee_ids
from services.growth_center.normalize import Window, resolve_window

_DEFAULT_TOP_LIMIT = 20


class GrowthEmployeeService:
    """员工获客排行服务（只读聚合）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def top(self, *, days: int, limit: int = _DEFAULT_TOP_LIMIT) -> dict:
        """员工获客 TOP 榜（按分享归因线索数倒序，仅统计后台身份员工）.

        Args:
            days: 统计窗口天数
            limit: 返回条数上限（默认 20，最大 100）

        Returns:
            {days, limit, items: [{employee_id, employee_name, share_count,
            lead_count, conversion_rate}]}

        """
        window = resolve_window(days)
        stats: dict[str, dict[str, int]] = {}
        for module in GrowthModule:
            spec = MODULE_SPECS[module]
            # 榜单仅统计归属到具体员工的分享/线索（未归因聚合不进入排行）
            for employee_id, count in self._grouped_shares(spec, window).items():
                if employee_id is None:
                    continue
                stats.setdefault(employee_id, {"share_count": 0, "lead_count": 0})["share_count"] += count
            for employee_id, count in self._grouped_leads(spec, window).items():
                if employee_id is None:
                    continue
                stats.setdefault(employee_id, {"share_count": 0, "lead_count": 0})["lead_count"] += count

        # 仅统计具备后台身份的用户（C 端用户分享/归因不计入员工榜）
        backend_ids = resolve_backend_employee_ids(self.db, [eid for eid in stats if eid is not None])
        stats = {eid: values for eid, values in stats.items() if eid in backend_ids}

        names = self._resolve_names([eid for eid in stats if eid is not None])
        items: list[dict] = []
        for employee_id, values in stats.items():
            share_count = values["share_count"]
            lead_count = values["lead_count"]
            items.append(
                {
                    "employee_id": employee_id,
                    "employee_name": names.get(employee_id),
                    "share_count": share_count,
                    "lead_count": lead_count,
                    "conversion_rate": round(lead_count / share_count * 100, 1) if share_count > 0 else None,
                }
            )
        items.sort(key=lambda r: (-r["lead_count"], -r["share_count"], r["employee_id"]))
        return {"days": days, "limit": limit, "items": items[:limit]}

    # ─── 分组计数 ─────────────────────────────────────────────────────────

    def _grouped_shares(self, spec: ModuleFunnelSpec, window: Window) -> dict[str | None, int]:
        """单模块按分享员工分组的分享次数."""
        rows = (
            self.db.query(spec.share_employee_col, func.count(spec.share_id_col))
            .filter(spec.share_time_col >= window.start, spec.share_time_col < window.end)
            .group_by(spec.share_employee_col)
            .all()
        )
        return {row[0]: int(row[1] or 0) for row in rows}

    def _grouped_leads(self, spec: ModuleFunnelSpec, window: Window) -> dict[str | None, int]:
        """单模块按归属员工分组的归因线索数（与漏斗留资级同过滤口径）."""
        q = self.db.query(spec.lead_referrer_col, func.count(spec.lead_id_col))
        q = q.filter(spec.lead_time_col >= window.start, spec.lead_time_col < window.end)
        for cond in spec.lead_filters:
            q = q.filter(cond)
        rows = q.group_by(spec.lead_referrer_col).all()
        return {row[0]: int(row[1] or 0) for row in rows}

    def _resolve_names(self, employee_ids: list[str]) -> dict[str, str | None]:
        """批量解析员工名称（nickname 缺失回退 username）."""
        if not employee_ids:
            return {}
        name_label = func.coalesce(User.nickname, User.username)
        rows = self.db.query(User.id, name_label).filter(User.id.in_(employee_ids)).all()
        return {row[0]: row[1] for row in rows}
