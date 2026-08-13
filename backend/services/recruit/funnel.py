"""招募 6 级漏斗统计服务.

口径对齐 ``docs/To-Do/区域伙伴招募计划.md`` 第五节：
分享次数 → 打开 PV/UV → 深度浏览 → 点击授权 → 授权成功 → 有效新客。
"""

from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from models.recruit import RecruitLead, RecruitShareEvent, RecruitVisit


class RecruitFunnelService:
    """招募漏斗统计服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def compute(
        self,
        *,
        campaign_id: str | None = None,
        employee_id: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
    ) -> dict[str, int]:
        """计算 6 级漏斗指标."""
        return {
            "share_count": self._count_shares(campaign_id, employee_id, start_date, end_date),
            "pv": self._count_visits(campaign_id, employee_id, start_date, end_date),
            "uv": self._count_visits(
                campaign_id, employee_id, start_date, end_date, distinct_col=RecruitVisit.openid_hash
            ),
            # deep_view / clicked_auth 口径为「人数」，按 openid_hash 去重
            "deep_view": self._count_visits(
                campaign_id,
                employee_id,
                start_date,
                end_date,
                distinct_col=RecruitVisit.openid_hash,
                extra=RecruitVisit.is_deep_view.is_(True),
            ),
            "clicked_auth": self._count_visits(
                campaign_id,
                employee_id,
                start_date,
                end_date,
                distinct_col=RecruitVisit.openid_hash,
                extra=RecruitVisit.clicked_auth.is_(True),
            ),
            "authed": self._count_leads(campaign_id, employee_id, start_date, end_date),
            "valid_leads": self._count_leads(
                campaign_id,
                employee_id,
                start_date,
                end_date,
                extra=RecruitLead.is_internal.is_(False),
            ),
        }

    @staticmethod
    def _time_range(
        start_date: date | None, end_date: date | None, col: ColumnElement[datetime]
    ) -> list[ColumnElement[bool]]:
        """构建时间区间过滤条件（左闭右开）."""
        conditions: list[ColumnElement[bool]] = []
        if start_date is not None:
            start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
            conditions.append(col >= start)
        if end_date is not None:
            end = datetime.combine(end_date, time.min, tzinfo=timezone.utc) + timedelta(days=1)
            conditions.append(col < end)
        return conditions

    def _count_shares(
        self,
        campaign_id: str | None,
        employee_id: str | None,
        start_date: date | None,
        end_date: date | None,
    ) -> int:
        q = self.db.query(func.count(RecruitShareEvent.id))
        if campaign_id is not None:
            q = q.filter(RecruitShareEvent.campaign_id == campaign_id)
        if employee_id is not None:
            q = q.filter(RecruitShareEvent.employee_id == employee_id)
        for cond in self._time_range(start_date, end_date, RecruitShareEvent.shared_at):
            q = q.filter(cond)
        return q.scalar() or 0

    def _count_visits(
        self,
        campaign_id: str | None,
        employee_id: str | None,
        start_date: date | None,
        end_date: date | None,
        *,
        distinct_col: ColumnElement[str] | None = None,
        extra: ColumnElement[bool] | None = None,
    ) -> int:
        if distinct_col is not None:
            q = self.db.query(func.count(func.distinct(distinct_col)))
        else:
            q = self.db.query(func.count(RecruitVisit.id))
        if campaign_id is not None:
            q = q.filter(RecruitVisit.campaign_id == campaign_id)
        if employee_id is not None:
            q = q.filter(RecruitVisit.referrer_employee_id == employee_id)
        if extra is not None:
            q = q.filter(extra)
        for cond in self._time_range(start_date, end_date, RecruitVisit.entered_at):
            q = q.filter(cond)
        return q.scalar() or 0

    def _count_leads(
        self,
        campaign_id: str | None,
        employee_id: str | None,
        start_date: date | None,
        end_date: date | None,
        *,
        extra: ColumnElement[bool] | None = None,
    ) -> int:
        q = self.db.query(func.count(RecruitLead.id))
        if campaign_id is not None:
            q = q.filter(RecruitLead.campaign_id == campaign_id)
        if employee_id is not None:
            q = q.filter(RecruitLead.referrer_employee_id == employee_id)
        if extra is not None:
            q = q.filter(extra)
        for cond in self._time_range(start_date, end_date, RecruitLead.created_at):
            q = q.filter(cond)
        return q.scalar() or 0
