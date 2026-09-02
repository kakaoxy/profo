"""小程序「我的客户」写服务（状态流转 + 跟进记录）.

与读服务 ``my_customers.py`` 拆分（读写分层，避免单文件超 500 行）。
状态流转是「我的客户」的唯一写路径：
- recruit：矩阵校验通过后回写原生 RecruitLeadStatus（直接赋值，不触碰 is_internal）；
- valuation/sheet：支持 eliminated 淘汰旁路（reason 必填，按原因映射回写
  LeadStatus 并写 audit_time/auditor_id）与重新激活旁路（eliminated → contacted，
  remark 必填，回写 pending_visit；行级锁对齐 ``authorize_assessment`` 模式）；
- booking：原生状态即统一 5 态，参与全量矩阵流转（eliminated reason 必填，
  重新激活 remark 必填，行级锁同模式）。
remark 非空时自动落一条系统跟进记录（customer_follow_ups）。
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Lead, ProjectBooking, RecruitLead, RecruitLeadStatus, User
from models.common.base import LeadStatus
from models.growth_center import CustomerFollowUp
from schemas.growth_center import GrowthModule, MyCustomerStatusUpdateRequest, UnifiedLeadStatus
from services.growth_center.my_customers import ensure_customer_lead_owned
from services.growth_center.normalize import map_valuation_status
from services.system.exceptions import BusinessLogicError, ConflictError, ResourceNotFoundError

# 统一状态流转矩阵（目标状态集合；converted 为终态（空集，含流转到自身一律拒绝）；
# eliminated 非终态，仅可重新激活至 contacted，remark 必填）
_TRANSITIONS: dict[UnifiedLeadStatus, set[UnifiedLeadStatus]] = {
    UnifiedLeadStatus.NEW: {
        UnifiedLeadStatus.CONTACTED,
        UnifiedLeadStatus.HIGH_INTENT,
        UnifiedLeadStatus.CONVERTED,
        UnifiedLeadStatus.ELIMINATED,
    },
    UnifiedLeadStatus.CONTACTED: {
        UnifiedLeadStatus.HIGH_INTENT,
        UnifiedLeadStatus.CONVERTED,
        UnifiedLeadStatus.ELIMINATED,
    },
    UnifiedLeadStatus.HIGH_INTENT: {UnifiedLeadStatus.CONVERTED, UnifiedLeadStatus.ELIMINATED},
    UnifiedLeadStatus.CONVERTED: set(),
    UnifiedLeadStatus.ELIMINATED: {UnifiedLeadStatus.CONTACTED},
}

# 统一状态中文名（系统跟进记录文案）
_UNIFIED_STATUS_LABELS: dict[UnifiedLeadStatus, str] = {
    UnifiedLeadStatus.NEW: "新线索",
    UnifiedLeadStatus.CONTACTED: "已联系",
    UnifiedLeadStatus.HIGH_INTENT: "意向高",
    UnifiedLeadStatus.CONVERTED: "已转化",
    UnifiedLeadStatus.ELIMINATED: "已淘汰",
}

# 淘汰原因 → 估价/房源单原生状态（no_intent/invalid_info→REJECTED，lost_to_competitor→LOST）
_ELIMINATE_REASON_TO_LEAD_STATUS: dict[str, LeadStatus] = {
    "no_intent": LeadStatus.REJECTED,
    "invalid_info": LeadStatus.REJECTED,
    "lost_to_competitor": LeadStatus.LOST_TO_COMPETITOR,
}


def _ensure_transition_allowed(current: UnifiedLeadStatus, target: UnifiedLeadStatus) -> None:
    """统一状态矩阵校验（终态/回退/非法跳转 → 409）.

    Raises:
        ConflictError: 不允许的流转（含终态流转到自身）

    """
    if target not in _TRANSITIONS[current]:
        msg = f"不允许从「{_UNIFIED_STATUS_LABELS[current]}」流转为「{_UNIFIED_STATUS_LABELS[target]}」"
        raise ConflictError(msg)


def _ensure_reactivation_remark(
    current: UnifiedLeadStatus,
    target: UnifiedLeadStatus,
    remark: str | None,
) -> None:
    """重新激活旁路（eliminated → contacted）remark 必填（其余流转不校验）.

    Raises:
        BusinessLogicError: 重新激活时 remark 缺失（422）

    """
    if (
        current == UnifiedLeadStatus.ELIMINATED
        and target == UnifiedLeadStatus.CONTACTED
        and not (remark and remark.strip())
    ):
        msg = "重新激活必须填写备注"
        raise BusinessLogicError(msg)


class MyCustomerFlowService:
    """我的客户写服务（状态流转唯一写路径 + 跨模块跟进记录）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ─── 状态流转 ─────────────────────────────────────────────────────────

    def update_status(
        self,
        *,
        module: GrowthModule,
        lead_id: str,
        user_id: str,
        req: MyCustomerStatusUpdateRequest,
    ) -> dict[str, Any]:
        """状态流转（统一矩阵校验 → 按模块分发回写原生状态）.

        Args:
            module: 获客模块
            lead_id: 线索ID（各模块原生ID字符串）
            user_id: 当前操作员工ID
            req: 流转请求（目标统一状态/备注/淘汰原因）

        Returns:
            {unified_status, native_status}（流转后最新状态）

        Raises:
            ConflictError: 流转矩阵不合法 / 估价线非淘汰且非重新激活流转
            ResourceNotFoundError: 线索不存在或不归属当前用户
            BusinessLogicError: 淘汰旁路缺少 reason / 重新激活缺少 remark（422）

        """
        if module == GrowthModule.BOOKING:
            return self._update_booking_status(lead_id=lead_id, user_id=user_id, req=req)
        if module == GrowthModule.RECRUIT:
            return self._update_recruit_status(lead_id=lead_id, user_id=user_id, req=req)
        return self._update_lead_status(module=module, lead_id=lead_id, user_id=user_id, req=req)

    def _update_recruit_status(
        self,
        *,
        lead_id: str,
        user_id: str,
        req: MyCustomerStatusUpdateRequest,
    ) -> dict[str, Any]:
        """招募线流转：矩阵校验通过后回写原生状态（直接赋值，不触碰 is_internal）.

        重新激活旁路（eliminated → contacted）由矩阵统一放行，remark 必填。
        """
        lead = (
            self.db.query(RecruitLead)
            .filter(RecruitLead.id == lead_id, RecruitLead.referrer_employee_id == user_id)
            .first()
        )
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        current = UnifiedLeadStatus(lead.status.value)
        _ensure_transition_allowed(current, req.status)
        _ensure_reactivation_remark(current, req.status, req.remark)

        lead.status = RecruitLeadStatus(req.status.value)
        # remark 系统跟进与状态回写同一事务提交（原子化，避免中途失败丢记录）
        self._add_system_follow_up_if_remarked(
            module=GrowthModule.RECRUIT,
            lead_id=lead_id,
            user_id=user_id,
            current=current,
            status=req.status,
            remark=req.remark,
        )
        self.db.commit()
        self.db.refresh(lead)
        return {"unified_status": UnifiedLeadStatus(lead.status.value), "native_status": lead.status.value}

    def _update_lead_status(
        self,
        *,
        module: GrowthModule,
        lead_id: str,
        user_id: str,
        req: MyCustomerStatusUpdateRequest,
    ) -> dict[str, Any]:
        """估价/房源单线流转：eliminated 淘汰旁路 + 重新激活（行级锁防并发）.

        归属校验（ensure_customer_lead_owned，含内部员工提交线索剔除）通过后，
        行级锁重读——锁持至 commit 保证「检查状态 → 流转」原子化，与
        ``LeadService.authorize_assessment`` 模式一致。

        重新激活旁路（eliminated → contacted）原生状态回写 pending_visit，
        不写审计字段（audit_time/auditor_id/audit_reason 为淘汰语义）。

        """
        ensure_customer_lead_owned(self.db, module, lead_id, user_id)
        if req.status not in (UnifiedLeadStatus.ELIMINATED, UnifiedLeadStatus.CONTACTED):
            msg = "估价/房源单线索仅支持「淘汰」旁路与「重新激活」流转"
            raise ConflictError(msg)
        if req.status == UnifiedLeadStatus.ELIMINATED and not req.reason:
            msg = "淘汰原因必填"
            raise BusinessLogicError(msg)

        # 行级锁重读附带归属+模块条件：锁前校验与加锁之间存在窗口期，
        # 防归属/模块（source_property_id 判别 valuation/sheet）被并发改写（TOCTOU）
        query = self.db.query(Lead).filter(Lead.id == lead_id, Lead.referrer_id == user_id, Lead.is_deleted.is_(False))
        query = (
            query.filter(Lead.source_property_id.isnot(None))
            if module == GrowthModule.SHEET
            else query.filter(Lead.source_property_id.is_(None))
        )
        lead = query.with_for_update().first()
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        current = map_valuation_status(LeadStatus(lead.status.value))
        _ensure_transition_allowed(current, req.status)

        unified_after: UnifiedLeadStatus
        if req.status == UnifiedLeadStatus.ELIMINATED:
            lead.status = _ELIMINATE_REASON_TO_LEAD_STATUS[req.reason]
            # 写审计轨迹（与 authorize_assessment 的 reject/lost 口径一致）
            now = datetime.now(timezone.utc)
            lead.audit_time = now
            lead.auditor_id = user_id
            lead.audit_reason = req.remark
            lead.updated_at = now
            unified_after = UnifiedLeadStatus.ELIMINATED
        else:
            # 重新激活旁路（仅 eliminated → contacted）：矩阵放行 new→contacted
            # 等普通流转，估价/房源单线在此显式收窄为 409
            if current != UnifiedLeadStatus.ELIMINATED:
                msg = "估价/房源单线索仅支持「淘汰」旁路与「重新激活」流转"
                raise ConflictError(msg)
            _ensure_reactivation_remark(current, req.status, req.remark)
            lead.status = LeadStatus.PENDING_VISIT
            unified_after = UnifiedLeadStatus.CONTACTED

        # remark 系统跟进与状态回写同一事务提交（原子化，避免中途失败丢记录）
        self._add_system_follow_up_if_remarked(
            module=module,
            lead_id=lead_id,
            user_id=user_id,
            current=current,
            status=req.status,
            remark=req.remark,
        )
        self.db.commit()
        self.db.refresh(lead)
        return {"unified_status": unified_after, "native_status": lead.status.value}

    def _update_booking_status(
        self,
        *,
        lead_id: str,
        user_id: str,
        req: MyCustomerStatusUpdateRequest,
    ) -> dict[str, Any]:
        """预约线流转：原生状态即统一 5 态，参与全量矩阵流转（行级锁防并发）.

        归属校验（ensure_customer_lead_owned）通过后行级锁重读——锁持至 commit
        保证「检查状态 → 流转」原子化（与估价线一致）。目标 eliminated 时
        reason 必填（与估价线对齐）；重新激活（eliminated → contacted）remark 必填。

        Raises:
            ResourceNotFoundError: 线索不存在或不归属当前用户
            ConflictError: 流转矩阵不合法
            BusinessLogicError: 淘汰缺 reason / 重新激活缺 remark（422）

        """
        ensure_customer_lead_owned(self.db, GrowthModule.BOOKING, lead_id, user_id)
        try:
            booking_id = int(lead_id)
        except ValueError as exc:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg) from exc
        if req.status == UnifiedLeadStatus.ELIMINATED and not req.reason:
            msg = "淘汰原因必填"
            raise BusinessLogicError(msg)

        # 行级锁重读附带归属条件（防归属被并发改写，TOCTOU），锁持至 commit
        booking = (
            self.db.query(ProjectBooking)
            .filter(ProjectBooking.id == booking_id, ProjectBooking.referrer_user_id == user_id)
            .with_for_update()
            .first()
        )
        if booking is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        current = UnifiedLeadStatus(booking.status)
        _ensure_transition_allowed(current, req.status)
        _ensure_reactivation_remark(current, req.status, req.remark)

        booking.status = req.status.value
        # remark 系统跟进与状态回写同一事务提交（原子化，避免中途失败丢记录）
        self._add_system_follow_up_if_remarked(
            module=GrowthModule.BOOKING,
            lead_id=lead_id,
            user_id=user_id,
            current=current,
            status=req.status,
            remark=req.remark,
        )
        self.db.commit()
        self.db.refresh(booking)
        return {"unified_status": UnifiedLeadStatus(booking.status), "native_status": booking.status}

    def _add_system_follow_up_if_remarked(
        self,
        *,
        module: GrowthModule,
        lead_id: str,
        user_id: str,
        current: UnifiedLeadStatus,
        status: UnifiedLeadStatus,
        remark: str | None,
    ) -> None:
        """Remark 非空时向会话添加一条系统跟进记录（不提交，由调用方统一 commit）.

        重新激活流转（eliminated → contacted）使用「重新激活」语义文案。

        """
        if not remark or not remark.strip():
            return
        if current == UnifiedLeadStatus.ELIMINATED and status == UnifiedLeadStatus.CONTACTED:
            content = f"重新激活为{_UNIFIED_STATUS_LABELS[status]}：{remark.strip()}"
        else:
            content = f"状态流转为{_UNIFIED_STATUS_LABELS[status]}：{remark.strip()}"
        rec = CustomerFollowUp(
            module=module.value,
            lead_id=lead_id,
            content=content,
            created_by_id=user_id,
        )
        self.db.add(rec)

    # ─── 跟进记录 ─────────────────────────────────────────────────────────

    def list_follow_ups(self, *, module: GrowthModule, lead_id: str, user_id: str) -> list[dict[str, Any]]:
        """跟进记录列表（created_at 倒序，先做归属校验）.

        Returns:
            记录字典列表（含 created_by_name，nickname 缺失回退 username）

        Raises:
            ResourceNotFoundError: 线索不存在或不归属当前用户

        """
        ensure_customer_lead_owned(self.db, module, lead_id, user_id)
        rows = (
            self.db.query(CustomerFollowUp)
            .filter(CustomerFollowUp.module == module.value, CustomerFollowUp.lead_id == lead_id)
            .order_by(CustomerFollowUp.created_at.desc())
            .all()
        )
        names = _employee_names(self.db, [row.created_by_id for row in rows])
        return [
            {
                "id": row.id,
                "module": row.module,
                "lead_id": row.lead_id,
                "content": row.content,
                "created_by_id": row.created_by_id,
                "created_by_name": names.get(row.created_by_id),
                "created_at": row.created_at,
            }
            for row in rows
        ]

    def create_follow_up(self, *, module: GrowthModule, lead_id: str, user_id: str, content: str) -> dict[str, Any]:
        """新增跟进记录（归属校验后写入，created_by_id=当前用户）.

        Raises:
            ResourceNotFoundError: 线索不存在或不归属当前用户

        """
        ensure_customer_lead_owned(self.db, module, lead_id, user_id)
        rec = CustomerFollowUp(module=module.value, lead_id=lead_id, content=content, created_by_id=user_id)
        self.db.add(rec)
        self.db.commit()
        self.db.refresh(rec)
        names = _employee_names(self.db, [rec.created_by_id])
        return {
            "id": rec.id,
            "module": rec.module,
            "lead_id": rec.lead_id,
            "content": rec.content,
            "created_by_id": rec.created_by_id,
            "created_by_name": names.get(rec.created_by_id),
            "created_at": rec.created_at,
        }


def _employee_names(db: Session, user_ids: list[str]) -> dict[str, str | None]:
    """批量解析员工名称（nickname 缺失回退 username，去重单查避免 N+1）."""
    unique_ids = list(dict.fromkeys(user_ids))
    if not unique_ids:
        return {}
    rows = db.query(User.id, func.coalesce(User.nickname, User.username)).filter(User.id.in_(unique_ids)).all()
    return {row[0]: row[1] for row in rows}
