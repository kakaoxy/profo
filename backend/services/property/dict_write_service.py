"""楼盘字典写服务（R4：admin 补录与新增小区 / FR-06/07）.

[不拆分理由] 写操作共享 _promote_matching_pendings（BR-26 转正回填）与 _audit
两个私有协作方法，且各方法同属「admin 即时生效」事务语义；拆分会放大导入成本
且割裂 BR-26 状态机的一致性审查视线。

- 楼栋/户室区间批量补录：``29-55`` / ``7-12`` / ``01-08`` 笛卡尔展开，
  uq 冲突逐个跳过（BR-09），上限 60 栋/200 户（BR-07），返回 {added, skipped}；
- admin 新增小区：名/区/板块必填，重名拦截（BR-01），
  撞同名 open pending 自动转正（BR-26：视同 admin 确认，审计 + 通知提交人）；
- 全部写操作即时生效 + 审计日志（NFR-03）。
"""

import logging
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import (
    BdBuilding,
    BdEntryKind,
    BdEntryStatus,
    BdPendingEntry,
    BdRoom,
    Community,
    CommunityAlias,
    CommunityImage,
    L4MarketingProject,
    Lead,
    Project,
    PropertyCurrent,
)
from schemas.building_dict import (
    BdBatchCreateResult,
    BdBuildingCreateRequest,
    BdCommunityCreateRequest,
    BdCommunityDetailResponse,
    BdCommunityPatchRequest,
    BdDeleteResult,
    BdRoomCreateRequest,
)
from services.property.dict_read_service import BuildingDictReadService
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError
from utils.building_dict import normalize_community_name, parse_room_floor

logger = logging.getLogger(__name__)

# 批量展开上限（BR-07 / Q-03 拍板）
MAX_BUILDINGS_PER_BATCH = 60
MAX_ROOMS_PER_BATCH = 200


def expand_range(spec: str, *, pad_zero: bool = False) -> list[str]:
    """展开区间语法（FR-06）：`29-55` → [29..55]；`01-08` → [01..08]；单值原样.

    Args:
        spec: 单值或区间串
        pad_zero: 按左操作数宽度补零（户号 `01-08` → 01..08）

    Returns:
        展开后的字符串列表

    Raises:
        ValidationError: 区间语法非法或方向颠倒

    """
    s = spec.strip()
    if "-" not in s:
        return [s]
    left, _, right = s.partition("-")
    left, right = left.strip(), right.strip()
    if not left.isdigit() or not right.isdigit():
        return [s]  # 非数字串（如 `201乙`）整体作为单值
    lo, hi = int(left), int(right)
    if lo > hi:
        msg = f"区间方向颠倒: {spec}"
        raise ValidationError(msg)
    width = len(left) if pad_zero and left.startswith("0") else 0
    return [str(i).zfill(width) if width else str(i) for i in range(lo, hi + 1)]


