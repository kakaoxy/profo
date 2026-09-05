"""估价页分享埋点与统计服务.

与房源侧同构的 visit/share 埋点（免登录 visitor_id UV 口径），
「我的分享统计」留资口径 = ``Lead.referrer_id``（仅分享归因，不含
``creator_id`` 本人录入，与招募漏斗口径一致——迭代决策 #2）.
"""

from sqlalchemy.orm import Session

from models import Lead, User, ValuationShareEvent, ValuationVisit
from schemas.public import PublicShareEventRequest, PublicVisitEventRequest
from services.utils import aggregate_my_share_stats, resolve_valid_referrer


class ValuationShareTrackingService:
    """估价页分享埋点与「我的分享统计」服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def create_visit_event(self, data: PublicVisitEventRequest) -> ValuationVisit:
        """记录估价页访问埋点（PV +1，UV 按 visitor_id 去重）.

        referrer 经统一校验后落库：无效（不存在/非 active/无后台身份）时置空，
        防止伪造归属污染归因统计（与估价线索 referrer 口径一致）。
        """
        visit = ValuationVisit(
            visitor_id=data.visitor_id,
            referrer_employee_id=resolve_valid_referrer(self.db, data.referrer),
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
        lead_count 按 ``Lead.referrer_id``（仅分享归因）；聚合统一走
        ``aggregate_my_share_stats``（今日窗口为 Asia/Shanghai 自然日）。
        """
        return aggregate_my_share_stats(
            self.db,
            user_id=user.id,
            share_employee_col=ValuationShareEvent.employee_id,
            share_time_col=ValuationShareEvent.created_at,
            visit_referrer_col=ValuationVisit.referrer_employee_id,
            visit_uv_col=ValuationVisit.visitor_id,
            visit_time_col=ValuationVisit.created_at,
            lead_referrer_col=Lead.referrer_id,
            lead_time_col=Lead.created_at,
        )
