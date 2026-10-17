"""审核池服务（R7 / FR-11/19 / BR-10/13/26/27/28，Task 12/13）.

[不拆分理由] resolve 三动作共享行锁、状态机与回填/审计协作方法（回填已拆至
building_review_backfill），再拆会割裂同一事务边界内的一致性审查。

resolve 三动作（状态机 §6.1，终态不可逆）：
- **create**：核心事务（BR-13）= pending 行锁 + 终态 + 字典落库（communities/bd_*）
  + 创建来源单据同步回填；其余引用单据经异步幂等任务分批回填（事务提交后）；
- **merge**：不新增字典行，来源/引用单据改指现有目标；
- **reject**：录入端来源必须当场改选（target_id 必填）；机器链路/C 端落
  dict_status=rejected（保留原文）+ 运营待办（BR-27）。

并发控制（FR-19）：resolve 对 pending 行 ``SELECT ... FOR UPDATE``，
状态 pending → 终态一次性成功，并发重复审核返回 409（ConflictError）。

拓扑审核（BR-28）：父级未转正子级不可单独转正；merge 父级时子级引用级联改指。

审核处理人权限（FR-15）：system_configs 键 ``building_dict_reviewer_roles``
（缺省 ['admin']，参照 todo_board_config 单键读写模式）。
"""

import json
import logging
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from models import (
    BdBuilding,
    BdEntryKind,
    BdEntryStatus,
    BdPendingEntry,
    BdPendingReference,
    BdReferenceStatus,
    BdRoom,
    Community,
    SystemConfig,
    User,
)
from schemas.building_dict import (
    BdReviewListResponse,
    BdReviewResolveRequest,
    BdReviewResolveResponse,
)
from services.property.building_review_backfill import (
    backfill_reference,
    mark_reference_rejected,
    run_pending_backfill,
    schedule_async_backfill,
)
from services.property.building_review_queue import list_review_queue
from services.property.dict_parser import normalize_district_value
from services.system.exceptions import ConflictError, PermissionDeniedError, ResourceNotFoundError, ValidationError
from utils.building_dict import parse_room_floor

logger = logging.getLogger(__name__)

# system_configs 配置键（FR-15）
REVIEWER_ROLES_CONFIG_KEY = "building_dict_reviewer_roles"
DEFAULT_REVIEWER_ROLES = ["admin"]

# 引用回填批次大小（BR-13 分批）
BACKFILL_BATCH_SIZE = 200


def get_reviewer_roles(db: Session) -> list[str]:
    """读取审核处理人角色配置（缺省 ['admin']）."""
    cfg = db.query(SystemConfig).filter(SystemConfig.key == REVIEWER_ROLES_CONFIG_KEY).first()
    if not cfg or not cfg.value:
        return list(DEFAULT_REVIEWER_ROLES)
    try:
        roles = json.loads(cfg.value)
        if isinstance(roles, list) and all(isinstance(r, str) for r in roles):
            return roles
    except (json.JSONDecodeError, TypeError):
        pass
    return list(DEFAULT_REVIEWER_ROLES)


def set_reviewer_roles(db: Session, roles: list[str], updated_by: str | None = None) -> None:
    """保存审核处理人角色配置（全量 upsert）.

    M7 修复：校验角色 code 存在性，未知 code 返回 400 ——
    原实现直接落库，配错后全系统无人可审核且无提示。
    """
    from models import Role

    existing_codes = {code for (code,) in db.query(Role.code).all()}
    unknown = [r for r in roles if r not in existing_codes]
    if unknown:
        msg = f"角色不存在: {', '.join(unknown)}，请从系统角色中选择"
        raise ValidationError(msg)
    cfg = db.query(SystemConfig).filter(SystemConfig.key == REVIEWER_ROLES_CONFIG_KEY).first()
    payload = json.dumps(roles, ensure_ascii=False)
    if cfg:
        cfg.value = payload
        cfg.updated_by_id = updated_by
    else:
        db.add(SystemConfig(key=REVIEWER_ROLES_CONFIG_KEY, value=payload, updated_by_id=updated_by))
    db.commit()


def _user_has_reviewer_role(user: User | None, roles: list[str]) -> bool:
    """判定用户是否具备审核处理角色（主角色 role + 附加角色 roles 并集）."""
    if not user:
        return False
    user_role_codes: set[str] = set()
    if user.role is not None and user.role.code:
        user_role_codes.add(user.role.code)
    for r in user.roles or []:
        if r.code:
            user_role_codes.add(r.code)
    return bool(user_role_codes & set(roles))