class DictWriteService:
    """字典写服务（admin 即时生效 + 审计）."""

    def _promote_matching_pendings(
        self,
        db: Session,
        *,
        kind: BdEntryKind,
        community_id: str | None,
        parent_building_id: int | None,
        created_map: dict[str, int],
        operator_id: str,
    ) -> None:
        """撞同名 open pending 自动转正（BR-26：视同 admin 确认，同步回填引用）."""
        if not created_map:
            return
        from models import BdPendingReference, BdReferenceStatus
        from services.property.building_review_backfill import backfill_reference

        filters = [
            BdPendingEntry.kind == kind,
            BdPendingEntry.status == BdEntryStatus.PENDING,
        ]
        if kind == BdEntryKind.ROOM:
            # 户室 pending 必挂实表楼栋（父级仍待审的由审核链路处理）
            filters.extend(
                [
                    BdPendingEntry.parent_kind == BdEntryKind.BUILDING,
                    BdPendingEntry.parent_id == parent_building_id,
                ]
            )
        elif kind == BdEntryKind.BUILDING:
            filters.append(BdPendingEntry.community_id == community_id)

        pendings = db.query(BdPendingEntry).filter(*filters).all()
        now = datetime.now(timezone.utc)
        for entry in pendings:
            target_id = created_map.get(entry.name)
            if target_id is None:
                continue
            entry.status = BdEntryStatus.CREATED
            entry.resolved_target_id = str(target_id)
            entry.resolved_by = operator_id
            entry.resolved_at = now
            db.flush()
            # open 引用同步回填（backfill_reference 内部已置 RESOLVED）
            refs = (
                db.query(BdPendingReference)
                .filter(BdPendingReference.pending_id == entry.id, BdPendingReference.status == BdReferenceStatus.OPEN)
                .all()
            )
            for ref in refs:
                backfill_reference(db, ref, target_value=str(target_id))
        db.commit()

    def _audit(
        self,
        db: Session,
        *,
        user_id: str,
        action: str,
        resource_id: str | None,
        before: dict | None = None,
        after: dict | None = None,
        request: Request | None = None,
    ) -> None:
        """写审计日志（NFR-03）。"""
        from services.system.operation_log import operation_log_service

        operation_log_service.log_action(
            db,
            user_id=user_id,
            action=action,
            resource_type="building_dict",
            resource_id=resource_id,
            before=before,
            after=after,
            request=request,
        )

    # ---------- FR-06 楼栋补录 ----------

    def create_buildings(
        self,
        db: Session,
        body: BdBuildingCreateRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdBatchCreateResult:
        """Admin 补录楼栋（区间展开 + uq 跳过 + 上限拦截）."""
        community = db.query(Community).filter(Community.id == body.community_id).first()
        if not community:
            msg = "小区不存在"
            raise ResourceNotFoundError(msg)

        nos = expand_range(body.building_no)
        if len(nos) > MAX_BUILDINGS_PER_BATCH:
            msg = f"单次最多补录 {MAX_BUILDINGS_PER_BATCH} 栋，当前 {len(nos)} 栋"
            raise ValidationError(msg)

        existing = {
            b.building_no
            for b in db.query(BdBuilding.building_no)
            .filter(BdBuilding.community_id == body.community_id, BdBuilding.building_no.in_(nos))
            .all()
        }
        added = 0
        now = datetime.now(timezone.utc)
        created_map: dict[str, int] = {}
        for no in nos:
            if no in existing:
                continue
            building = BdBuilding(community_id=body.community_id, building_no=no, created_at=now, updated_at=now)
            db.add(building)
            db.flush()
            created_map[no] = building.id
            added += 1
        try:
            db.commit()
        except IntegrityError:
            # 并发下 uq 冲突（BR-09 批量场景跳过）：回退逐条容错
            db.rollback()
            added = 0
            created_map = {}
            for no in nos:
                if no in existing:
                    continue
                try:
                    building = BdBuilding(
                        community_id=body.community_id, building_no=no, created_at=now, updated_at=now
                    )
                    db.add(building)
                    db.commit()
                    created_map[no] = building.id
                    added += 1
                except IntegrityError:
                    db.rollback()

        # 撞同名 open pending 自动转正（BR-26）
        self._promote_matching_pendings(
            db,
            kind=BdEntryKind.BUILDING,
            community_id=body.community_id,
            parent_building_id=None,
            created_map=created_map,
            operator_id=operator_id,
        )

        self._audit(
            db,
            user_id=operator_id,
            action="bd_building_batch_create",
            resource_id=body.community_id,
            after={"building_no": body.building_no, "added": added, "skipped": len(nos) - added},
            request=request,
        )
        return BdBatchCreateResult(added=added, skipped=len(nos) - added)

    # ---------- FR-06 户室补录 ----------

    def create_rooms(
        self,
        db: Session,
        building_id: int,
        body: BdRoomCreateRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdBatchCreateResult:
        """Admin 补录户室（楼层×户号笛卡尔展开 + uq 跳过 + 上限拦截）."""
        building = db.get(BdBuilding, building_id)
        if not building:
            msg = "楼栋不存在"
            raise ResourceNotFoundError(msg)

        floors = expand_range(body.floor)
        # 户号尾号按左操作数宽度补零（`01-08` → 01..08）
        room_nos = expand_range(body.room_suffix, pad_zero=True)
        combos = [(f, r) for f in floors for r in room_nos]
        if len(combos) > MAX_ROOMS_PER_BATCH:
            msg = f"单次最多补录 {MAX_ROOMS_PER_BATCH} 户，当前 {len(combos)} 户"
            raise ValidationError(msg)

        # 组装原始户室号串：楼层串 + 户号尾号（保留补零宽度，如 7 层 03 → `0703`）
        def _compose(floor_str: str, room_str: str) -> str:
            floor_digits = floor_str.zfill(2) if floor_str.isdigit() else floor_str
            return f"{floor_digits}{room_str}"

        candidates = [_compose(f, r) for f, r in combos]
        existing = {
            r.room_no
            for r in db.query(BdRoom.room_no)
            .filter(BdRoom.building_id == building_id, BdRoom.room_no.in_(candidates))
            .all()
        }
        added = 0
        now = datetime.now(timezone.utc)
        created_map: dict[str, int] = {}
        for room_no in candidates:
            if room_no in existing:
                continue
            room = BdRoom(building_id=building_id, room_no=room_no, floor=parse_room_floor(room_no), created_at=now)
            db.add(room)
            db.flush()
            created_map[room_no] = room.id
            added += 1
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            added = 0
            created_map = {}
            for room_no in candidates:
                if room_no in existing:
                    continue
                try:
                    room = BdRoom(
                        building_id=building_id, room_no=room_no, floor=parse_room_floor(room_no), created_at=now
                    )
                    db.add(room)
                    db.commit()
                    created_map[room_no] = room.id
                    added += 1
                except IntegrityError:
                    db.rollback()

        # 撞同名 open pending 自动转正（BR-26）
        self._promote_matching_pendings(
            db,
            kind=BdEntryKind.ROOM,
            community_id=None,
            parent_building_id=building_id,
            created_map=created_map,
            operator_id=operator_id,
        )

        # 冗余计数刷新
        count = db.query(BdRoom).filter(BdRoom.building_id == building_id).count()
        building.room_count = count
        building.updated_at = datetime.now(timezone.utc)
        db.commit()

        self._audit(
            db,
            user_id=operator_id,
            action="bd_room_batch_create",
            resource_id=str(building_id),
            after={
                "floor": body.floor,
                "room_suffix": body.room_suffix,
                "added": added,
                "skipped": len(candidates) - added,
            },
            request=request,
        )
        return BdBatchCreateResult(added=added, skipped=len(candidates) - added)

    # ---------- FR-06 删除（admin，引用拦截 + 审计） ----------

    _BIZ_MODELS = (Project, Lead, L4MarketingProject, PropertyCurrent)

    def _biz_reference_count(
        self,
        db: Session,
        *,
        field: str,
        values: list,
    ) -> int:
        """统计业务单据（项目/线索/营销/房源）对楼栋/户室的引用数."""
        if not values:
            return 0
        total = 0
        for model in self._BIZ_MODELS:
            total += db.query(model).filter(getattr(model, field).in_(values)).count()
        return total

    def delete_building(
        self,
        db: Session,
        building_id: int,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdDeleteResult:
        """删除楼栋（含其下全部户室）。

        拦截：被任一业务单据引用（building_id），或审核池存在该楼栋下的
        open pending 子级（BR-28 父子拓扑：删父级会悬挂待审子级）。
        """
        building = db.get(BdBuilding, building_id)
        if not building:
            msg = "楼栋不存在"
            raise ResourceNotFoundError(msg)

        ref_counts = {
            model.__name__: db.query(model).filter(model.building_id == building_id).count()
            for model in self._BIZ_MODELS
        }
        total_refs = sum(ref_counts.values())
        if total_refs:
            detail = "、".join(f"{name} {cnt}" for name, cnt in ref_counts.items() if cnt)
            msg = f"楼栋已被 {total_refs} 张业务单据引用（{detail}），请先解除关联后再删除"
            raise ConflictError(msg)
        pending_children = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == BdEntryKind.ROOM,
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.parent_kind == BdEntryKind.BUILDING,
                BdPendingEntry.parent_id == building_id,
            )
            .count()
        )
        if pending_children:
            msg = f"审核池中存在该楼栋下的 {pending_children} 条待审户室，请先处理审核条目再删除"
            raise ConflictError(msg)

        rooms_deleted = db.query(BdRoom).filter(BdRoom.building_id == building_id).delete(synchronize_session=False)
        before = {"building_no": building.building_no, "rooms_deleted": rooms_deleted}
        # 批量删除而非 session.delete：rooms relationship 无级联配置，
        # session.delete 会尝试对已删除的房间行发 FK 置空 UPDATE → StaleDataError
        db.query(BdBuilding).filter(BdBuilding.id == building_id).delete(synchronize_session=False)
        db.commit()
        self._audit(
            db,
            user_id=operator_id,
            action="bd_building_delete",
            resource_id=str(building_id),
            before=before,
            request=request,
        )
        return BdDeleteResult(deleted=1)

    def delete_floor(
        self,
        db: Session,
        building_id: int,
        floor: int,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdDeleteResult:
        """删除楼层 = 批量删除该层全部户室（楼层为呈现层概念，随户室派生）."""
        building = db.get(BdBuilding, building_id)
        if not building:
            msg = "楼栋不存在"
            raise ResourceNotFoundError(msg)
        rooms = db.query(BdRoom).filter(BdRoom.building_id == building_id, BdRoom.floor == floor).all()
        if not rooms:
            msg = "该楼层没有户室"
            raise ResourceNotFoundError(msg)

        room_ids = [r.id for r in rooms]
        ref_counts = {
            model.__name__: db.query(model).filter(model.room_id.in_(room_ids)).count() for model in self._BIZ_MODELS
        }
        total_refs = sum(ref_counts.values())
        if total_refs:
            detail = "、".join(f"{name} {cnt}" for name, cnt in ref_counts.items() if cnt)
            msg = f"该楼层有 {total_refs} 户已被业务单据引用（{detail}），请先解除关联后再删除"
            raise ConflictError(msg)

        deleted = (
            db.query(BdRoom)
            .filter(BdRoom.building_id == building_id, BdRoom.floor == floor)
            .delete(synchronize_session=False)
        )
        building.room_count = db.query(BdRoom).filter(BdRoom.building_id == building_id).count()
        building.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._audit(
            db,
            user_id=operator_id,
            action="bd_floor_delete",
            resource_id=str(building_id),
            before={"floor": floor, "rooms_deleted": deleted},
            request=request,
        )
        return BdDeleteResult(deleted=deleted)

    def delete_room(
        self,
        db: Session,
        building_id: int,
        room_id: int,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdDeleteResult:
        """删除单个户室（被业务单据引用时拦截）."""
        room = db.get(BdRoom, room_id)
        if not room or room.building_id != building_id:
            msg = "户室不存在"
            raise ResourceNotFoundError(msg)

        total_refs = self._biz_reference_count(db, field="room_id", values=[room_id])
        if total_refs:
            msg = f"该户室已被 {total_refs} 张业务单据引用，请先解除关联后再删除"
            raise ConflictError(msg)

        building = db.get(BdBuilding, building_id)
        before = {"room_no": room.room_no, "floor": room.floor}
        db.delete(room)
        if building:
            building.room_count = db.query(BdRoom).filter(BdRoom.building_id == building_id).count()
            building.updated_at = datetime.now(timezone.utc)
        db.commit()
        self._audit(
            db,
            user_id=operator_id,
            action="bd_room_delete",
            resource_id=str(room_id),
            before=before,
            request=request,
        )
        return BdDeleteResult(deleted=1)

    # ---------- FR-07 新增小区 ----------

    def create_community(
        self,
        db: Session,
        body: BdCommunityCreateRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdCommunityDetailResponse:
        """Admin 新增小区（重名拦截 + 撞同名 open pending 自动转正 BR-26）."""
        normalized = normalize_community_name(body.name)
        # 1. 重名拦截（BR-01）
        existing = db.query(Community).filter(Community.name == body.name.strip()).first()
        if existing:
            msg = "同名小区已存在，请直接选择；变体合并走治理合并"
            raise ConflictError(msg)

        # 2. 撞同名 open pending → 自动转正（BR-26：视同 admin 确认，审计 + 通知）
        pending = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == BdEntryKind.COMMUNITY,
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.normalized_name == normalized,
            )
            .with_for_update()
            .first()
        )

        community = Community(
            name=body.name.strip(),
            district=body.district,
            business_circle=body.business_circle,
            ring=body.ring,
            address=body.address,
            lng=body.lng,
            lat=body.lat,
            source="admin",
            is_active=True,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(community)
        db.flush()

        promoted_pending_id: int | None = None
        if pending:
            pending.status = BdEntryStatus.CREATED
            pending.resolved_target_id = community.id
            pending.resolved_by = operator_id
            pending.resolved_at = datetime.now(timezone.utc)
            promoted_pending_id = pending.id
            db.flush()
            # 引用单据回填 + 通知提交人（复用审核服务回填闭环）
            from services.property.building_review_service import get_building_review_service

            get_building_review_service().backfill_references_after_create(
                db, entry=pending, target_community_id=community.id
            )

        db.commit()

        self._audit(
            db,
            user_id=operator_id,
            action="bd_community_create",
            resource_id=community.id,
            after={"name": community.name, "promoted_pending_id": promoted_pending_id},
            request=request,
        )
        detail_service = BuildingDictReadService()
        detail = detail_service.get_community_detail(db, community.id)
        if detail is None:  # pragma: no cover - 刚创建必可查
            msg = "小区详情查询失败"
            raise ResourceNotFoundError(msg)
        return detail

    # ---------- FR-02 画像修正 ----------

    def patch_community(
        self,
        db: Session,
        community_id: str,
        body: BdCommunityPatchRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdCommunityDetailResponse:
        """修正画像（PATCH 语义 + 审计）。"""
        community = db.query(Community).filter(Community.id == community_id).first()
        if not community:
            msg = "小区不存在"
            raise ResourceNotFoundError(msg)

        before = {
            "ring": community.ring,
            "property_types": community.property_types,
            "era_from": community.era_from,
            "era_to": community.era_to,
            "developer": community.developer,
            "property_mgmt": community.property_mgmt,
            "address": community.address,
        }
        changed = False
        if body.ring is not None:
            community.ring = body.ring
            changed = True
        if body.property_types is not None:
            community.property_types = body.property_types
            changed = True
        if body.era_from is not None:
            community.era_from = body.era_from
            changed = True
        if body.era_to is not None:
            community.era_to = body.era_to
            changed = True
        if body.developer is not None:
            community.developer = body.developer
            changed = True
        if body.property_mgmt is not None:
            community.property_mgmt = body.property_mgmt
            changed = True
        if body.address is not None:
            community.address = body.address
            changed = True
        if body.lng is not None:
            community.lng = body.lng
            changed = True
        if body.lat is not None:
            community.lat = body.lat
            changed = True

        if changed:
            community.updated_at = datetime.now(timezone.utc)
            db.commit()
            self._audit(
                db,
                user_id=operator_id,
                action="bd_community_patch",
                resource_id=community_id,
                before=before,
                after=body.model_dump(exclude_unset=True, exclude_none=True),
                request=request,
            )

        detail = BuildingDictReadService().get_community_detail(db, community_id)
        if detail is None:  # pragma: no cover - 前面已确认存在
            msg = "小区详情查询失败"
            raise ResourceNotFoundError(msg)
        return detail

    # ---------- 小区删除（admin：未使用直接删 / 被使用 409 阻止） ----------

    def delete_community(
        self,
        db: Session,
        community_id: str,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdDeleteResult:
        """删除小区（含其下全部楼栋/户室与别名/图片）。

        拦截（任一命中即 409，不删除）：
        - 被业务单据引用（小区级 community_id，或其下楼栋 building_id / 户室 room_id）；
        - 审核池存在该小区下的 open 待审楼栋（BR-28 父子拓扑：删父级会悬挂待审子级）；
        - 存在并入本小区的归档小区（merged_into_id 指向本小区）。
        """
        community = db.query(Community).filter(Community.id == community_id).first()
        if not community:
            msg = "小区不存在"
            raise ResourceNotFoundError(msg)

        buildings = db.query(BdBuilding).filter(BdBuilding.community_id == community_id).all()
        building_ids = [b.id for b in buildings]
        room_ids = (
            [r.id for r in db.query(BdRoom.id).filter(BdRoom.building_id.in_(building_ids)).all()]
            if building_ids
            else []
        )

        # 1. 小区级业务引用
        community_ref_counts = {
            model.__name__: db.query(model).filter(model.community_id == community_id).count()
            for model in self._BIZ_MODELS
        }
        community_refs = sum(community_ref_counts.values())
        if community_refs:
            detail = "、".join(f"{name} {cnt}" for name, cnt in community_ref_counts.items() if cnt)
            msg = f"小区已被 {community_refs} 张业务单据引用（{detail}），请先解除关联后再删除"
            raise ConflictError(msg)

        # 2. 楼栋/户室级业务引用（整树删除前必须确认无深度引用）
        building_refs = self._biz_reference_count(db, field="building_id", values=building_ids)
        room_refs = self._biz_reference_count(db, field="room_id", values=room_ids)
        if building_refs or room_refs:
            msg = (
                f"小区下有被业务单据引用的楼栋/户室（楼栋 {building_refs} 处、户室 {room_refs} 处），"
                "请先解除关联后再删除"
            )
            raise ConflictError(msg)

        # 3. 审核池 open 待审子级：
        #    - 待审楼栋（kind=BUILDING）挂 community_id（BR-28 父子拓扑：删父级会悬挂待审子级）；
        #    - 待审户室（kind=ROOM）挂实表楼栋 parent_id —— 楼栋将被整树删除，
        #      若不同步拦截，转正时将报「父级楼栋不存在」且引用永不回填（数据悬挂）
        pending_building_children = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == BdEntryKind.BUILDING,
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.community_id == community_id,
            )
            .count()
        )
        pending_room_children = (
            db.query(BdPendingEntry)
            .join(BdBuilding, (BdPendingEntry.parent_kind == "building") & (BdPendingEntry.parent_id == BdBuilding.id))
            .filter(
                BdPendingEntry.kind == BdEntryKind.ROOM,
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdBuilding.community_id == community_id,
            )
            .count()
        )
        pending_children = pending_building_children + pending_room_children
        if pending_children:
            msg = f"审核池中存在该小区下的 {pending_children} 条待审楼栋/户室，请先处理审核条目再删除"
            raise ConflictError(msg)

        # 4. 合并治理引用
        merged_count = (
            db.query(Community).filter(Community.merged_into_id == community_id, Community.id != community_id).count()
        )
        if merged_count:
            msg = f"存在 {merged_count} 个并入本小区的归档小区，请先解除合并后再删除"
            raise ConflictError(msg)

        before = {
            "name": community.name,
            "buildings": len(building_ids),
            "rooms": len(room_ids),
        }
        # 批量删除而非 session.delete：relationship 无级联配置，
        # session.delete 会对子表行发 FK 置空 UPDATE → StaleDataError（同 delete_building）
        db.query(CommunityImage).filter(CommunityImage.community_id == community_id).delete(synchronize_session=False)
        db.query(CommunityAlias).filter(CommunityAlias.community_id == community_id).delete(synchronize_session=False)
        if room_ids:
            db.query(BdRoom).filter(BdRoom.id.in_(room_ids)).delete(synchronize_session=False)
        if building_ids:
            db.query(BdBuilding).filter(BdBuilding.id.in_(building_ids)).delete(synchronize_session=False)
        db.query(Community).filter(Community.id == community_id).delete(synchronize_session=False)
        db.commit()

        self._audit(
            db,
            user_id=operator_id,
            action="bd_community_delete",
            resource_id=community_id,
            before=before,
            request=request,
        )
        return BdDeleteResult(deleted=1)


_service: DictWriteService | None = None


def get_dict_write_service() -> DictWriteService:
    """获取写服务单例."""
    global _service
    if _service is None:
        _service = DictWriteService()
    return _service
