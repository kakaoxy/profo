"""线索核心服务.

负责线索的创建、更新、删除，组合查询和关联服务.
"""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from redis.exceptions import RedisError
from sqlalchemy.orm import Session, joinedload

from constants.role_codes import INTERNAL_ROLE_CODES
from models import User
from models.common import LeadStatus
from models.lead import Lead, LeadEvalHistory, LeadFollowUp
from schemas.lead import LeadAssessmentAuthorizeRequest, LeadCreate, LeadUpdate
from services.system.exceptions import ConflictError, PermissionDeniedError, ResourceNotFoundError
from settings import settings
from utils.redis_client import get_redis_client
from utils.time_windows import cst_today_start

from .internal import LeadEvalService, LeadFollowUpService, LeadPriceService, LeadQueryService, compute_unit_price

logger = logging.getLogger(__name__)

# C端公开计数缓存：营销数字允许短时延迟，60s TTL 平衡新鲜度与 DB 压力
_LEAD_COUNT_CACHE_KEY = "public:leads:count:total"
_LEAD_COUNT_CACHE_TTL = 60


class LeadService:
    """线索核心业务服务.

    负责线索的全生命周期管理，采用组件化设计，内部组合使用各子服务模块。

    Attributes:
        db: SQLAlchemy数据库会话
        query_service: 查询服务组件
        price_service: 价格服务组件

    """

    def __init__(self, db: Session) -> None:
        """初始化线索业务服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db
        self.query_service = LeadQueryService(db)
        self.price_service = LeadPriceService(db)
        self.followup_service = LeadFollowUpService(db)
        self.eval_service = LeadEvalService(db)

    def create_lead(
        self,
        lead_data: LeadCreate,
        creator_id: str,
        *,
        creator: User | None = None,
        referrer: str | None = None,
    ) -> Lead:
        """创建线索.

        Args:
            lead_data: 线索创建数据
            creator_id: 创建人ID
            creator: 创建人对象（可选，用于预加载关联避免 N+1 查询）
            referrer: 分享归属员工ID（可选，C 端经分享提交时透传；
                服务端校验员工存在且 active，无效静默忽略不阻断提交）

        Returns:
            创建成功的线索对象

        """
        referrer_id = self._resolve_referrer_id(referrer)
        # 使用 exclude_unset=True：未显式提供的字段不传入构造，
        # 这样 created_at 等字段为 None 时不会覆盖 ORM 列级 default
        db_lead = Lead(
            **lead_data.model_dump(exclude_unset=True),
            id=uuid.uuid4(),
            creator_id=creator_id,
            referrer_id=referrer_id,
        )
        # 单价未显式提供时按 总价/面积 自动计算（C 端 /public/leads 不传单价）
        if db_lead.unit_price is None:
            db_lead.unit_price = compute_unit_price(db_lead.total_price, db_lead.area)
        self.db.add(db_lead)

        # 如果有总价，自动记录初始价格历史
        self.price_service.create_initial_record(
            lead_id=db_lead.id,
            price=lead_data.total_price,
            created_by_id=creator_id,
        )

        self.db.commit()
        self.db.refresh(db_lead)
        if creator is not None:
            db_lead.creator = creator
        return db_lead

    def _resolve_referrer_id(self, referrer: str | None) -> str | None:
        """解析分享归属员工ID：存在、active 且具备后台身份才生效，否则静默忽略.

        与 /public/projects/{id}/consultant 的 referrer 校验口径一致（见
        PublicProjectService.get_internal_contact_user）：仅内部员工（主角色或
        附加角色含后台角色）可作为分享归属人，普通 C 端用户 ID 不生效，
        避免归因数据被非员工 ID 污染.

        Args:
            referrer: 分享归属员工ID（原始入参，可为空）

        Returns:
            校验通过的员工ID；为空或无效（不存在/非 active/无后台身份）时返回 None

        """
        if not referrer:
            return None
        referrer_user = self.db.query(User).filter(User.id == referrer, User.status == "active").first()
        if referrer_user is None:
            return None
        # 方法内 import 避免与 services.system.auth 的潜在循环依赖
        from services.system.auth import AuthService

        if not AuthService.has_backend_identity(referrer_user):
            return None
        return referrer_user.id

    def get_lead(self, lead_id: str) -> Lead | None:
        """获取单个线索详情.

        Args:
            lead_id: 线索ID

        Returns:
            线索对象，不存在时返回None

        """
        return self.query_service.get_by_id(lead_id)

    def get_lead_or_404(self, lead_id: str) -> Lead:
        """获取线索，不存在时抛出ResourceNotFoundError.

        Args:
            lead_id: 线索ID

        Returns:
            线索对象

        Raises:
            ResourceNotFoundError: 当线索不存在时

        """
        lead = self.get_lead(lead_id)
        if not lead:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        return lead

    def get_leads(
        self,
        page: int = 1,
        page_size: int | None = None,
        search: str | None = None,
        statuses: list | None = None,
        district: str | None = None,
        creator_id: str | None = None,
        layout: str | None = None,
        floor: str | None = None,
    ) -> dict[str, Any]:
        """获取线索列表（分页）.

        Args:
            page: 页码
            page_size: 每页数量
            search: 小区名称搜索
            statuses: 状态筛选
            district: 行政区筛选
            creator_id: 创建人筛选
            layout: 户型筛选
            floor: 楼层筛选

        Returns:
            包含线索列表和分页信息的字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        return self.query_service.get_list(
            page=page,
            page_size=effective_page_size,
            search=search,
            statuses=statuses,
            district=district,
            creator_id=creator_id,
            layout=layout,
            floor=floor,
        )

    def update_lead(
        self,
        lead_id: str,
        update_data: LeadUpdate,
        updater_id: str,
        *,
        creator: User | None = None,
    ) -> Lead:
        """更新线索信息.

        Args:
            lead_id: 线索ID
            update_data: 更新数据
            updater_id: 更新人ID
            creator: 创建人对象（可选，用于预加载关联避免 N+1 查询）

        Returns:
            更新后的线索对象

        Raises:
            ResourceNotFoundError: 当线索不存在时

        """
        lead = self.get_lead_or_404(lead_id)
        update_dict = update_data.model_dump(exclude_unset=True)

        # 价格更新时记录历史
        new_price = update_dict.get("total_price")
        if new_price is not None and new_price != float(lead.total_price or 0):
            self.price_service.create_initial_record(
                lead_id=lead.id,
                price=new_price,
                created_by_id=updater_id,
            )

        old_status = lead.status
        for field, value in update_dict.items():
            setattr(lead, field, value)

        # total_price 或 area 变更时重算单价（仅当本次未显式提供 unit_price）
        if ("total_price" in update_dict or "area" in update_dict) and "unit_price" not in update_dict:
            new_unit = compute_unit_price(lead.total_price, lead.area)
            if new_unit is not None:
                lead.unit_price = new_unit

        # 评估决策流转：状态变更为 PENDING_VISIT/REJECTED/LOST_TO_COMPETITOR 时，记录审核时间与审核人
        # 仅在状态实际变化时写入，避免重复更新字段时覆盖审计记录
        if (
            update_data.status in (LeadStatus.PENDING_VISIT, LeadStatus.REJECTED, LeadStatus.LOST_TO_COMPETITOR)
            and old_status != update_data.status
        ):
            lead.audit_time = datetime.now(timezone.utc)
            lead.auditor_id = updater_id

        lead.updated_at = datetime.now(timezone.utc)
        self.db.add(lead)
        self.db.commit()
        self.db.refresh(lead)
        if creator is not None and not lead.creator:
            lead.creator = creator
        return lead

    def delete_lead(self, lead_id: str) -> None:
        """删除线索.

        Args:
            lead_id: 线索ID

        Raises:
            ResourceNotFoundError: 当线索不存在时

        """
        lead = self.get_lead_or_404(lead_id)
        lead.is_deleted = True
        lead.updated_at = datetime.now(timezone.utc)
        self.db.commit()

    def get_my_leads(self, user_id: str, page: int = 1, page_size: int | None = None) -> dict[str, Any]:
        """获取当前用户创建的线索列表（分页）.

        Args:
            user_id: 用户ID
            page: 页码
            page_size: 每页数量

        Returns:
            包含线索列表和分页信息的字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        return self.query_service.get_list(
            page=page,
            page_size=effective_page_size,
            creator_id=user_id,
        )

    def get_lead_detail(self, lead_id: str, user_id: str) -> dict[str, Any]:
        """获取线索详情（含跟进记录），并校验归属权.

        Args:
            lead_id: 线索ID
            user_id: 当前用户ID

        Returns:
            包含线索对象和跟进记录列表的字典

        Raises:
            ResourceNotFoundError: 当线索不存在时
            PermissionDeniedError: 当用户无权查看时

        """
        lead = self.query_service.get_by_id(lead_id, load_creator=False)
        if not lead:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        if lead.creator_id != user_id:
            msg = "无权查看该线索"
            raise PermissionDeniedError(msg)

        follow_ups = self.followup_service.get_follow_ups(lead_id)
        # 出评估价产生的意见摘要（LeadEvalHistory.remark）需展示在 C 端跟进记录中，
        # 由 Router 将 eval_histories 与 follow_ups 合并为统一时间线
        eval_histories = self.eval_service.get_evaluations(lead_id)

        return {
            "lead": lead,
            "follow_ups": follow_ups,
            "eval_histories": eval_histories,
        }

    def get_stats(self) -> dict[str, int]:
        """获取线索状态统计（不受分页影响）.

        Returns:
            包含各状态数量的字典

        """
        return self.query_service.get_status_stats()

    def count_total(self) -> int:
        """未删除线索总数（与 admin /leads 同口径）.

        使用 Redis 短缓存（60s TTL）降低公开接口对 DB 的压力；
        Redis 不可用时降级为直接查询，缓存仅为优化手段不应导致业务 500.
        """
        try:
            redis_client = get_redis_client()
        except RedisError:
            logger.warning("Redis 不可用，跳过线索计数缓存")
            return self.query_service.count_total()

        try:
            cached = redis_client.get(_LEAD_COUNT_CACHE_KEY)
            if cached is not None:
                return int(cached)
        except RedisError:
            logger.warning("线索计数缓存读取失败，降级直接查询", exc_info=True)

        total = self.query_service.count_total()

        try:
            redis_client.set(_LEAD_COUNT_CACHE_KEY, total, ex=_LEAD_COUNT_CACHE_TTL)
        except RedisError:
            logger.warning("线索计数缓存写入失败，跳过缓存", exc_info=True)

        return total

    def get_my_acquired(
        self,
        user_id: str,
        page: int = 1,
        page_size: int | None = None,
        status: LeadStatus | None = None,
    ) -> dict[str, Any]:
        """获取当前员工获客线索列表（分享归因 + 直接录入）.

        Args:
            user_id: 当前员工用户ID
            page: 页码
            page_size: 每页数量
            status: 状态筛选（可选）

        Returns:
            包含线索列表和分页信息的字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        return self.query_service.get_acquired_list(
            page=page,
            page_size=effective_page_size,
            user_id=user_id,
            status=status,
        )

    def get_my_acquired_stats(self, user_id: str) -> dict[str, int]:
        """获取当前员工获客线索各状态数量统计.

        Args:
            user_id: 当前员工用户ID

        Returns:
            含 total 与各状态数量的字典

        """
        return self.query_service.get_acquired_stats(user_id)

    def get_my_acquired_phone(self, user_id: str, lead_id: str) -> str | None:
        """获取当前员工获客线索的客户手机号.

        仅当线索归属为「分享归因」（referrer_id==user_id）且 creator 绑定手机号时
        返回解密后的手机号；直接录入（creator_id==user_id）或其他归属线索返回 None。
        线索不存在或不属于该员工时抛 ResourceNotFoundError。

        Args:
            user_id: 当前员工用户ID
            lead_id: 线索ID

        Returns:
            解密后的客户手机号，无权限时返回 None

        Raises:
            ResourceNotFoundError: 线索不存在或不属于该员工

        """
        lead = self.query_service.get_acquired_lead(user_id=user_id, lead_id=lead_id)
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        if lead.referrer_id == user_id and lead.creator is not None and lead.creator.phone:
            return lead.creator.phone
        return None

    def get_pending_assessment_queue(
        self,
        page: int = 1,
        page_size: int | None = None,
        search: str | None = None,
    ) -> dict[str, Any]:
        """小程序评估工作台「待评估」段：全局待评估分页队列 + 今日新增计数.

        - items_pending：全局待评估（pending_assessment）分页队列，created_at 倒序，
          search 按小区名过滤（复用 query.get_list 过滤基建与展示字段口径）；
        - pending_today：今日（Asia/Shanghai 自然日）新增待评估计数（列表统计条）。

        Args:
            page: 页码
            page_size: 每页数量
            search: 小区名称搜索（作用于待评估段）

        Returns:
            待评估段字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        pending = self.query_service.get_list(
            page=page,
            page_size=effective_page_size,
            search=search,
            statuses=[LeadStatus.PENDING_ASSESSMENT],
        )
        return {
            "items_pending": pending["items"],
            "pending_total": pending["total"],
            "page": page,
            "page_size": effective_page_size,
            "pending_today": self.query_service.count_pending_new_since(cst_today_start()),
        }

    def get_handled_leads(
        self,
        user_id: str,
        page: int = 1,
        page_size: int | None = None,
        search: str | None = None,
    ) -> dict[str, Any]:
        """小程序评估工作台「已处理」段：本人经手线索全量分页（audit_time 倒序）.

        Args:
            user_id: 当前员工用户ID（仅返回本人经手线索）
            page: 页码
            page_size: 每页数量
            search: 小区名称搜索

        Returns:
            已处理段字典（items/total/page/page_size）

        """
        return self.query_service.get_handled(user_id=user_id, page=page, page_size=page_size, search=search)

    def authorize_assessment(
        self,
        user_id: str,
        lead_id: str,
        req: LeadAssessmentAuthorizeRequest,
    ) -> Lead:
        """小程序员工侧评估授权：approve/reject/lost 单事务原子流转.

        语义对齐 admin PendingAssessmentPanel 三动作组合：
        - approve：复用 internal/evaluation.create_evaluation 录价逻辑（插评估历史 +
          刷 Lead.eval_price；不直接调用该方法因其内部 commit，此处内联保持单事务），
          并流转 pending_visit；
        - reject：不建评估记录，仅流转 rejected，audit_reason 取 remark（选填）；
        - lost：不建评估记录，仅流转 lost_to_competitor，audit_reason 取 remark（选填）；
        - 三动作统一写 auditor_id/audit_time（与 core.update_lead 状态流转自动化口径一致）。

        Args:
            user_id: 当前操作员工ID
            lead_id: 线索ID
            req: 授权请求（action/eval_price/remark）

        Returns:
            流转后的线索对象

        Raises:
            PermissionDeniedError: 操作人不具备 admin/operator 角色
            ResourceNotFoundError: 线索不存在或已软删除
            ConflictError: 线索非 pending_assessment（已被他人处理）

        """
        self._ensure_internal_operator(user_id)

        # 行级锁读取：锁持至 commit，保证「检查 pending_assessment → 流转」原子化，
        # 并发提交时后到者在锁上等待、拿到锁后状态已变，走 409 ConflictError
        lead = self.query_service.get_by_id(lead_id, load_creator=False, for_update=True)
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        if lead.status != LeadStatus.PENDING_ASSESSMENT:
            msg = "该线索已被处理"
            raise ConflictError(msg)

        now = datetime.now(timezone.utc)
        if req.action == "approve":
            rec = LeadEvalHistory(
                id=uuid.uuid4(),
                lead_id=lead.id,
                eval_price=req.eval_price,
                remark=req.remark,
                evaluator_id=user_id,
            )
            self.db.add(rec)
            lead.eval_price = req.eval_price
            lead.status = LeadStatus.PENDING_VISIT
        elif req.action == "reject":
            lead.status = LeadStatus.REJECTED
            lead.audit_reason = req.remark
        else:
            lead.status = LeadStatus.LOST_TO_COMPETITOR
            lead.audit_reason = req.remark

        lead.audit_time = now
        lead.auditor_id = user_id
        lead.updated_at = now
        self.db.add(lead)
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def create_reevaluation(
        self,
        user_id: str,
        lead_id: str,
        eval_price: Decimal,
        remark: str | None,
    ) -> tuple[LeadEvalHistory, Lead]:
        """小程序员工侧再次评估：追加评估记录并更新评估价，不改状态.

        语义对齐 admin CurrentEvalPriceSection「调整评估价」：
        仅允许 pending_visit/visited 线索，每次追加一条 LeadEvalHistory 并覆盖
        Lead.eval_price，不写 status/audit_time/auditor_id（保留首次授权轨迹）。

        Args:
            user_id: 当前操作员工ID
            lead_id: 线索ID
            eval_price: 新评估价格(万)，由 Pydantic Decimal 字段直接解析，避免 float 精度损失
            remark: 调整意见（选填）

        Returns:
            (创建的评估记录对象, 更新后的线索对象)；评估记录 eager-load evaluator，
            线索 refresh 后携带最新 eval_price，供路由层复用（如订阅消息通知）

        Raises:
            PermissionDeniedError: 操作人不具备 admin/operator 角色
            ResourceNotFoundError: 线索不存在或已软删除
            ConflictError: 线索状态非 pending_visit/visited

        """
        self._ensure_internal_operator(user_id)

        # 行级锁读取：锁持至 commit，保证「检查状态 → 录价」原子化，
        # 并发流转（如 authorize-assessment）后到者在锁上等待、拿到锁后状态已变，走 409
        lead = self.query_service.get_by_id(lead_id, load_creator=False, for_update=True)
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        if lead.status not in (LeadStatus.PENDING_VISIT, LeadStatus.VISITED):
            msg = "仅待看房/已看房状态的线索可调整评估价"
            raise ConflictError(msg)

        now = datetime.now(timezone.utc)
        rec = LeadEvalHistory(
            id=uuid.uuid4(),
            lead_id=lead.id,
            eval_price=eval_price,
            remark=remark,
            evaluator_id=user_id,
        )
        self.db.add(rec)
        lead.eval_price = eval_price
        lead.updated_at = now
        self.db.add(lead)
        self.db.commit()
        # 重新查询以 eager-load evaluator，避免 LeadEvalHistoryResponse.evaluator_name 触发 lazy load
        rec = (
            self.db.query(LeadEvalHistory)
            .options(joinedload(LeadEvalHistory.evaluator))
            .filter(LeadEvalHistory.id == rec.id)
            .one()
        )
        # commit 后 lead 已过期，refresh 以携带最新状态返回（对齐 authorize_assessment 模式），
        # 供路由层直接复用，免去再次 get_by_id 查询
        self.db.refresh(lead)
        return rec, lead

    def get_lead_evaluations(self, lead_id: str) -> list[LeadEvalHistory]:
        """获取线索评估历史（小程序员工侧，按评估时间倒序）.

        Args:
            lead_id: 线索ID

        Returns:
            评估历史记录列表（eager-load evaluator）

        Raises:
            ResourceNotFoundError: 线索不存在或已软删除

        """
        return self.eval_service.get_evaluations(lead_id)

    def get_lead_followups(self, lead_id: str) -> list[LeadFollowUp]:
        """获取线索跟进记录（小程序员工侧详情页，按跟进时间倒序）.

        Args:
            lead_id: 线索ID

        Returns:
            跟进记录列表

        Raises:
            ResourceNotFoundError: 线索不存在或已软删除

        """
        lead = self.query_service.get_by_id(lead_id, load_creator=False)
        if lead is None:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)
        return self.followup_service.get_follow_ups(lead_id)

    def _ensure_internal_operator(self, user_id: str) -> None:
        """校验用户具备 admin/operator 角色（评估权限卡口）.

        与 dependencies.auth.CurrentInternalUserDep 的 INTERNAL_ROLE_CODES 口径完全一致，
        Service 层二次复核，避免绕过路由依赖直接调用 Service 时越权。

        Args:
            user_id: 操作人用户ID

        Raises:
            PermissionDeniedError: 用户不存在或角色不满足

        """
        user = self.db.query(User).filter(User.id == user_id).first()
        if user is None:
            msg = "权限不足"
            raise PermissionDeniedError(msg)
        role_codes: set[str] = set()
        if user.role and user.role.code:
            role_codes.add(user.role.code)
        for r in user.roles or []:
            if r.code:
                role_codes.add(r.code)
        if not role_codes & INTERNAL_ROLE_CODES:
            msg = "仅管理员/运营人员可执行评估授权"
            raise PermissionDeniedError(msg)
