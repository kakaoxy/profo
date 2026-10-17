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
        commit: bool = True,
    ) -> BdPendingSubmitResponse:
        """提交新增进审核池（幂等复用同名 open pending）.

        Args:
            db: 数据库会话
            body: 提交载荷（kind/name/parent/source）
            submitted_by: 提交人用户 ID
            commit: 是否内部 commit；业务单据创建/更新链路（leads/marketing）
                必须传 False —— pending 需与业务单据同事务提交，否则内部 commit
                会把尚未完成的业务单据一并提前落库，后续步骤失败时产生半提交
                （如缺价格历史的重复线索）。独立端点 /pending 使用默认 True。

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
        parent_is_pending = False
        community_id: str | None = None

        if kind == BdEntryKind.COMMUNITY:
            parent_kind = None
            parent_id = None
        elif kind == BdEntryKind.BUILDING:
            if not body.parent_kind or not body.parent_id:
                msg = "楼栋 pending 必须挂父级小区"
                raise ValidationError(msg)
            parent_kind, parent_id, parent_is_pending, community_id = self._resolve_parent(
                db, body.parent_kind, body.parent_id
            )
        else:  # room
            if not body.parent_kind or not body.parent_id:
                msg = "户室 pending 必须挂父级楼栋"
                raise ValidationError(msg)
            parent_kind, parent_id, parent_is_pending, community_id = self._resolve_parent(
                db, body.parent_kind, body.parent_id
            )

            # FR-10：录入端新增户室全部进审核池，提交侧不做字典查重（与 community kind 对称）：
            # - 同名 pending 幂等复用由 uq_pending_open 兑底（FR-19）；
            # - 与实表同名时前端已引导直接选择，后端 create 落库幂等兑底（BR-09/BR-16），
            #   审核弹层「用已有的·推荐」改指流程可正常处理。
            # 注：不能按「楼层已有户室」拦截（AC-P1-3/AC-P3-1 要求已有 0401 的 4 层
            # 仍可提交 0403 进审核池）；BR-14「重复添加新楼层」由前端入口控制。

        # H1：唯一性判定的小区维度（community 条目自身即小区 / 父级本身待审时为 NULL）
        community_scope = community_id if kind != BdEntryKind.COMMUNITY else None

        # 1. 命中同名 open pending → 幂等复用（FR-19）
        existing = self._find_open_pending(
            db,
            kind=kind,
            normalized=normalized,
            parent_id=parent_id,
            parent_is_pending=parent_is_pending,
            community_scope=community_scope,
        )
        if existing:
            reference_added = self._append_reference(db, existing.id, body)
            self._finish(db, commit)
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
            parent_is_pending=parent_is_pending,
            community_scope=community_scope,
            source_type=body.source_type,
            source_id=body.source_id,
            submitted_by=submitted_by,
            status=BdEntryStatus.PENDING,
        )
        db.add(entry)
        # 并发同名：uq_pending_open 拦截 → 回退复用路径（FR-19 幂等）。
        # 用 SAVEPOINT 隔离本条插入：冲突时仅回滚到 savepoint，
        # commit=False 时不会连带回滚外层业务单据写入（H4 修复配套）。
        try:
            with db.begin_nested():
                db.flush()
        except IntegrityError:
            existing = self._find_open_pending(
                db,
                kind=kind,
                normalized=normalized,
                parent_id=parent_id,
                parent_is_pending=parent_is_pending,
                community_scope=community_scope,
            )
            if not existing:
                msg = "并发提交冲突，请重试"
                raise ValidationError(msg) from None
            self._append_reference(db, existing.id, body)
            self._finish(db, commit)
            return BdPendingSubmitResponse(pending_id=existing.id, created=False, reused=True)

        self._append_reference(db, entry.id, body)
        self._finish(db, commit)
        return BdPendingSubmitResponse(pending_id=entry.id, created=True, reused=False)

    @staticmethod
    def _find_open_pending(
        db: Session,
        *,
        kind: BdEntryKind,
        normalized: str,
        parent_id: int | None,
        parent_is_pending: bool,
        community_scope: str | None,
    ) -> BdPendingEntry | None:
        """查找同名 open pending（与 uq_pending_open 四维判定严格对齐）.

        不能只看 parent_id：H1 下 A/B 两小区的同名楼栋 parent_id 都是 0，
        必须叠加 community_scope；H2 下实表楼栋 id 与 pending 条目 id 可能数值相等，
        必须叠加 parent_is_pending。
        """
        query = db.query(BdPendingEntry).filter(
            BdPendingEntry.kind == kind,
            BdPendingEntry.status == BdEntryStatus.PENDING,
            BdPendingEntry.normalized_name == normalized,
            BdPendingEntry.parent_is_pending.is_(parent_is_pending),
        )
        if community_scope is None:
            query = query.filter(BdPendingEntry.community_scope.is_(None))
        else:
            query = query.filter(BdPendingEntry.community_scope == community_scope)
        if parent_id is None:
            query = query.filter(BdPendingEntry.parent_id.is_(None))
        else:
            query = query.filter(BdPendingEntry.parent_id == parent_id)
        return query.first()

    @staticmethod
    def _finish(db: Session, commit: bool) -> None:
        """按调用方语义收尾：独立链路 commit，业务单据链路交给外层统一提交."""
        if commit:
            db.commit()

    def _get_open_pending(self, db: Session, parent_id: str) -> BdPendingEntry | None:
        """按 ID 查 open pending 条目（非数字 ID 安全返回 None，不抛 ValueError → 500）."""
        try:
            pid = int(parent_id)
        except (TypeError, ValueError):
            return None
        return (
            db.query(BdPendingEntry)
            .filter(BdPendingEntry.id == pid, BdPendingEntry.status == BdEntryStatus.PENDING)
            .first()
        )

    def _resolve_parent(
        self,
        db: Session,
        parent_kind: str,
        parent_id: str,
    ) -> tuple[BdEntryKind, int, bool, str | None]:
        """解析父级（字典实表 id 或父级 pending 条目 id）.

        Returns:
            (parent_kind, parent_id, parent_is_pending, community_id)
            - parent_is_pending：H2 修复，显式区分 parent_id 指向实表还是 pending 条目
              （原实现把 pending_building 落成 parent_kind='building'，转正时无法区分，
              待审楼栋下的户室永久 400）；
            - community_id：pending 归属小区（父级是小区时即小区 id；父级是楼栋/pending 时反查；
              父级 pending 小区时为 None）

        """
        from models import BdBuilding

        if parent_kind == "community":
            community = db.query(Community).filter(Community.id == parent_id).first()
            if not community:
                msg = "父级小区不存在"
                raise ResourceNotFoundError(msg)
            # 父级为实表小区：parent_id 无法存 UUID（BigInteger），存 0 表示「父级为实表小区」；
            # 归属小区写入第三元 community_id，submit() 落库到 entry.community_id。
            return BdEntryKind.COMMUNITY, 0, False, community.id

        if parent_kind == "building":
            try:
                building = db.get(BdBuilding, int(parent_id))
            except (TypeError, ValueError):
                building = None
            if not building:
                msg = "父级楼栋不存在"
                raise ResourceNotFoundError(msg)
            return BdEntryKind.BUILDING, building.id, False, building.community_id

        if parent_kind == "pending_community":
            # 父级小区本身待审：pending 挂 pending 条目（拓扑审核 BR-28）
            parent_entry = self._get_open_pending(db, parent_id)
            if not parent_entry:
                msg = "父级小区待审条目不存在或已处理"
                raise ResourceNotFoundError(msg)
            return BdEntryKind.COMMUNITY, parent_entry.id, True, None

        if parent_kind == "pending_building":
            parent_entry = self._get_open_pending(db, parent_id)
            if not parent_entry:
                msg = "父级楼栋待审条目不存在或已处理"
                raise ResourceNotFoundError(msg)
            if parent_entry.kind != BdEntryKind.BUILDING:
                msg = "父级待审条目不是楼栋，请重新选择父级"
                raise ValidationError(msg)
            return BdEntryKind.BUILDING, parent_entry.id, True, parent_entry.community_id

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


def submit_dict_chain(
    db: Session,
    *,
    new_community: dict | None,
    new_building: dict | None,
    new_room: dict | None,
    biz_type: str,
    biz_id: str,
    community_id: str | None,
    building_id: int | None = None,
    submitted_by: str | None = None,
    commit: bool = False,
) -> None:
    """补录录入端新增字典 pending 引用（community → building → room 三级链）.

    M6 修复：原文该三级链在 leads/projects/marketing 三处各复制一份（各约 90 行），
    已有可见分叉（projects 注释与 commit=False 实际语义相反），故收敛到本模块单点。

    调用时机：业务单据已落库（有真实 id）、尚未 commit；submit 异常直接向上抛
    由外层回滚整单（不吞错）。

    Args:
        db: 数据库会话
        new_community: 小区快照载荷（可为空）
        new_building: 楼栋载荷（可为空）
        new_room: 户室载荷（可为空）
        biz_type: 引用来源类型（project/lead/marketing）
        biz_id: 引用来源单据 ID
        community_id: 单据关联的字典实表小区 ID（可为空）
        building_id: 单据关联的字典实表楼栋 ID（room 挂实表父级用，可为空）
        submitted_by: 提交人用户 ID（L1：审核池「提交人」列与提交人通知依据）
        commit: 传 False（默认）—— pending 与业务单据同事务，由外层统一 commit；
            内部 commit 会把未完成的业务单据提前落库，失败时产生半提交

    """
    svc = get_dict_submit_service()
    community_pending_id: int | None = None
    building_pending_id: int | None = None

    if new_community:
        community_pending_id = svc.submit(
            db,
            BdPendingSubmitRequest(
                kind="community",
                name=str(new_community.get("name") or "").strip(),
                community_payload=new_community,
                source_type=biz_type,
                source_id=biz_id,
            ),
            submitted_by=submitted_by,
            commit=commit,
        ).pending_id

    if new_building:
        if community_id:
            building_parent_kind, building_parent_id = "community", str(community_id)
        elif community_pending_id is not None:
            building_parent_kind, building_parent_id = "pending_community", str(community_pending_id)
        else:
            building_parent_kind, building_parent_id = None, None
        building_pending_id = svc.submit(
            db,
            BdPendingSubmitRequest(
                kind="building",
                name=str(new_building.get("name") or new_building.get("building_no") or "").strip(),
                parent_kind=building_parent_kind,
                parent_id=building_parent_id,
                source_type=biz_type,
                source_id=biz_id,
            ),
            submitted_by=submitted_by,
            commit=commit,
        ).pending_id

    if new_room:
        if building_id is not None:
            room_parent_kind, room_parent_id = "building", str(building_id)
        elif building_pending_id is not None:
            room_parent_kind, room_parent_id = "pending_building", str(building_pending_id)
        else:
            room_parent_kind, room_parent_id = None, None
        svc.submit(
            db,
            BdPendingSubmitRequest(
                kind="room",
                name=str(new_room.get("name") or new_room.get("room_no") or "").strip(),
                parent_kind=room_parent_kind,
                parent_id=room_parent_id,
                source_type=biz_type,
                source_id=biz_id,
            ),
            submitted_by=submitted_by,
            commit=commit,
        )
