"""招募线索后台查询与跟进状态流转服务."""

from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from models import User
from models.recruit import RecruitLead, RecruitLeadSource, RecruitLeadStatus, RecruitShareEvent, RecruitVisit
from schemas.recruit import RecruitLeadStatusUpdate
from services.system.exceptions import ResourceNotFoundError
from utils.time_windows import yesterday_window


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

    def delete(self, lead_id: str) -> None:
        """删除招募线索（硬删除，无关联表引用）.

        Args:
            lead_id: 线索ID

        Raises:
            ResourceNotFoundError: 线索不存在

        """
        lead = self.db.query(RecruitLead).filter(RecruitLead.id == lead_id).first()
        if lead is None:
            msg = "招募线索不存在"
            raise ResourceNotFoundError(msg)
        self.db.delete(lead)
        self.db.commit()

    def get_my_lead_phone(self, user: User, lead_id: str) -> tuple[str, RecruitLeadStatus]:
        """C 端员工查看归属线索的完整手机号（解密）.

        归属强制服务端过滤（``referrer_employee_id == user.id``），不存在或不
        归属统一抛 404，避免泄露线索存在性（IDOR 防护）。查看即视为已联系：
        ``new`` 线索自动流转为 ``contacted``（其他状态不动），返回流转后状态
        供前端就地更新卡片。访问由路由层记录日志。

        Args:
            user: 当前登录用户（C 端登录态）
            lead_id: 线索ID

        Returns:
            (完整手机号, 查看后的跟进状态)

        Raises:
            ResourceNotFoundError: 线索不存在或不归属当前用户

        """
        lead = (
            self.db.query(RecruitLead)
            .filter(RecruitLead.id == lead_id, RecruitLead.referrer_employee_id == user.id)
            .first()
        )
        if lead is None:
            msg = "招募线索不存在"
            raise ResourceNotFoundError(msg)

        if lead.status == RecruitLeadStatus.NEW:
            lead.status = RecruitLeadStatus.CONTACTED
            try:
                self.db.commit()
                self.db.refresh(lead)
            except Exception:
                self.db.rollback()
                raise
        return lead.phone, lead.status

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

    def list_my_leads(
        self,
        user: User,
        *,
        page: int,
        page_size: int,
        status: RecruitLeadStatus | None = None,
    ) -> dict[str, Any]:
        """C 端「我的线索」分页查询（归属强制服务端过滤，created_at 倒序）.

        仅返回 ``referrer_employee_id == user.id`` 的线索，员工维度由
        服务端从登录态取值，不接受任何前端传入的员工 ID（防越权）。
        返回结构对齐后台 ``list``：``{items, total, page, page_size}``，
        手机号脱敏由路由层用 ``mask_phone`` 构造响应（与后台列表口径一致）。
        """
        q = self.db.query(RecruitLead).filter(RecruitLead.referrer_employee_id == user.id)
        if status is not None:
            q = q.filter(RecruitLead.status == status)

        total = q.count()
        leads = q.order_by(RecruitLead.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return {"items": leads, "total": total, "page": page, "page_size": page_size}

    def get_my_share_stats(self, user: User) -> dict[str, int]:
        """C 端「我的分享统计」：分享次数 / 经我分享 PV / UV / 归属我的线索数（昨日 + 累计）.

        口径与漏斗服务一致：share_count 按 ``RecruitShareEvent.employee_id``（时间列
        ``shared_at``）、pv/uv 按 ``RecruitVisit.referrer_employee_id``（时间列
        ``entered_at``，uv 为 distinct openid_hash）、lead_count 按
        ``RecruitLead.referrer_employee_id``（时间列 ``created_at``）；昨日窗口为
        Asia/Shanghai 自然日（见 ``utils.time_windows.yesterday_window``）。
        """
        y_start, y_end = yesterday_window()
        share_q = self.db.query(RecruitShareEvent).filter(RecruitShareEvent.employee_id == user.id)
        visit_q = self.db.query(RecruitVisit).filter(RecruitVisit.referrer_employee_id == user.id)
        # 昨日窗口条件（不可变条件对象，pv/uv 两处复用）
        y_visit_window = [RecruitVisit.entered_at >= y_start, RecruitVisit.entered_at < y_end]
        uv_q = self.db.query(func.count(func.distinct(RecruitVisit.openid_hash))).filter(
            RecruitVisit.referrer_employee_id == user.id
        )
        lead_q = self.db.query(func.count(RecruitLead.id)).filter(RecruitLead.referrer_employee_id == user.id)

        return {
            "share_count": int(share_q.count()),
            "pv": int(visit_q.count()),
            "uv": int(uv_q.scalar() or 0),
            "lead_count": int(lead_q.scalar() or 0),
            "yesterday_share_count": int(
                share_q.filter(RecruitShareEvent.shared_at >= y_start, RecruitShareEvent.shared_at < y_end).count()
            ),
            "yesterday_pv": int(visit_q.filter(*y_visit_window).count()),
            "yesterday_uv": int(uv_q.filter(*y_visit_window).scalar() or 0),
            "yesterday_lead_count": int(
                lead_q.filter(RecruitLead.created_at >= y_start, RecruitLead.created_at < y_end).scalar() or 0
            ),
        }
