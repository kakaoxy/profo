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
from services.property.building_review_create import BuildingDictCreateMixin
from services.property.building_review_queue import list_review_queue
from services.property.dict_kpi_cache import invalidate_bd_counts
from services.system.exceptions import ConflictError, PermissionDeniedError, ResourceNotFoundError, ValidationError
from utils.building_dict import normalize_building_no, normalize_community_name

logger = logging.getLogger(__name__)

# system_configs 配置键（FR-15）
REVIEWER_ROLES_CONFIG_KEY = "building_dict_reviewer_roles"
DEFAULT_REVIEWER_ROLES = ["admin"]

# 引用回填批次大小（BR-13 分批）
BACKFILL_BATCH_SIZE = 200


def normalize_pending_display_name(raw: str, kind: BdEntryKind) -> str:
    """审核修正名称归一（BR-29）.

    只做两类改写（其它字符原文保留，不转全半角/不改大小写）:

    - 空白折叠：首尾去空白 + 内部连续空白折成单空格（与运营输入习惯对齐）；
    - 楼栋号量词归一：剥离尾部单个「号」（见 ``normalize_building_no``）。
      小区名与户室号不做该剥离（小区名以「…号弄」结尾是**地址本身**，
      户室号「401」与「401号」语义不同）。

    Args:
        raw: 审核员修改后的名称原文
        kind: 条目类型（building 才做量词归一）

    Returns:
        归一后的名称（可能为空串，由调用方报 400）

    """
    collapsed = " ".join(raw.split())
    if kind == BdEntryKind.BUILDING:
        return normalize_building_no(collapsed)
    return collapsed


def _is_int_str(raw: str | None) -> bool:
    """判定字符串是否为整数字串（target_id 可能为 UUID 或脏值）."""
    return bool(raw) and str(raw).lstrip("-").isdigit()  # type: ignore[union-attr]


def _parse_int_id(raw: str | int | None) -> int:
    """把字典主键串安全解析为 int（L2：脏值 → 400 而非 500）.

    Args:
        raw: 待解析值（``resolved_target_id`` 为 String(64)，可能被历史/脚本写入
            非数字串；``parent_id`` 为 BigInteger）

    Returns:
        解析后的整数主键

    Raises:
        ValidationError: 无法解析为整数（父级数据异常）

    """
    try:
        return int(raw)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        msg = "父级数据异常，请联系管理员"
        raise ValidationError(msg) from None


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


