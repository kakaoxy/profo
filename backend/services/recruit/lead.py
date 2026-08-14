"""招募线索后台查询与跟进状态流转服务."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from models import User
from models.recruit import RecruitLead, RecruitLeadSource, RecruitLeadStatus
from schemas.recruit import RecruitLeadStatusUpdate
from services.system.exceptions import ResourceNotFoundError


def _time_range(
    start_date: date | None, end_date: date | None, col: ColumnElement[datetime]
) -> list[ColumnElement[bool]]:
    """构建创建时间区间过滤条件（左闭右开，与漏斗服务口径一致）."""
    conditions: list[ColumnElement[bool]] = []
    if start_date is not None:
        start = datetime.combine(start_date, time.min, tzinfo=timezone.utc)
        conditions.append(col >= start)
    if end_date is not None:
        end = datetime.combine(end_date, time.min, tzinfo=timezone.utc) + timedelta(days=1)
        conditions.append(col < end)
    return conditions


class RecruitLeadService:
    """招募线索后台服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def list(
        self,
        *,
        page: int,
        page_size: int,
        employee_id: str | None = None,
        status: RecruitLeadStatus | None = None,
        source: RecruitLeadSource | None = None,
        business_area: str | None = None,
        campaign_id: str | None = None,
        start_date: date | None = None,
        end_date: date | None = None,
        search: str | None = None,
    ) -> dict[str, Any]:
        """分页查询线索，附带归属员工昵称（outer join User）.

        支持多维度筛选：员工 / 状态 / 来源 / 主营商圈（精确）/ 活动 /
        创建时间区间（左闭右开）/ 主营商圈关键词模糊搜索。
        手机号加密存储，不支持按手机号搜索。
        """
        referrer_label = func.coalesce(User.nickname, User.username)
        q = self.db.query(RecruitLead, referrer_label).outerjoin(User, User.id == RecruitLead.referrer_employee_id)

        if employee_id is not None:
            q = q.filter(RecruitLead.referrer_employee_id == employee_id)
        if status is not None:
            q = q.filter(RecruitLead.status == status)
        if source is not None:
            q = q.filter(RecruitLead.source == source)
        if business_area is not None:
            q = q.filter(RecruitLead.main_business_area == business_area)
        if campaign_id is not None:
            q = q.filter(RecruitLead.campaign_id == campaign_id)
        if search is not None and search.strip():
            q = q.filter(RecruitLead.main_business_area.ilike(f"%{search.strip()}%"))
        for cond in _time_range(start_date, end_date, RecruitLead.created_at):
            q = q.filter(cond)

        total = q.count()
        rows = q.order_by(RecruitLead.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {"items": rows, "total": total, "page": page, "page_size": page_size}

    def get_phone(self, lead_id: str) -> str:
        """获取线索完整手机号（解密），供持写权限端点查看.

        Args:
            lead_id: 线索ID

        Returns:
            完整手机号

        Raises:
            ResourceNotFoundError: 线索不存在

        """
        lead = self.db.query(RecruitLead).filter(RecruitLead.id == lead_id).first()
        if lead is None:
            msg = "招募线索不存在"
            raise ResourceNotFoundError(msg)
        return lead.phone

    def update_status(self, lead_id: str, data: RecruitLeadStatusUpdate) -> tuple[RecruitLead, str | None]:
        """跟进状态流转（可选人工标记内部员工）.

        Returns:
            (lead, referrer_nickname)：归属员工昵称（无归属员工时为 None），
            供路由层填充 ``RecruitLeadListItem.referrer_name``，与列表端点口径一致。

        """
        lead = self.db.query(RecruitLead).filter(RecruitLead.id == lead_id).first()
        if lead is None:
            msg = "招募线索不存在"
            raise ResourceNotFoundError(msg)

        lead.status = data.status
        if data.is_internal is not None:
            lead.is_internal = data.is_internal

        self.db.commit()
        self.db.refresh(lead)

        # 查询归属员工昵称（nickname 缺失时回退 username），保持与 list 端点响应一致
        nickname: str | None = None
        if lead.referrer_employee_id:
            row = (
                self.db.query(func.coalesce(User.nickname, User.username))
                .filter(User.id == lead.referrer_employee_id)
                .first()
            )
            if row is not None:
                nickname = row[0]
        return lead, nickname
