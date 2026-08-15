"""招募访问埋点与留资归因服务.

核心归因语义（对齐 9.6）：以手机号 ``phone_hash`` 为唯一键，
首次留资写入归属员工 ``referrer_employee_id``，重复留资永不覆盖。
"""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import User
from models.recruit import (
    RecruitCampaign,
    RecruitLead,
    RecruitLeadSource,
    RecruitLeadStatus,
    RecruitShareEvent,
    RecruitShareType,
    RecruitVisit,
)
from schemas.recruit import RecruitShareEventCreate, RecruitVisitCreate, RecruitVisitUpdate
from services.system.exceptions import ResourceNotFoundError
from services.system.wechat import WeChatAuthService
from settings import settings
from utils.crypto import hash_phone

logger = logging.getLogger(__name__)

_DEEP_VIEW_MIN_MS = 3000
_NOTIFY_PAGE_PATH = "pages/recruit/detail/index"


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
        try:
            self.db.commit()
            self.db.refresh(visit)
        except Exception:
            self.db.rollback()
            raise
        else:
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
        # 服务端复核：以前端 stayed_ms 与后端 elapsed 取"或"
        elapsed_ms = 0
        if visit.entered_at is not None and visit.exited_at is not None:
            elapsed_ms = int((visit.exited_at - visit.entered_at).total_seconds() * 1000)
        frontend_deep = data.stayed_ms is not None and data.stayed_ms >= _DEEP_VIEW_MIN_MS
        server_deep = elapsed_ms >= _DEEP_VIEW_MIN_MS
        visit.is_deep_view = data.is_deep_view or frontend_deep or server_deep
        visit.clicked_auth = data.clicked_auth

        try:
            self.db.commit()
            self.db.refresh(visit)
        except Exception:
            self.db.rollback()
            raise
        else:
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

        重复留资时已有归属永不覆盖；已有线索无归属且本次携带 referrer 时
        补充归属（见 ``_backfill_referrer``）。

        Returns:
            (lead, is_new)：首次留资返回 (新建线索, True)，重复返回 (已有线索, False)。

        """
        phone_hash = hash_phone(phone)
        existing = self.db.query(RecruitLead).filter(RecruitLead.phone_hash == phone_hash).first()
        if existing is not None:
            self._backfill_referrer(existing, referrer)
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
        try:
            self.db.commit()
            self.db.refresh(lead)
        except IntegrityError:
            # 并发场景：另一事务已插入相同 phone_hash，回滚后重查已有记录
            # 保证「首次留资归属生效，重复留资永不覆盖」语义
            self.db.rollback()
            existing = self.db.query(RecruitLead).filter(RecruitLead.phone_hash == phone_hash).first()
            if existing is not None:
                self._backfill_referrer(existing, referrer)
                self._mark_visit_authed(visit_id, user_id=user_id)
                return existing, False
            raise
        except Exception:
            self.db.rollback()
            raise
        else:
            self._mark_visit_authed(visit_id, user_id=user_id)
            return lead, True

    def create_share_event(self, user: User, data: RecruitShareEventCreate) -> RecruitShareEvent:
        """创建分享事件（漏斗第 1 级数据源）.

        Raises:
            ResourceNotFoundError: 指定活动不存在

        """
        if data.campaign_id is not None:
            exists = (
                self.db.query(RecruitCampaign.id).filter(RecruitCampaign.id == data.campaign_id).first() is not None
            )
            if not exists:
                msg = "招募活动不存在"
                raise ResourceNotFoundError(msg)
        event = RecruitShareEvent(
            id=str(uuid.uuid4()),
            campaign_id=data.campaign_id,
            employee_id=user.id,
            share_type=RecruitShareType.CARD if data.share_type == "card" else RecruitShareType.POSTER,
        )
        self.db.add(event)
        try:
            self.db.commit()
            self.db.refresh(event)
        except Exception:
            self.db.rollback()
            raise
        else:
            return event

    def _backfill_referrer(self, lead: RecruitLead, referrer: str | None) -> None:
        """补充无归属线索的归属员工.

        「重复留资永不覆盖」仅保护已有归属不被抢占；已有线索无归属
        （referrer_employee_id 为 NULL，如历史数据或首次留资未带 referrer）
        且本次留资携带归属员工时，补充写入归属，使员工「我的线索」
        列表与分享统计能正确计入该线索。已有归属时不动。

        注意：仅做字段赋值，不提交事务。由外层调用链中的 ``commit()``
        （如 ``_mark_visit_authed`` 或 ``submit_lead`` 的 ``commit()``）
        统一 flush 本变更，确保与外层事务边界一致。

        """
        if lead.referrer_employee_id is not None or not referrer:
            return
        lead.referrer_employee_id = referrer

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
            try:
                self.db.commit()
            except Exception:
                self.db.rollback()
                raise

    def notify_new_lead(self, lead: RecruitLead) -> None:
        """新线索订阅消息通知（同步阻塞，供路由层 run_in_threadpool 调用）.

        仅在首次新线索（is_new=True）创建成功后由留资链路触发；
        模板未配置 / 无归属员工 / 员工未绑定 openid 时 info 日志留痕并跳过，
        发送或查询出现的任何异常仅 logger 记录，绝不影响留资结果。
        通知内容仅含手机号后四位，不透传完整手机号明文。
        """
        try:
            template_id = settings.wechat_recruit_lead_template_id
            if not template_id:
                logger.info("订阅消息模板未配置，跳过新线索通知：lead_id=%s", lead.id)
                return
            if not lead.referrer_employee_id:
                logger.info("线索无归属员工，跳过新线索通知：lead_id=%s", lead.id)
                return
            employee = self.db.query(User).filter(User.id == lead.referrer_employee_id).first()
            if employee is None or not employee.wechat_openid:
                logger.info("归属员工未绑定微信 openid，跳过新线索通知：lead_id=%s", lead.id)
                return

            page = f"{_NOTIFY_PAGE_PATH}?campaign_id={lead.campaign_id}" if lead.campaign_id else None
            # 手机号后四位用于订阅消息文案；phone 为空/异常时降级为空串，避免 [-4:] 越界
            phone_tail = lead.phone[-4:] if lead.phone else ""
            data = {"phone4": {"value": phone_tail}}
            WeChatAuthService.send_subscribe_message(employee.wechat_openid, template_id, data, page=page)
        except Exception:
            logger.exception("新线索订阅消息发送失败：lead_id=%s", lead.id)