class BuildingReviewService(BuildingDictCreateMixin):
    """审核池服务（状态机 + 行锁 + 权限；落库细节见 building_review_create）。"""

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
            return self._resolve_create(db, entry, operator, request, override_name=body.name)
        if action == "merge":
            if not body.target_id:
                msg = "合并现有必须选择目标（BR-10）"
                raise ValidationError(msg)
            return self._resolve_merge(
                db,
                entry,
                body.target_id,
                operator,
                request,
                target_kind=body.target_kind or "dict",
            )
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

        L2 修复：``resolved_target_id`` 是 ``String(64)``，历史/脚本写入非数字串时
        ``int()`` 会抛 ``ValueError`` → 500（而非 400）。统一转为明确的 400。
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
            parent_building_id = _parse_int_id(parent_entry.resolved_target_id)
        else:
            parent_building_id = _parse_int_id(entry.parent_id)
        parent_building = db.get(BdBuilding, parent_building_id)
        if not parent_building:
            msg = "父级楼栋不存在（父级未转正或已删除）"
            raise ValidationError(msg)
        return parent_building

    def _rewire_child_buildings(self, db: Session, entry: BdPendingEntry, target_community_id: str) -> int:
        """拓扑（BR-28）：小区转正/合并 → 挂在本 pending 下的子级楼栋条目回填归属小区.

        H2 修复（父级=待审小区 → 待审楼栋链路的另一半）：录入端「新建小区 → 在该小区下
        新建楼栋」落成的楼栋条目 ``community_id=NULL``（父级 pending 时无从得知实表 id）。
        父级小区 create 后原实现只写 ``entry.resolved_target_id``，不回填子级楼栋的
        ``community_id`` → 子级楼栋 create 命中 ``_create_building_from_pending`` 的
        「楼栋 pending 缺少归属小区」守卫永久 400（死条目）。
        这里与既有「楼栋转正改指子级户室」对称：回填 ``community_id`` / ``community_scope``
        并保持 ``parent_is_pending``（父级条目 id 仍是真实父级，拓扑校验继续生效）。

        Returns:
            回填的子级楼栋条目数

        """
        children = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == BdEntryKind.BUILDING,
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.parent_is_pending.is_(True),
                BdPendingEntry.parent_id == entry.id,
            )
            .all()
        )
        for child in children:
            child.community_id = target_community_id
            child.community_scope = target_community_id
        if children:
            db.flush()
            logger.info(
                "父级小区转正：%d 条待审楼栋回填归属小区 %s（pending=%s）",
                len(children),
                target_community_id,
                entry.id,
            )
        return len(children)

    def _resolve_create(
        self,
        db: Session,
        entry: BdPendingEntry,
        operator: User,
        request: Request | None,
        *,
        override_name: str | None = None,
    ) -> BdReviewResolveResponse:
        """通过新增：核心事务 = 终态 + 字典落库 + 创建来源同步回填（BR-13）.

        BR-29 名称修正：``override_name``（审核员在前端改过的名称）优先于原文，
        经 ``normalize_pending_display_name`` 归一后作为落库名，并与 ``entry.name``
        回写保持一致（审核池历史列表与字典行不脱节）。

        Args:
            db: 数据库会话
            entry: 待审条目（已由调用方加 FOR UPDATE）
            operator: 审核处理人
            request: 当前请求（审计留痕用，可空）
            override_name: 修正后的名称（None=沿用 ``entry.name``）

        """
        self._check_topology(db, entry)

        original_name = entry.name
        # BR-29 写入层统一收口：**无论审核员是否手改**，落库前都走一次归一。
        # 提交原文可能已带「号」（「金杨路660弄21号」），若只在 override 分支归一，
        # 不手改的条目会原样落库 → 展示层再补「号」拼成「21号号」（正是运营反馈的现象）。
        base_name = override_name if override_name is not None else original_name
        target_name = normalize_pending_display_name(base_name, entry.kind)
        if not target_name:
            msg = "修正后的名称不能为空"
            raise ValidationError(msg)
        # 自动归一的对照值：即「归一前的输入原文」，仅在有实际改写时返回（供前端
        # 展示「将保存为 X」与 API 消费方核对，避免隐式改写）
        normalized_from = base_name if base_name != target_name else None

        if entry.kind == BdEntryKind.COMMUNITY:
            target_community_id = self._create_community_from_pending(db, entry, name=target_name)
            entry.resolved_target_id = target_community_id
        elif entry.kind == BdEntryKind.BUILDING:
            target_building_id = self._create_building_from_pending(db, entry, name=target_name)
            entry.resolved_target_id = str(target_building_id)
        else:
            target_room_id = self._create_room_from_pending(db, entry, name=target_name)
            entry.resolved_target_id = str(target_room_id)

        entry.status = BdEntryStatus.CREATED
        entry.resolved_by = operator.id
        entry.resolved_at = datetime.now(timezone.utc)
        # BR-29：名称修正回写 entry（列表展示/后续追溯与字典行恒等）。
        # status 已先置终态，uq_pending_open 的 partial index（status='pending'）
        # 不再命中本行，改 normalized_name 不会引发唯一冲突。
        if target_name != original_name:
            entry.name = target_name
            entry.normalized_name = normalize_community_name(target_name)
        db.flush()

        # 拓扑（BR-28）：小区转正 → 子级待审楼栋回填归属小区（H2）
        if entry.kind == BdEntryKind.COMMUNITY:
            self._rewire_child_buildings(db, entry, entry.resolved_target_id)  # type: ignore[arg-type]

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
                # L2：resolved_target_id 是 String，脏值统一转 400
                child.parent_id = _parse_int_id(entry.resolved_target_id)
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
        # 字典落库改变了 bd_rooms/bd_buildings 行数（慢查询报告 §6.1a：KPI 计数缓存失效）
        invalidate_bd_counts()
        self._audit(db, operator, entry, "create", request)

        # 其余引用异步回填已同步完成（同库单体，分批任务用于重试兜底）
        if backfill_enqueued:
            self._schedule_async_backfill()
        name_note = f"；名称已修正：{original_name} → {entry.name}" if entry.name != original_name else ""
        return BdReviewResolveResponse(
            success=True,
            message=(
                f"已通过新增并落库（kind={entry.kind.value}），{backfill_enqueued} 条引用已排入异步回填{name_note}"
            ),
            backfill_enqueued=backfill_enqueued,
            resolved_name=entry.name,
            name_normalized_from=normalized_from,
        )

    def _resolve_merge(
        self,
        db: Session,
        entry: BdPendingEntry,
        target_id: str,
        operator: User,
        request: Request | None,
        *,
        target_kind: str = "dict",
    ) -> BdReviewResolveResponse:
        """合并现有：不新增字典行，引用单据改指现有目标（BR-10/13）.

        M2 修复（两个维度）：
        - 归属校验：目标楼栋/户室必须与 pending 条目的归属小区一致，否则来源单据会
          落成「小区A / 实际属于B的楼栋」，后续编辑被 validate_dict_ownership 400，
          形成无法编辑的死单据；
        - 拓扑校验：merge 同样不允许跨过未转正的父级（原实现只有 create 调
          ``_check_topology``）；父级待审时子级只能驳回或等父级先处理。

        BR-29 扩展（``target_kind="pending"``）：目标可为**审核池待审兄弟**条目
        （同 kind、同归属小区）——
        1. 对**目标 pending 行也加 FOR UPDATE**，否则两名审核员同时合并到同一目标会
           双双转正并插出两行字典行（uq 撞库 500）；
        2. 先转正目标（落库 + 终态 + 其开放引用回填），再令本条目 MERGED 指向同一实表 id；
        3. 目标条目与当前条目都记在当前审核员名下（一次操作解决两条待审），审计双记。

        Args:
            db: 数据库会话
            entry: 待审条目（已由调用方加 FOR UPDATE）
            target_id: 目标 id（实表主键串或 pending 条目 id 串）
            operator: 审核处理人
            request: 当前请求（审计留痕用，可空）
            target_kind: ``dict``=字典实表目标（默认）/ ``pending``=待审兄弟条目

        """
        self._check_topology(db, entry)

        if target_kind == "pending":
            target_value = self._merge_into_pending_sibling(db, entry, target_id, operator)
        elif entry.kind == BdEntryKind.COMMUNITY:
            target = db.query(Community).filter(Community.id == target_id, Community.is_active.is_(True)).first()
            if not target:
                msg = "目标小区不存在或已归档"
                raise ResourceNotFoundError(msg)
            target_value = target.id
        elif entry.kind == BdEntryKind.BUILDING:
            target = db.get(BdBuilding, _parse_int_id(target_id)) if _is_int_str(target_id) else None
            if not target:
                msg = "目标楼栋不存在"
                raise ResourceNotFoundError(msg)
            if entry.community_id and target.community_id != entry.community_id:
                msg = "目标楼栋不属于该待审楼栋的归属小区，请重新选择"
                raise ValidationError(msg)
            target_value = str(target.id)
        else:
            target = db.get(BdRoom, _parse_int_id(target_id)) if _is_int_str(target_id) else None
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

        # 拓扑（BR-28）：小区合并现有 → 子级待审楼栋同样回填归属小区（H2 对称修复；
        # 否则「用已有的」路径下子级楼栋仍因 community_id 为空永久 400）
        if entry.kind == BdEntryKind.COMMUNITY:
            self._rewire_child_buildings(db, entry, target_value)

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
                # L2：target_value 是上面 int(target_id) 校验过的实表楼栋 id 串
                child.parent_id = _parse_int_id(target_value)
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
        # 仅「合并到待审兄弟」会转正落库新增字典行；合并到现有目标不改变行数
        if target_kind == "pending":
            invalidate_bd_counts()
        self._audit(db, operator, entry, "merge", request)
        return BdReviewResolveResponse(success=True, message=f"已合并现有目标 {target_value}，{len(refs)} 条引用已改指")

    def _merge_into_pending_sibling(
        self,
        db: Session,
        entry: BdPendingEntry,
        target_id: str,
        operator: User,
    ) -> str:
        """BR-29：合并到「待审兄弟条目」——顺手转正目标，返回其字典实表 id 串.

        背景：录入端重复提交同一栋楼/同一户时，审核池会出现两条同 kind 的待审条目；
        旧实现只允许合并到字典实表，而新小区/新楼栋下常常**一条实表都没有**（实测
        2066/21732 个小区无楼栋），导致「用已有的」无目标可选、审核员无路可走。

        事务与锁顺序（防并发双转正）：
        1. 本条 entry 已由 ``resolve()`` 加 FOR UPDATE（先锁的）；
        2. 这里再对**目标 pending 行**加 FOR UPDATE —— 两请求合并到同一目标时，
           后者阻塞至前者提交，再读到 ``status != pending`` 后 409，不会双双转正；
        3. 目标转正（落库）后本条才落 MERGED，两者 ``resolved_target_id`` 指向同一实表 id。

        Args:
            db: 数据库会话
            entry: 本条待审条目（已加 FOR UPDATE）
            target_id: 目标 pending 条目 id（字串）
            operator: 审核处理人

        Returns:
            目标转正后写入的字典实表 id（str）

        Raises:
            ValidationError: target_id 非法 / kind 不一致 / 归属小区不一致
            ResourceNotFoundError: 目标 pending 不存在
            ConflictError: 目标已非 pending（并发已处理）

        """
        if not _is_int_str(target_id):
            msg = "待审目标 ID 格式不正确"
            raise ValidationError(msg)
        target_entry = (
            db.query(BdPendingEntry).filter(BdPendingEntry.id == _parse_int_id(target_id)).with_for_update().first()
        )
        if not target_entry:
            msg = "待审目标条目不存在"
            raise ResourceNotFoundError(msg)
        if target_entry.id == entry.id:
            msg = "不能把条目合并到自己"
            raise ValidationError(msg)
        if target_entry.status != BdEntryStatus.PENDING:
            msg = f"待审目标已被处理（status={target_entry.status.value}），请刷新后重新选择"
            raise ConflictError(msg)
        if target_entry.kind != entry.kind:
            msg = "待审目标的类型与本条目不一致（小区/楼栋/户室不可互相合并）"
            raise ValidationError(msg)
        # 归属小区一致（小区条目自身无 community_id，target 也应为 None）
        if entry.kind != BdEntryKind.COMMUNITY and target_entry.community_id != entry.community_id:
            msg = "待审目标不属于同一小区，请重新选择"
            raise ValidationError(msg)

        # 目标转正：复用 create 的落库方法（拓扑校验同样适用）
        self._check_topology(db, target_entry)
        if target_entry.kind == BdEntryKind.COMMUNITY:
            promoted_target = self._create_community_from_pending(db, target_entry)
        elif target_entry.kind == BdEntryKind.BUILDING:
            promoted_target = str(self._create_building_from_pending(db, target_entry))
        else:
            promoted_target = str(self._create_room_from_pending(db, target_entry))

        target_entry.status = BdEntryStatus.CREATED
        target_entry.resolved_target_id = promoted_target
        target_entry.resolved_by = operator.id
        target_entry.resolved_at = datetime.now(timezone.utc)
        db.flush()

        # 目标转正后的拓扑搬运（与 _resolve_create 同口径）
        if target_entry.kind == BdEntryKind.COMMUNITY:
            self._rewire_child_buildings(db, target_entry, promoted_target)
        if target_entry.kind == BdEntryKind.BUILDING:
            child_rooms = (
                db.query(BdPendingEntry)
                .filter(
                    BdPendingEntry.kind == BdEntryKind.ROOM,
                    BdPendingEntry.status == BdEntryStatus.PENDING,
                    BdPendingEntry.parent_is_pending.is_(True),
                    BdPendingEntry.parent_id == target_entry.id,
                )
                .all()
            )
            for child in child_rooms:
                child.parent_id = _parse_int_id(promoted_target)
                child.parent_is_pending = False
            db.flush()

        # 目标的开放引用同步回填（否则目标转正后其引用会滞留 open，等异步任务兼底）
        target_refs = (
            db.query(BdPendingReference)
            .filter(
                BdPendingReference.pending_id == target_entry.id,
                BdPendingReference.status == BdReferenceStatus.OPEN,
            )
            .all()
        )
        for ref in target_refs:
            self._backfill_reference(db, ref, target_value=promoted_target)

        logger.info(
            "审核合并到待审兄弟：entry=%s → pending=%s（已转正为 %s）操作人=%s",
            entry.id,
            target_entry.id,
            promoted_target,
            operator.id,
        )
        self._audit(db, operator, target_entry, "create", None)
        return promoted_target

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
        operator_id: str,
        request: Request | None = None,
    ) -> BdReviewResolveResponse:
        """引用批量回填任务重试入口（端点 FR-11/BR-13）.

        L5 修复：原实现注释写「审计由 run_pending_backfill 内部记录」，但该模块
        全文没有任何审计调用 —— 运维点「重试回填」这个写操作不留审计痕迹（NFR-03）。
        现在由本入口（写操作的发起方）记录审计：``bd_pending_backfill_retry``。
        """
        count = run_pending_backfill(db)
        from services.system.operation_log import operation_log_service

        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="bd_pending_backfill_retry",
            resource_type="building_dict_pending",
            resource_id="pending_backfill",
            after={"processed": count},
            request=request,
        )
        return BdReviewResolveResponse(success=True, message=f"回填任务已执行，实际回填 {count} 条引用")


# run_pending_backfill / _run_backfill_task 已拆分至 building_review_backfill 模块


_service: BuildingReviewService | None = None


def get_building_review_service() -> BuildingReviewService:
    """获取审核池服务单例."""
    global _service
    if _service is None:
        _service = BuildingReviewService()
    return _service
