"""管理端获客中心统一线索写服务（状态流转 + 兜底员工指派 + 全局兜底负责人 + 完整手机号查看）.

管理端统一线索页的写路径，状态流转口径与小程序「我的客户」状态机
（``my_customers_flow`` / 叶子模块 ``flow_matrix``）完全一致：
- recruit：分发 ``RecruitLeadService.update_status``（方法内含统一矩阵校验、
  is_internal 标记与归属员工通知挂点），重新激活 remark 必填在分发前校验
  （``RecruitLeadStatusUpdate`` 无 remark 字段）；
- booking：全矩阵流转（eliminated reason 必填 422，重新激活 remark 必填 422，
  行级锁防并发），不做归属过滤；
- valuation/sheet：仅「淘汰」旁路（reason 必填，按原因映射回写 LeadStatus 并写
  审计字段）与「重新激活」（eliminated → contacted，remark 必填，回写
  pending_visit 不写审计字段），其余流转 409，不做归属过滤。

remark 非空自动落一条系统跟进记录（复用 ``add_system_follow_up_if_remarked``）；
状态实际变化时 best-effort 推送订阅通知给归属员工（通知内部捕获一切异常）。
"""

import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (
    L4MarketingProject,
    Lead,
    ProjectBooking,
    RecruitCampaign,
    RecruitLead,
    RecruitLeadStatus,
    SystemConfig,
    User,
)
from models.common.base import LeadStatus
from schemas.growth_center import (
    GrowthModule,
    MyCustomerStatusUpdateRequest,
    UnifiedLeadStatus,
)
from schemas.recruit import RecruitLeadStatusUpdate
from services.growth_center.customer_notify import notify_customer_status_changed, notify_new_customer_lead
from services.growth_center.flow_matrix import (
    UNIFIED_STATUS_LABELS,
    ensure_reactivation_remark,
    ensure_transition_allowed,
)
from services.growth_center.my_customers_flow import (
    ELIMINATE_REASON_TO_LEAD_STATUS,
    add_system_follow_up_if_remarked,
)
from services.growth_center.normalize import map_valuation_status
from services.recruit.lead import RecruitLeadService
from services.system.exceptions import BusinessLogicError, ConflictError, ResourceNotFoundError
from services.utils.referrer import (
    GROWTH_GLOBAL_FALLBACK_KEY,
    resolve_valid_referrer,
)

logger = logging.getLogger(__name__)