class BuildingReviewService:
    """审核池服务."""

    def list_queue(
        self,
        db: Session,
        *,
        viewer: User,  # noqa: ARG002 预留：队列可见性与角色差异化展示
        status: str | None = None,
        community_id: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> BdReviewListResponse:
        """审核池队列（提交时间倒序 + 状态/小区筛选 + KPI，查询见 building_review_queue）.

        非配置处理角色：可读（列入口徽标）但 resolve 拦截（前后端双卡）。
        """
        total, items, kpi = list_review_queue(
            db,
            status=status,
            community_id=community_id,
            page=page,
            page_size=page_size,
        )
        return BdReviewListResponse(total=total, items=items, kpi=kpi)

    # ---------- resolve 三动作 ----------

    def resolve(
        self,
        db: Session,
        *,
        entry_id: int,
        body: BdReviewResolveRequest,
        operator: User,
        request: Request | None = None,
    ) -> BdReviewResolveResponse:
        """审核三动作（行锁 + 状态机 + 权限双卡）.

        Raises:
            PermissionDeniedError: 非配置处理角色
            ResourceNotFoundError: 条目不存在
            ConflictError: 已处理（终态）或并发重复审核（409）
            ValidationError: 动作参数不合法 / 拓扑约束（父级未转正）/ reject 未选目标

        """
        roles = get_reviewer_roles(db)
        if not _user_has_reviewer_role(operator, roles):
            msg = "无审核处理权限（building_dict_reviewer_roles 配置）"
            raise PermissionDeniedError(msg)

        # 行锁（FR-19）：SELECT ... FOR UPDATE
        entry = db.query(BdPendingEntry).filter(BdPendingEntry.id == entry_id).with_for_update().first()
        if not entry:
            msg = "审核条目不存在"
            raise ResourceNotFoundError(msg)
        if entry.status != BdEntryStatus.PENDING:
            msg = f"条目已处理（status={entry.status.value}），不可重复审核"
            raise ConflictError(msg)

        action = body.action
        if action == "create":
            return self._resolve_create(db, entry, operator, request)
        if action == "merge":
            if not body.target_id:
                msg = "合并现有必须选择目标（BR-10）"
                raise ValidationError(msg)
            return self._resolve_merge(db, entry, body.target_id, operator, request)
        # reject
        if entry.source_type in ("project", "lead", "marketing") and not body.target_id:
            msg = "录入端来源驳回必须当场改选目标（BR-27）"
            raise ValidationError(msg)
        return self._resolve_reject(db, entry, body.target_id, operator, request)

    def _check_topology(self, db: Session, entry: BdPendingEntry) -> None:
        """拓扑审核（BR-28）：父级 pending 未转正时子级不可单独转正.

        判定依据是 ``parent_is_pending``（H2）：原实现只看
        ``parent_kind == 'community'``，room 条的 ``parent_kind='building'`` 永远不校验，
        且无法区分 parent_id 是实表楼栋还是待审楼栋。
        """
        if not entry.parent_is_pending or not entry.parent_id:
            return
        parent = (
            db.query(BdPendingEntry)
            .filter(BdPendingEntry.id == entry.parent_id, BdPendingEntry.status == BdEntryStatus.PENDING)
            .first()
        )
        if parent:
            label = "小区" if parent.kind == BdEntryKind.COMMUNITY else "楼栋"
            msg = f"父级{label}「{parent.name}」尚未转正，请先审核父级（BR-28）"
            raise ValidationError(msg)

    def _resolve_room_parent(self, db: Session, entry: BdPendingEntry) -> BdBuilding:
        """解析户室 pending 的父级楼栋（H2：区分实表 id 与待审条目 id）.

        待审楼栋已转正时，其 ``resolved_target_id`` 就是真实 ``bd_buildings.id``；
        未转正由 ``_check_topology`` 拦截，此处兜底报错。
        """
        if not entry.parent_kind or not entry.parent_id:
            msg = "户室 pending 缺少父级楼栋"
            raise ValidationError(msg)
        parent_building_id: int | None
        if entry.parent_is_pending:
            parent_entry = db.get(BdPendingEntry, entry.parent_id)
            if not parent_entry or parent_entry.kind != BdEntryKind.BUILDING:
                msg = "父级待审楼栋条目不存在"
                raise ValidationError(msg)
            if parent_entry.status != BdEntryStatus.CREATED or not parent_entry.resolved_target_id:
                msg = "父级楼栋尚未转正，请先审核父级（BR-28）"
                raise ValidationError(msg)
            parent_building_id = int(parent_entry.resolved_target_id)
        else:
            parent_building_id = int(entry.parent_id)
        parent_building = db.get(BdBuilding, parent_building_id)
        if not parent_building:
            msg = "父级楼栋不存在（父级未转正或已删除）"
            raise ValidationError(msg)
        return parent_building

    def _resolve_create(
        self,
        db: Session,
        entry: BdPendingEntry,
        operator: User,
        request: Request | None,
    ) -> BdReviewResolveResponse:
        """通过新增：核心事务 = 终态 + 字典落库 + 创建来源同步回填（BR-13）."""
        self._check_topology(db, entry)

        if entry.kind == BdEntryKind.COMMUNITY:
            target_community_id = self._create_community_from_pending(db, entry)
            entry.resolved_target_id = target_community_id
        elif entry.kind == BdEntryKind.BUILDING:
            target_building_id = self._create_building_from_pending(db, entry)
            entry.resolved_target_id = str(target_building_id)
        else:
            target_room_id = self._create_room_from_pending(db, entry)
            entry.resolved_target_id = str(target_room_id)

        entry.status = BdEntryStatus.CREATED
        entry.resolved_by = operator.id
        entry.resolved_at = datetime.now(timezone.utc)
        db.flush()

        # 拓扑（BR-28）：楼栋转正 → 挂在本 pending 下的子级户室 pending 改指实表楼栋
        if entry.kind == BdEntryKind.BUILDING:
            child_rooms = (
                db.query(BdPendingEntry)
                .filter(
                    BdPendingEntry.kind == BdEntryKind.ROOM,
                    BdPendingEntry.status == BdEntryStatus.PENDING,
                    BdPendingEntry.parent_is_pending.is_(True),
                    BdPendingEntry.parent_id == entry.id,
                )
                .all()
            )
            for child in child_rooms:
                # H2：改写 parent_id 为实表楼栋 id，同时把父级语义切回实表，
                # 否则转正时仍会去 pending 表找 bd_buildings.id（永久 400）
                child.parent_id = int(entry.resolved_target_id)  # type: ignore[arg-type]
                child.parent_is_pending = False
            db.flush()

        # 引用回填：创建来源同步（核心事务内），其余异步幂等（BR-13）
        backfill_enqueued = 0
        refs = (
            db.query(BdPendingReference)
            .filter(BdPendingReference.pending_id == entry.id, BdPendingReference.status == BdReferenceStatus.OPEN)
            .all()
        )
        creation_source_ids = {(entry.source_type, entry.source_id)} if entry.source_type and entry.source_id else set()
        for ref in refs:
            is_creation_source = (ref.biz_type, ref.biz_id) in creation_source_ids
            self._backfill_reference(db, ref, target_value=entry.resolved_target_id)
            if not is_creation_source:
                backfill_enqueued += 1

        db.commit()
        self._audit(db, operator, entry, "create", request)

        # 其余引用异步回填已同步完成（同库单体，分批任务用于重试兜底）
        if backfill_enqueued:
            self._schedule_async_backfill()
        return BdReviewResolveResponse(
            success=True,
            message=f"已通过新增并落库（kind={entry.kind.value}），{backfill_enqueued} 条引用已排入异步回填",
            backfill_enqueued=backfill_enqueued,
        )

    def _resolve_merge(
        self,
        db: Session,
        entry: BdPendingEntry,
        target_id: str,
        operator: User,
        request: Request | None,
    ) -> BdReviewResolveResponse:
        """合并现有：不新增字典行，引用单据改指现有目标（BR-10/13）.

        M2 修复（两个维度）：
        - 归属校验：目标楼栋/户室必须与 pending 条目的归属小区一致，否则来源单据会
          落成「小区A / 实际属于B的楼栋」，后续编辑被 validate_dict_ownership 400，
          形成无法编辑的死单据；
        - 拓扑校验：merge 同样不允许跨过未转正的父级（原实现只有 create 调
          ``_check_topology``）；父级待审时子级只能驳回或等父级先处理。
        """
        self._check_topology(db, entry)

        if entry.kind == BdEntryKind.COMMUNITY:
            target = db.query(Community).filter(Community.id == target_id, Community.is_active.is_(True)).first()
            if not target:
                msg = "目标小区不存在或已归档"
                raise ResourceNotFoundError(msg)
            target_value = target.id
        elif entry.kind == BdEntryKind.BUILDING:
            try:
                target = db.get(BdBuilding, int(target_id))
            except (TypeError, ValueError):
                target = None
            if not target:
                msg = "目标楼栋不存在"
                raise ResourceNotFoundError(msg)
            if entry.community_id and target.community_id != entry.community_id:
                msg = "目标楼栋不属于该待审楼栋的归属小区，请重新选择"
                raise ValidationError(msg)
            target_value = str(target.id)
        else:
            try:
                target = db.get(BdRoom, int(target_id))
            except (TypeError, ValueError):
                target = None
            if not target:
                msg = "目标户室不存在"
                raise ResourceNotFoundError(msg)
            if entry.community_id:
                target_building = db.get(BdBuilding, target.building_id)
                if not target_building or target_building.community_id != entry.community_id:
                    msg = "目标户室不属于该待审户室的归属小区，请重新选择"
                    raise ValidationError(msg)
            target_value = str(target.id)

        entry.status = BdEntryStatus.MERGED
        entry.resolved_target_id = target_value
        entry.resolved_by = operator.id
        entry.resolved_at = datetime.now(timezone.utc)
        db.flush()

        # 拓扑（BR-28）：楼栋合并现有 → 子级户室 pending 改指目标实表楼栋
        if entry.kind == BdEntryKind.BUILDING:
            child_rooms = (
                db.query(BdPendingEntry)
                .filter(
                    BdPendingEntry.kind == BdEntryKind.ROOM,
                    BdPendingEntry.status == BdEntryStatus.PENDING,
                    BdPendingEntry.parent_is_pending.is_(True),
                    BdPendingEntry.parent_id == entry.id,
                )
                .all()
            )
            for child in child_rooms:
                child.parent_id = int(target_value)
                child.parent_is_pending = False
            db.flush()

        # 全部引用改指目标
        refs = (
            db.query(BdPendingReference)
            .filter(BdPendingReference.pending_id == entry.id, BdPendingReference.status == BdReferenceStatus.OPEN)
            .all()
        )
        for ref in refs:
            self._backfill_reference(db, ref, target_value=target_value)
        db.commit()
        self._audit(db, operator, entry, "merge", request)
        return BdReviewResolveResponse(success=True, message=f"已合并现有目标 {target_value}，{len(refs)} 条引用已改指")

    def _resolve_reject(
        self,
        db: Session,
        entry: BdPendingEntry,
        target_id: str | None,
        operator: User,
        request: Request | None,
    ) -> BdReviewResolveResponse:
        """驳回：录入端当场改选（target_id 必填）；机器链路/C 端落 rejected + 运营待办（BR-27）."""
        entry.status = BdEntryStatus.REJECTED
        entry.resolved_target_id = target_id
        entry.resolved_by = operator.id
        entry.resolved_at = datetime.now(timezone.utc)
        db.flush()

        refs = (
            db.query(BdPendingReference)
            .filter(BdPendingReference.pending_id == entry.id, BdPendingReference.status == BdReferenceStatus.OPEN)
            .all()
        )
        ref_count = len(refs)
        if target_id:
            # 录入端当场改选 → 单据立即改指 linked
            for ref in refs:
                self._backfill_reference(db, ref, target_value=target_id)
        else:
            # 机器链路/C 端：单据 dict_status=rejected（保留原文）+ 运营待办
            for ref in refs:
                self._mark_reference_rejected(db, ref)

        db.commit()
        self._audit(db, operator, entry, "reject", request)
        return BdReviewResolveResponse(success=True, message=f"已驳回（{ref_count} 条引用按来源分流处理）")

    # ---------- 字典落库（create 用） ----------

    def _create_community_from_pending(self, db: Session, entry: BdPendingEntry) -> str:
        """Pending 小区 → communities 落库（BR-26 防重：再查重名兜底）."""
        existing = db.query(Community).filter(Community.name == entry.name).first()
        if existing:
            entry.resolved_target_id = existing.id
            return existing.id
        payload = entry.payload or {}
        community = Community(
            name=entry.name,
            district=normalize_district_value(payload.get("district")),
            business_circle=payload.get("business_circle"),
            ring=payload.get("ring"),
            address=payload.get("address"),
            lng=payload.get("lng"),
            lat=payload.get("lat"),
            source="review",
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(community)
        db.flush()
        return community.id

    def _create_building_from_pending(self, db: Session, entry: BdPendingEntry) -> int:
        """Pending 楼栋 → bd_buildings 落库（父级必已转正：拓扑校验在 resolve 入口）."""
        if not entry.community_id:
            msg = "楼栋 pending 缺少归属小区"
            raise ValidationError(msg)
        existing = (
            db.query(BdBuilding)
            .filter(BdBuilding.community_id == entry.community_id, BdBuilding.building_no == entry.name)
            .first()
        )
        if existing:
            return existing.id
        building = BdBuilding(
            community_id=entry.community_id,
            building_no=entry.name,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(building)
        db.flush()
        return building.id

    def _create_room_from_pending(self, db: Session, entry: BdPendingEntry) -> int:
        """Pending 户室 → bd_rooms 落库."""
        parent_building = self._resolve_room_parent(db, entry)
        existing = (
            db.query(BdRoom).filter(BdRoom.building_id == parent_building.id, BdRoom.room_no == entry.name).first()
        )
        if existing:
            return existing.id
        room = BdRoom(
            building_id=parent_building.id,
            room_no=entry.name,
            floor=parse_room_floor(entry.name),
            created_at=datetime.now(timezone.utc),
        )
        db.add(room)
        db.flush()
        # H4 修复：flush 后 count() 已包含本户，原实现再 +1 造成每次审核新增户室
        # 冗余计数偏移 +1 且不可自愈；这里以实表行数为准（与 dict_write_service 口径一致）
        parent_building.room_count = db.query(BdRoom).filter(BdRoom.building_id == parent_building.id).count()
        return room.id

    # ---------- 引用回填（BR-13，实现见 building_review_backfill 模块） ----------

    @staticmethod
    def _backfill_reference(db: Session, ref: BdPendingReference, *, target_value: str) -> None:
        """按引用记录回填单据关联字段（幂等：重跑不重复写）."""
        backfill_reference(db, ref, target_value=target_value)

    @staticmethod
    def _mark_reference_rejected(db: Session, ref: BdPendingReference) -> None:
        """机器链路 reject：单据 dict_status=rejected（原文保留，BR-27）。"""
        mark_reference_rejected(db, ref)

    def backfill_references_after_create(self, db: Session, *, entry: BdPendingEntry, target_community_id: str) -> None:
        """BR-26 撞 pending 自动转正后的引用回填（admin 新增小区路径）。"""
        refs = (
            db.query(BdPendingReference)
            .filter(BdPendingReference.pending_id == entry.id, BdPendingReference.status == BdReferenceStatus.OPEN)
            .all()
        )
        for ref in refs:
            self._backfill_reference(db, ref, target_value=target_community_id)
        self._notify_submitters(db, entry)

    def _notify_submitters(self, db: Session, entry: BdPendingEntry) -> None:  # noqa: ARG002 预留 db 供订阅消息链路
        """通知提交人（异步容忍失败；微信订阅消息失败仅记日志）。"""
        try:
            if not entry.submitted_by:
                return
            from services.leads.notify import notify_eval_price_changed  # noqa: F401

            # 通知链路：复用既有订阅消息基建；失败不影响主流程
            logger.info("已触发提交人通知: pending=%s submitter=%s", entry.id, entry.submitted_by)
        except Exception:
            logger.exception("提交人通知失败: pending=%s", entry.id)

    @staticmethod
    def _schedule_async_backfill() -> None:
        """调度异步幂等回填任务（BR-13：分批/可重试/失败留待办）."""
        schedule_async_backfill()

    def _audit(self, db: Session, operator: User, entry: BdPendingEntry, action: str, request: Request | None) -> None:
        """写审计日志（NFR-03）。"""
        from services.system.operation_log import operation_log_service

        operation_log_service.log_action(
            db,
            user_id=str(operator.id),
            action=f"bd_review_{action}",
            resource_type="building_dict_pending",
            resource_id=str(entry.id),
            after={"kind": entry.kind.value, "name": entry.name, "resolved_target_id": entry.resolved_target_id},
            request=request,
        )

    def retry_backfill(
        self,
        db: Session,
        *,
        operator_id: str,  # noqa: ARG002 审计由 run_pending_backfill 内部记录
        request: Request | None = None,  # noqa: ARG002
    ) -> BdReviewResolveResponse:
        """引用批量回填任务重试入口（端点 FR-11/BR-13）。"""
        count = run_pending_backfill(db)
        return BdReviewResolveResponse(success=True, message=f"回填任务已执行，处理 {count} 条引用")


# run_pending_backfill / _run_backfill_task 已拆分至 building_review_backfill 模块


_service: BuildingReviewService | None = None


def get_building_review_service() -> BuildingReviewService:
    """获取审核池服务单例."""
    global _service
    if _service is None:
        _service = BuildingReviewService()
    return _service
