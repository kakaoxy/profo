"""估价页分享埋点与统计服务.

与房源侧同构的 visit/share 埋点（免登录 visitor_id UV 口径），
「我的分享统计」留资口径 = ``Lead.referrer_id``（仅分享归因，不含
``creator_id`` 本人录入，与招募漏斗口径一致——迭代决策 #2）.
"""

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Lead, User, ValuationShareEvent, ValuationVisit
from schemas.public import PublicShareEventRequest, PublicVisitEventRequest
from utils.time_windows import today_window


class ValuationShareTrackingService:
    """估价页分享埋点与「我的分享统计」服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_visit_event(self, data: PublicVisitEventRequest) -> ValuationVisit:
        """记录估价页访问埋点（PV +1，UV 按 visitor_id 去重）.

        referrer 非空即原样落库（与招募 visit 口径一致，不做内部用户校验）。
        """
        visit = ValuationVisit(
            visitor_id=data.visitor_id,
            referrer_employee_id=data.referrer,
            source=data.source,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def create_share_event(self, user: User, data: PublicShareEventRequest) -> ValuationShareEvent:
        """记录估价页分享事件（employee_id 服务端取当前登录用户，禁止前端传入）."""
        event = ValuationShareEvent(
            employee_id=user.id,
            share_type=data.share_type,
        )
        self.db.add(event)
        self.db.commit()
        self.db.refresh(event)
        return event

    def get_my_share_stats(self, user: User) -> dict[str, int]:
        """C 端「我的评估分享统计」：分享次数 / PV / UV / 留资（今日 + 累计）.

        口径：share_count 按 ``ValuationShareEvent.employee_id``、pv/uv 按
        ``ValuationVisit.referrer_employee_id``（uv 为 distinct visitor_id）、
        lead_count 按 ``Lead.referrer_id``（仅分享归因）；今日窗口为
        Asia/Shanghai 自然日（见 ``utils.time_windows.today_window``）。
        """
        t_start, t_end = today_window()
        share_q = self.db.query(ValuationShareEvent).filter(ValuationShareEvent.employee_id == user.id)
        visit_q = self.db.query(ValuationVisit).filter(ValuationVisit.referrer_employee_id == user.id)
        # 今日窗口条件（不可变条件对象，pv/uv 两处复用）
        t_visit_window = [ValuationVisit.created_at >= t_start, ValuationVisit.created_at < t_end]
        uv_q = self.db.query(func.count(func.distinct(ValuationVisit.visitor_id))).filter(
            ValuationVisit.referrer_employee_id == user.id
        )
        lead_q = self.db.query(func.count(Lead.id)).filter(Lead.referrer_id == user.id)

        return {
            "share_count": int(share_q.count()),
            "pv": int(visit_q.count()),
            "uv": int(uv_q.scalar() or 0),
            "lead_count": int(lead_q.scalar() or 0),
            "today_share_count": int(
                share_q.filter(
                    ValuationShareEvent.created_at >= t_start, ValuationShareEvent.created_at < t_end
                ).count()
            ),
            "today_pv": int(visit_q.filter(*t_visit_window).count()),
            "today_uv": int(uv_q.filter(*t_visit_window).scalar() or 0),
            "today_lead_count": int(lead_q.filter(Lead.created_at >= t_start, Lead.created_at < t_end).scalar() or 0),
        }
