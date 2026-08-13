"""招募访问埋点与留资归因服务.

核心归因语义（对齐 9.6）：以手机号 ``phone_hash`` 为唯一键，
首次留资写入归属员工 ``referrer_employee_id``，重复留资永不覆盖。
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models import User
from models.recruit import (
    RecruitLead,
    RecruitLeadSource,
    RecruitLeadStatus,
    RecruitVisit,
)
from schemas.recruit import RecruitVisitCreate, RecruitVisitUpdate
from services.system.exceptions import ResourceNotFoundError
from utils.crypto import hash_phone

_DEEP_VIEW_MIN_MS = 3000


class RecruitAttributionService:
    """招募访问埋点与留资归因服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    @staticmethod
    def derive_openid_hash(user: User) -> str:
        """由微信 openid（缺失时回退用户 ID）派生稳定 UV 去重键."""
        return hash_phone(user.wechat_openid or user.id)

    def create_visit(self, user: User, data: RecruitVisitCreate) -> RecruitVisit:
        """创建访问记录（PV +1，UV 按 openid_hash 去重）."""
        visit = RecruitVisit(
            id=str(uuid.uuid4()),
            campaign_id=data.campaign_id,
            visitor_id=user.id,
            openid_hash=self.derive_openid_hash(user),
            referrer_employee_id=data.referrer,
            source=data.source,
        )
        self.db.add(visit)
        self.db.commit()
        self.db.refresh(visit)
        return visit

    def update_visit(self, visit_id: str, data: RecruitVisitUpdate, *, user_id: str) -> RecruitVisit:
        """上报离开，后端复核 is_deep_view（stayed_ms>=3000 与前端判定取或）.

        校验 visit 归属当前用户（visitor_id == user_id），不存在或不归属时
        统一抛 ResourceNotFoundError，避免泄露资源存在性（IDOR 防护）。
        """
        visit = (
            self.db.query(RecruitVisit).filter(RecruitVisit.id == visit_id, RecruitVisit.visitor_id == user_id).first()
        )
        if visit is None:
            msg = "访问记录不存在"
            raise ResourceNotFoundError(msg)

        visit.stayed_ms = data.stayed_ms
        visit.exited_at = datetime.now(timezone.utc)
        server_deep = data.stayed_ms is not None and data.stayed_ms >= _DEEP_VIEW_MIN_MS
        visit.is_deep_view = data.is_deep_view or server_deep
        visit.clicked_auth = data.clicked_auth

        self.db.commit()
        self.db.refresh(visit)
        return visit

    def submit_lead(
        self,
        phone: str,
        *,
        campaign_id: str | None,
        main_business_area: str,
        referrer: str | None,
        source: RecruitLeadSource,
        visit_id: str | None,
        user_id: str,
    ) -> tuple[RecruitLead, bool]:
        """提交留资并归因.

        Returns:
            (lead, is_new)：首次留资返回 (新建线索, True)，重复返回 (已有线索, False)。

        """
        phone_hash = hash_phone(phone)
        existing = self.db.query(RecruitLead).filter(RecruitLead.phone_hash == phone_hash).first()
        if existing is not None:
            self._mark_visit_authed(visit_id, user_id=user_id)
            return existing, False

        lead = RecruitLead(
            id=str(uuid.uuid4()),
            phone=phone,
            phone_hash=phone_hash,
            main_business_area=main_business_area,
            campaign_id=campaign_id,
            source=source,
            referrer_employee_id=referrer,
            status=RecruitLeadStatus.NEW,
        )
        self.db.add(lead)
        self.db.commit()
        self.db.refresh(lead)
        self._mark_visit_authed(visit_id, user_id=user_id)
        return lead, True

    def _mark_visit_authed(self, visit_id: str | None, *, user_id: str) -> None:
        """留资成功后标记对应访问记录 authed=true.

        校验 visit 归属当前用户（visitor_id == user_id），不归属时静默跳过
        （IDOR 防护：不允许通过他人 visit_id 标记 authed 状态）。
        """
        if not visit_id:
            return
        visit = (
            self.db.query(RecruitVisit).filter(RecruitVisit.id == visit_id, RecruitVisit.visitor_id == user_id).first()
        )
        if visit is not None:
            visit.authed = True
            self.db.commit()
