"""录入端提交服务（R7 前半 / FR-10 / Task 11）.

业务表单（新建项目/录线索/营销新增）搜不到目标时提交新增：
- 命中同名 open pending → 幂等复用并追加 bd_pending_references 引用（uq 防重）；
- 新 pending 写入（normalized_name 归一、父子挂接，BR-28）；
- 业务单据照常创建（不阻塞），单据 dict_status=pending、名称带「未审核」标签、
  级联锁定（BR-11）——由调用方（项目/线索/营销服务）依据返回的 pending_id 落库。
"""

import logging
from typing import ClassVar

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import BdEntryKind, BdEntryStatus, BdPendingEntry, BdPendingReference, BdReferenceStatus, Community
from schemas.building_dict import BdPendingSubmitRequest, BdPendingSubmitResponse
from services.system.exceptions import ResourceNotFoundError, ValidationError
from utils.building_dict import normalize_community_name

logger = logging.getLogger(__name__)

_KIND_VALUES = frozenset(e.value for e in BdEntryKind)


class DictSubmitService:
    """录入端提交服务（进审核池）."""

    # kind → 引用回填字段（bd_pending_references.field，常量映射）
    _KIND_FIELD: ClassVar[dict[BdEntryKind, str]] = {
        BdEntryKind.COMMUNITY: "community_id",
        BdEntryKind.BUILDING: "building_id",
        BdEntryKind.ROOM: "room_id",
    }

    def submit(
        self,
        db: Session,
        body: BdPendingSubmitRequest,
        *,
        submitted_by: str | None = None,
    ) -> BdPendingSubmitResponse:
        """提交新增进审核池（幂等复用同名 open pending）.

        Args:
            db: 数据库会话
            body: 提交载荷（kind/name/parent/source）
            submitted_by: 提交人用户 ID

        Returns:
            BdPendingSubmitResponse（reused=True 表示复用既有 pending）

        Raises:
            ValidationError: kind 非法 / building 缺父级小区
            ResourceNotFoundError: 父级小区/楼栋不存在
            ConflictError: 并发唯一冲突后查不到 pending（极端竞态）

        """
        if body.kind not in _KIND_VALUES:
            msg = f"kind 非法: {body.kind}"
            raise ValidationError(msg)

        kind = BdEntryKind(body.kind)
        name = body.name.strip()
        normalized = normalize_community_name(name)

        # 父级解析（BR-28：楼栋/户室 pending 必须挂父级）
        parent_kind: BdEntryKind | None = None
        parent_id: int | None = None
        community_id: str | None = None

        if kind == BdEntryKind.COMMUNITY:
            parent_kind = None
            parent_id = None
        elif kind == BdEntryKind.BUILDING:
            if not body.parent_kind or not body.parent_id:
                msg = "楼栋 pending 必须挂父级小区"
                raise ValidationError(msg)
            parent_kind, parent_id, community_id = self._resolve_parent(db, body.parent_kind, body.parent_id)
        else:  # room
            if not body.parent_kind or not body.parent_id:
                msg = "户室 pending 必须挂父级楼栋"
                raise ValidationError(msg)
            parent_kind, parent_id, community_id = self._resolve_parent(db, body.parent_kind, body.parent_id)

            # FR-10：录入端新增户室全部进审核池，提交侧不做字典查重（与 community kind 对称）：
            # - 同名 pending 幂等复用由 uq_pending_open 兑底（FR-19）；
            # - 与实表同名时前端已引导直接选择，后端 create 落库幂等兑底（BR-09/BR-16），
            #   审核弹层「用已有的·推荐」改指流程可正常处理。
            # 注：不能按「楼层已有户室」拦截（AC-P1-3/AC-P3-1 要求已有 0401 的 4 层
            # 仍可提交 0403 进审核池）；BR-14「重复添加新楼层」由前端入口控制。

        # 1. 命中同名 open pending → 幂等复用（FR-19）
        existing = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == kind,
                BdPendingEntry.status == BdEntryStatus.PENDING,
                # community 条目 parent_id 为 NULL；用 COALESCE 等价判定（与 uq_pending_open 对齐）
                BdPendingEntry.normalized_name == normalized,
                BdPendingEntry.parent_id.is_(None) if parent_id is None else BdPendingEntry.parent_id == parent_id,
            )
            .first()
        )
        if existing:
            reference_added = self._append_reference(db, existing.id, body)
            db.commit()
            logger.info(
                "复用 pending %s (kind=%s name=%s 追加引用=%s)",
                existing.id,
                kind.value,
                name,
                reference_added,
            )
            return BdPendingSubmitResponse(pending_id=existing.id, created=False, reused=True)

        # 2. 新 pending 写入
        entry = BdPendingEntry(
            kind=kind,
            community_id=community_id,
            name=name,
            normalized_name=normalized,
            payload=body.community_payload,
            parent_kind=parent_kind,
            parent_id=parent_id,
            source_type=body.source_type,
            source_id=body.source_id,
            submitted_by=submitted_by,
            status=BdEntryStatus.PENDING,
        )
        db.add(entry)
        try:
            db.flush()
        except IntegrityError:
            # 并发同名：uq_pending_open 拦截 → 回退复用路径（FR-19 幂等）
            db.rollback()
            existing = (
                db.query(BdPendingEntry)
                .filter(
                    BdPendingEntry.kind == kind,
                    BdPendingEntry.status == BdEntryStatus.PENDING,
                    BdPendingEntry.normalized_name == normalized,
                    BdPendingEntry.parent_id.is_(None) if parent_id is None else BdPendingEntry.parent_id == parent_id,
                )
                .first()
            )
            if not existing:
                msg = "并发提交冲突，请重试"
                raise ValidationError(msg) from None
            self._append_reference(db, existing.id, body)
            db.commit()
            return BdPendingSubmitResponse(pending_id=existing.id, created=False, reused=True)

        self._append_reference(db, entry.id, body)
        db.commit()
        return BdPendingSubmitResponse(pending_id=entry.id, created=True, reused=False)

    def _resolve_parent(
        self,
        db: Session,
        parent_kind: str,
        parent_id: str,
    ) -> tuple[BdEntryKind, int, str | None]:
        """解析父级（字典实表 id 或父级 pending 条目 id）.

        Returns:
            (parent_kind, parent_id, community_id) —— community_id 为 pending 归属小区
            （父级是小区时即小区 id；父级是楼栋/pending 时反查；父级 pending 小区时为 None）

        """
        from models import BdBuilding

        if parent_kind == "community":
            community = db.query(Community).filter(Community.id == parent_id).first()
            if not community:
                msg = "父级小区不存在"
                raise ResourceNotFoundError(msg)
            # 父级为实表小区：parent_id 无法存 UUID（BigInteger），存 0 表示「父级为实表小区」；
            # 归属小区写入第三元 community_id，submit() 落库到 entry.community_id。
            return BdEntryKind.COMMUNITY, 0, community.id

        if parent_kind == "building":
            building = db.get(BdBuilding, int(parent_id))
            if not building:
                msg = "父级楼栋不存在"
                raise ResourceNotFoundError(msg)
            return BdEntryKind.BUILDING, building.id, building.community_id

        if parent_kind == "pending_community":
            # 父级小区本身待审：pending 挂 pending 条目（拓扑审核 BR-28）
            parent_entry = (
                db.query(BdPendingEntry)
                .filter(BdPendingEntry.id == int(parent_id), BdPendingEntry.status == BdEntryStatus.PENDING)
                .first()
            )
            if not parent_entry:
                msg = "父级小区待审条目不存在或已处理"
                raise ResourceNotFoundError(msg)
            return BdEntryKind.COMMUNITY, parent_entry.id, None

        if parent_kind == "pending_building":
            parent_entry = (
                db.query(BdPendingEntry)
                .filter(BdPendingEntry.id == int(parent_id), BdPendingEntry.status == BdEntryStatus.PENDING)
                .first()
            )
            if not parent_entry:
                msg = "父级楼栋待审条目不存在或已处理"
                raise ResourceNotFoundError(msg)
            return BdEntryKind.BUILDING, parent_entry.id, parent_entry.community_id

        msg = f"parent_kind 非法: {parent_kind}"
        raise ValidationError(msg)

    def _append_reference(self, db: Session, pending_id: int, body: BdPendingSubmitRequest) -> bool:
        """追加引用记录（uq(biz_type, biz_id, field) 防重；无来源信息时跳过）.

        field 由 kind 推导（community→community_id/building→building_id/room→room_id）。
        """
        if not body.source_type or not body.source_id:
            return False
        field = self._KIND_FIELD[BdEntryKind(body.kind)]
        existing_ref = (
            db.query(BdPendingReference)
            .filter(
                BdPendingReference.biz_type == body.source_type,
                BdPendingReference.biz_id == body.source_id,
                BdPendingReference.field == field,
            )
            .first()
        )
        if existing_ref:
            # 同一单据同一字段仅一条引用（uq 语义）；已存在则幂等跳过
            return False
        db.add(
            BdPendingReference(
                pending_id=pending_id,
                biz_type=body.source_type,
                biz_id=body.source_id,
                field=field,
                status=BdReferenceStatus.OPEN,
            )
        )
        return True


_service: DictSubmitService | None = None


def get_dict_submit_service() -> DictSubmitService:
    """获取提交服务单例."""
    global _service
    if _service is None:
        _service = DictSubmitService()
    return _service