class AdminLeadFlowService:
    """管理端统一线索写服务（状态流转口径与小程序「我的客户」一致）."""

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
            user_id: 当前操作人ID（系统跟进记录 created_by_id / 淘汰审计 auditor_id）
            req: 流转请求（目标统一状态/备注/淘汰原因）

        Returns:
            {unified_status, native_status}（流转后最新状态）

        Raises:
            ConflictError: 流转矩阵不合法 / 估价线非淘汰且非重新激活流转
            ResourceNotFoundError: 线索不存在
            BusinessLogicError: 淘汰旁路缺少 reason / 重新激活缺少 remark（422）

        """
        if module == GrowthModule.RECRUIT:
            return self._update_recruit_status(lead_id=lead_id, user_id=user_id, req=req)
        if module == GrowthModule.BOOKING:
            return self._update_booking_status(lead_id=lead_id, user_id=user_id, req=req)
        return self._update_lead_status(module=module, lead_id=lead_id, user_id=user_id, req=req)

    def _update_recruit_status(
        self,
        *,
        lead_id: str,
        user_id: str,
        req: MyCustomerStatusUpdateRequest,
    ) -> dict[str, Any]:
        """招募线流转：分发 ``RecruitLeadService.update_status``（方法内含矩阵校验）.

        重新激活旁路（eliminated → contacted）remark 必填在分发前校验
        （旧端点 schema ``RecruitLeadStatusUpdate`` 无 remark 字段，不能内收）；
        系统跟进记录先挂会话，由 update_status 内部 commit 与状态回写原子提交；
        is_internal 标记不触碰（unified 请求无该字段），归属员工通知由
        update_status 既有挂点负责。

        """
        lead = self.db.query(RecruitLead).filter(RecruitLead.id == lead_id).first()
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        current = UnifiedLeadStatus(lead.status.value)
        ensure_reactivation_remark(current, req.status, req.remark)

        # remark 系统跟进先挂会话，与状态回写同一事务提交（原子化，避免中途失败丢记录）
        add_system_follow_up_if_remarked(
            self.db,
            module=GrowthModule.RECRUIT,
            lead_id=lead_id,
            user_id=user_id,
            current=current,
            status=req.status,
            remark=req.remark,
        )
        lead_after, _nickname = RecruitLeadService(self.db).update_status(
            lead_id,
            RecruitLeadStatusUpdate(status=RecruitLeadStatus(req.status.value)),
        )
        return {
            "unified_status": UnifiedLeadStatus(lead_after.status.value),
            "native_status": lead_after.status.value,
        }

    def _update_booking_status(
        self,
        *,
        lead_id: str,
        user_id: str,
        req: MyCustomerStatusUpdateRequest,
    ) -> dict[str, Any]:
        """预约线流转：原生状态即统一 5 态，参与全量矩阵流转（行级锁防并发）.

        与「我的客户」口径一致，但不做归属过滤（管理端全量可流转）——仅按 id
        行级锁重读，锁持至 commit 保证「检查状态 → 流转」原子化。目标 eliminated
        时 reason 必填；重新激活（eliminated → contacted）remark 必填。

        Raises:
            ResourceNotFoundError: 线索不存在
            ConflictError: 流转矩阵不合法
            BusinessLogicError: 淘汰缺 reason / 重新激活缺 remark（422）

        """
        try:
            booking_id = int(lead_id)
        except ValueError as exc:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg) from exc
        if req.status == UnifiedLeadStatus.ELIMINATED and not req.reason:
            msg = "淘汰原因必填"
            raise BusinessLogicError(msg)

        booking = self.db.query(ProjectBooking).filter(ProjectBooking.id == booking_id).with_for_update().first()
        if booking is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        current = UnifiedLeadStatus(booking.status)
        ensure_transition_allowed(current, req.status)
        ensure_reactivation_remark(current, req.status, req.remark)

        booking.status = req.status.value
        # remark 系统跟进与状态回写同一事务提交（原子化，避免中途失败丢记录）
        add_system_follow_up_if_remarked(
            self.db,
            module=GrowthModule.BOOKING,
            lead_id=lead_id,
            user_id=user_id,
            current=current,
            status=req.status,
            remark=req.remark,
        )
        self.db.commit()
        self.db.refresh(booking)

        # 状态实际变化时 best-effort 通知归属员工（通知内部捕获一切异常）
        if current != UnifiedLeadStatus(booking.status):
            notify_customer_status_changed(
                self.db,
                GrowthModule.BOOKING.value,
                lead_id,
                booking.referrer_user_id,
                UNIFIED_STATUS_LABELS[UnifiedLeadStatus(booking.status)],
                self._booking_summary(booking.marketing_project_id),
            )
        return {"unified_status": UnifiedLeadStatus(booking.status), "native_status": booking.status}

    def _update_lead_status(
        self,
        *,
        module: GrowthModule,
        lead_id: str,
        user_id: str,
        req: MyCustomerStatusUpdateRequest,
    ) -> dict[str, Any]:
        """估价/房源单线流转：eliminated 淘汰旁路 + 重新激活（行级锁防并发）.

        与「我的客户」口径一致，但不做归属过滤——仅保留 ``is_deleted`` 软删除
        过滤与 ``source_property_id`` 模块判别（房源单承接线索非空，估价线索为空），
        行级锁重读锁持至 commit。淘汰旁路按原因映射回写原生状态并写审计轨迹
        （audit_time/auditor_id/audit_reason，auditor 为当前操作管理员）；
        重新激活回写 pending_visit，不写审计字段。

        Raises:
            ResourceNotFoundError: 线索不存在
            ConflictError: 非淘汰/重新激活流转或矩阵不合法
            BusinessLogicError: 淘汰缺 reason / 重新激活缺 remark（422）

        """
        if req.status not in (UnifiedLeadStatus.ELIMINATED, UnifiedLeadStatus.CONTACTED):
            msg = "估价/房源单线索仅支持「淘汰」旁路与「重新激活」流转"
            raise ConflictError(msg)
        if req.status == UnifiedLeadStatus.ELIMINATED and not req.reason:
            msg = "淘汰原因必填"
            raise BusinessLogicError(msg)

        # 行级锁重读附带模块条件（source_property_id 判别 valuation/sheet），锁持至 commit
        query = self.db.query(Lead).filter(Lead.id == lead_id, Lead.is_deleted.is_(False))
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
        ensure_transition_allowed(current, req.status)

        unified_after: UnifiedLeadStatus
        if req.status == UnifiedLeadStatus.ELIMINATED:
            lead.status = ELIMINATE_REASON_TO_LEAD_STATUS[req.reason]
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
            ensure_reactivation_remark(current, req.status, req.remark)
            lead.status = LeadStatus.PENDING_VISIT
            unified_after = UnifiedLeadStatus.CONTACTED

        # remark 系统跟进与状态回写同一事务提交（原子化，避免中途失败丢记录）
        add_system_follow_up_if_remarked(
            self.db,
            module=module,
            lead_id=lead_id,
            user_id=user_id,
            current=current,
            status=req.status,
            remark=req.remark,
        )
        self.db.commit()
        self.db.refresh(lead)

        # 状态实际变化时 best-effort 通知归属员工（通知内部捕获一切异常）
        if current != unified_after:
            notify_customer_status_changed(
                self.db,
                module.value,
                lead_id,
                lead.referrer_id,
                UNIFIED_STATUS_LABELS[unified_after],
                lead.community_name or "",
            )
        return {"unified_status": unified_after, "native_status": lead.status.value}

    def _booking_summary(self, marketing_project_id: int) -> str:
        """预约线通知摘要：房源标题（取不到为空串，通知侧自动容错）."""
        row = self.db.query(L4MarketingProject.title).filter(L4MarketingProject.id == marketing_project_id).first()
        return row[0] if row else ""

    # ─── 兜底员工指派 ─────────────────────────────────────────────────────

    def assign_employee(self, *, module: GrowthModule, lead_id: str, employee_id: str) -> dict[str, Any]:
        """管理端为无归属线索指派兜底员工（仅归属为空可指派，已归属 409 不可改派）.

        四模块通用：booking/valuation/sheet/recruit 均按当前归属为空（无分享
        归因）才允许指派——招募 referrer 语义为「首次留资写入，此后永不更新」，
        从 NULL 填充视为首次写入，已归属永不改派。指派员工经
        ``resolve_valid_referrer`` 校验（存在 + active + 后台身份，无效 422）。
        指派成功后 best-effort 推送新线索留资通知给该员工（通知内部捕获一切异常）。

        Raises:
            ResourceNotFoundError: 线索不存在
            ConflictError: 线索已有归属员工
            BusinessLogicError: 员工不存在 / 非 active / 无后台身份（422）

        """
        valid_employee_id = resolve_valid_referrer(self.db, employee_id)
        if valid_employee_id is None:
            msg = "员工不存在或无后台身份"
            raise BusinessLogicError(msg)

        if module == GrowthModule.BOOKING:
            summary = self._assign_booking(lead_id, valid_employee_id)
        elif module == GrowthModule.RECRUIT:
            summary = self._assign_recruit(lead_id, valid_employee_id)
        else:
            summary = self._assign_lead(module, lead_id, valid_employee_id)

        self.db.commit()
        # best-effort 新线索留资通知（通知内部捕获一切异常）
        notify_new_customer_lead(self.db, module.value, lead_id, valid_employee_id, summary)
        return {"employee_id": valid_employee_id, "employee_name": self._employee_name(valid_employee_id)}

    def _assign_booking(self, lead_id: str, employee_id: str) -> str:
        """预约线指派（行级锁防并发，锁持至 commit），返回通知摘要."""
        try:
            booking_id = int(lead_id)
        except ValueError as exc:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg) from exc
        booking = self.db.query(ProjectBooking).filter(ProjectBooking.id == booking_id).with_for_update().first()
        if booking is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        if booking.referrer_user_id is not None:
            msg = "线索已有归属员工"
            raise ConflictError(msg)
        booking.referrer_user_id = employee_id
        return self._booking_summary(booking.marketing_project_id)

    def _assign_recruit(self, lead_id: str, employee_id: str) -> str:
        """招募线指派（行级锁防并发），返回通知摘要（活动名称）."""
        lead = self.db.query(RecruitLead).filter(RecruitLead.id == lead_id).with_for_update().first()
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        if lead.referrer_employee_id is not None:
            msg = "线索已有归属员工"
            raise ConflictError(msg)
        lead.referrer_employee_id = employee_id
        if lead.campaign_id is None:
            return ""
        row = self.db.query(RecruitCampaign.name).filter(RecruitCampaign.id == lead.campaign_id).first()
        return row[0] if row else ""

    def _assign_lead(self, module: GrowthModule, lead_id: str, employee_id: str) -> str:
        """估价/房源单线指派（行级锁 + source_property_id 模块判别），返回通知摘要."""
        query = self.db.query(Lead).filter(Lead.id == lead_id, Lead.is_deleted.is_(False))
        query = (
            query.filter(Lead.source_property_id.isnot(None))
            if module == GrowthModule.SHEET
            else query.filter(Lead.source_property_id.is_(None))
        )
        lead = query.with_for_update().first()
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        if lead.referrer_id is not None:
            msg = "线索已有归属员工"
            raise ConflictError(msg)
        lead.referrer_id = employee_id
        return lead.community_name or ""

    def _employee_name(self, employee_id: str) -> str | None:
        """员工名称（nickname 缺失回退 username，与统一列表口径一致）."""
        row = self.db.query(func.coalesce(User.nickname, User.username)).filter(User.id == employee_id).first()
        return row[0] if row else None

    # ─── 全局兜底负责人 ───────────────────────────────────────────────────

    def get_fallback_employee(self) -> dict[str, Any]:
        """查询全局兜底负责人配置（未设置/已清除时两字段均为 None）.

        读取不做 active/后台身份校验——员工被停用后仍回显其名，便于管理员
        感知「配置存在但已失效」并重新设置；留资链路侧经
        ``resolve_global_fallback_referrer`` 校验失效自动降级。

        """
        value = self.db.query(SystemConfig.value).filter(SystemConfig.key == GROWTH_GLOBAL_FALLBACK_KEY).scalar()
        if not value:
            return {"employee_id": None, "employee_name": None}
        return {"employee_id": value, "employee_name": self._employee_name(value)}

    def set_fallback_employee(self, *, employee_id: str | None, operator_id: str) -> dict[str, Any]:
        """设置/清除全局兜底负责人（仅影响后续新建留资的兜底归属，不改存量线索）.

        Args:
            employee_id: 目标员工ID（None=清除设置）
            operator_id: 当前操作管理员ID（写入 updated_by_id 审计）

        Returns:
            {employee_id, employee_name}（清除后两字段均为 None）

        Raises:
            BusinessLogicError: 员工不存在 / 非 active / 无后台身份（422）；配置行写入失败

        """
        if employee_id is None:
            valid_id, name = None, None
        else:
            valid_id = resolve_valid_referrer(self.db, employee_id)
            if valid_id is None:
                msg = "员工不存在或无后台身份"
                raise BusinessLogicError(msg)
            name = self._employee_name(valid_id)

        row = (
            self.db.query(SystemConfig).filter(SystemConfig.key == GROWTH_GLOBAL_FALLBACK_KEY).with_for_update().first()
        )
        if row is None:
            # 首次创建路径无行可锁：依赖 flush 撞唯一索引 uq_system_configs_key 后的
            # IntegrityError 回退 + 加锁重查（与 services/projects/renovation.py 同口径），
            # 避免两个管理员并发保存时向用户抛 500
            self.db.add(SystemConfig(key=GROWTH_GLOBAL_FALLBACK_KEY, value=valid_id, updated_by_id=operator_id))
            try:
                self.db.flush()
            except IntegrityError:
                logger.info("全局兜底负责人配置并发创建，回退为更新已有行：key=%s", GROWTH_GLOBAL_FALLBACK_KEY)
                self.db.rollback()
            row = (
                self.db.query(SystemConfig)
                .filter(SystemConfig.key == GROWTH_GLOBAL_FALLBACK_KEY)
                .with_for_update()
                .first()
            )
        if row is None:
            # 理论不可达：唯一索引冲突必然意味着并发事务已提交该行；显式报错而非静默丢弃
            msg = "全局兜底负责人配置写入失败"
            raise BusinessLogicError(msg)
        row.value = valid_id
        row.updated_by_id = operator_id
        self.db.commit()
        logger.info(
            "获客中心全局兜底负责人已更新：value=%s, operator=%s",
            valid_id,
            operator_id,
        )
        return {"employee_id": valid_id, "employee_name": name}

    # ─── 完整手机号查看 ───────────────────────────────────────────────────

    def reveal_phone(self, *, module: GrowthModule, lead_id: str) -> dict[str, Any]:
        """管理端查看线索完整手机号（不改变任何状态，区别于 C 端「查看即联系」）.

        - recruit/booking：解密返回原生手机号（EncryptedString 列读取自动解密）；
        - valuation/sheet：无原生手机号列，返回 creator 用户手机号
          （与 ``LeadService.get_my_acquired_phone`` 同数据源）。

        Args:
            module: 获客模块
            lead_id: 线索ID（各模块原生ID字符串）

        Returns:
            {phone: 完整手机号}

        Raises:
            ResourceNotFoundError: 线索不存在 / creator 缺失或无手机号

        """
        if module == GrowthModule.RECRUIT:
            return {"phone": RecruitLeadService(self.db).get_phone(lead_id)}
        if module == GrowthModule.BOOKING:
            try:
                booking_id = int(lead_id)
            except ValueError as exc:
                msg = "线索不存在"
                raise ResourceNotFoundError(msg) from exc
            booking = self.db.query(ProjectBooking).filter(ProjectBooking.id == booking_id).first()
            if booking is None:
                msg = "线索不存在"
                raise ResourceNotFoundError(msg)
            return {"phone": booking.phone}

        # valuation/sheet 共用 leads 表，按 source_property_id 判别模块
        query = self.db.query(Lead).filter(Lead.id == lead_id, Lead.is_deleted.is_(False))
        query = (
            query.filter(Lead.source_property_id.isnot(None))
            if module == GrowthModule.SHEET
            else query.filter(Lead.source_property_id.is_(None))
        )
        lead = query.first()
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        phone = lead.creator.phone if lead.creator is not None else None
        if not phone:
            msg = "线索无可用手机号"
            raise ResourceNotFoundError(msg)
        return {"phone": phone}
