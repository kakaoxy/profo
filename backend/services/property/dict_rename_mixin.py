"""字典名称修正服务（BR-29：审核通过后的纠错改名，从 dict_write_service 拆分）.

[拆分理由] ``dict_write_service`` 已 1172 行（基线 884 行，本次 BR-29 新增约 280 行），
超出 AGENTS「单文件 >500 行必须拆分」的约束。本模块以 Mixin 形式承载三块同质能力
（楼栋号 / 户室号 / 小区名修正），与新模块外的写服务共享 ``_audit`` /
``_promote_matching_pendings`` / ``RENAME_ALIAS_SOURCE``，因此不做函数化重写，
只用 Mixin 收敛文件体量，行为与事务边界保持完全不变。

口径要点（详见各方法 docstring）：
- 楼栋号归一（尾部单个「号」剥离）复用 ``utils.building_dict.normalize_building_no``；
- 户室改名必须重算派生列 ``floor``（BR-02），否则楼层分组静默错位；
- 小区改名全库唯一（含已归档子档）+ 旧名沉淀 ``community_aliases(rename_operation)``；
- 撞同名 open pending 时复用 BR-26「视同 admin 确认」自动转正，且必须先 flush
  自身写入再调用（该方法内部自带 commit）。
"""

import logging
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from models import BdBuilding, BdEntryKind, BdRoom, Community, CommunityAlias
from schemas.building_dict import (
    BdBuildingRenameRequest,
    BdCommunityRenameRequest,
    BdRenameResult,
    BdRoomRenameRequest,
)
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError
from utils.building_dict import normalize_building_no, parse_room_floor

logger = logging.getLogger(__name__)


class DictRenameMixin:
    """名称修正能力（BR-29），由 ``DictWriteService`` 继承装配."""

    # ---------- BR-29 名称修正（审核后纠错） ----------

    def rename_building(
        self,
        db: Session,
        building_id: int,
        body: BdBuildingRenameRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdRenameResult:
        """修正楼栋号（BR-29：uq 409 / 撞同名 open pending 自动转正 / 审计）.

        为什么不能直接复用 ``PATCH /admin/communities/{id}``：该端点是市场情报口径
        （无字典审计、不处理 pending 转正、不校验合并归档），接到字典会形成两套口径。

        改名的下游影响（已核对）：
        - 业务单据（projects/leads/marketing）持 ``building_id`` 指针，**id 不变 → 无需改单据**；
          项目列表/详情的 ``building_no`` 由 ``resolve_doc_names`` 实时查实表，改名即时生效；
        - 单据的 ``address`` 是录入时冻结原文（FR-12 口径），**不改写**；
        - ``bd_pending_entries.payload`` 是提交快照，**不回写**（保留证据链）。

        Args:
            db: 数据库会话
            building_id: 楼栋 ID
            body: 修正后的楼栋号（会做量词归一）
            operator_id: 操作人用户 ID（审计）
            request: 当前请求（审计，可空）

        Returns:
            改名结果（含旧名/新名/顺带转正的 pending 数）

        Raises:
            ResourceNotFoundError: 楼栋不存在
            ValidationError: 新名为空
            ConflictError: 同小区已存在同名楼栋

        """
        building = db.get(BdBuilding, building_id)
        if not building:
            msg = "楼栋不存在"
            raise ResourceNotFoundError(msg)

        old_no = building.building_no
        new_no = normalize_building_no(body.building_no)
        if not new_no:
            msg = "楼栋号不能为空"
            raise ValidationError(msg)
        if new_no == old_no:
            return BdRenameResult(success=True, message="楼栋号未变化", old_name=old_no, new_name=new_no)

        # 1. 同小区同名拦截（uq_bd_building_no）。存量存在「X」+「X号」并存的脏对，
        #    归一后可能撞上；提供明确的运营口径而不是 500。
        clash = (
            db.query(BdBuilding)
            .filter(
                BdBuilding.community_id == building.community_id,
                BdBuilding.building_no == new_no,
                BdBuilding.id != building_id,
            )
            .first()
        )
        if clash:
            msg = f"小区内已存在楼栋「{new_no}」（ID {clash.id}），如需归并请先与该楼栋核对后再处理"
            raise ConflictError(msg)

        building.building_no = new_no
        building.updated_at = datetime.now(timezone.utc)
        db.flush()

        # 2. 撞同名 open pending → 自动转正（BR-26：视同 admin 确认）。
        #    注意 _promote_matching_pendings 内部自带 commit，必须先 flush 自身写入，
        #    否则会出现「pending 已提交、楼栋改名未提交」的半提交。
        self._promote_matching_pendings(
            db,
            kind=BdEntryKind.BUILDING,
            community_id=building.community_id,
            parent_building_id=None,
            created_map={new_no: building_id},
            operator_id=operator_id,
        )

        self._audit(
            db,
            user_id=operator_id,
            action="bd_building_rename",
            resource_id=str(building_id),
            before={"building_no": old_no},
            after={"building_no": new_no, "community_id": building.community_id},
            request=request,
        )
        return BdRenameResult(
            success=True,
            message=f"楼栋号已修正：{old_no} → {new_no}",
            old_name=old_no,
            new_name=new_no,
        )

    def rename_room(
        self,
        db: Session,
        building_id: int,
        room_id: int,
        body: BdRoomRenameRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdRenameResult:
        """修正户室号（BR-29：uq 409 / floor 重算 / 审计）.

        ``floor`` 是从户室号派生的呈现层字段（BR-02），改名后**必须重算**，
        否则楼层分组会错（改名 0401→0501 仍挂在 4 层的静默脏数据）。

        Args:
            db: 数据库会话
            building_id: 所属楼栋 ID（与 room 校验一致，防跨楼栋误改）
            room_id: 户室 ID
            body: 修正后的户室号
            operator_id: 操作人用户 ID（审计）
            request: 当前请求（审计，可空）

        Returns:
            改名结果（含旧名/新名/顺带转正的 pending 数）

        Raises:
            ResourceNotFoundError: 户室不存在或不属于该楼栋
            ValidationError: 新户室号为空
            ConflictError: 同楼栋已存在同名户室

        """
        room = db.get(BdRoom, room_id)
        if not room or room.building_id != building_id:
            msg = "户室不存在"
            raise ResourceNotFoundError(msg)

        old_no = room.room_no
        old_floor = room.floor
        new_no = " ".join(body.room_no.split())
        if not new_no:
            msg = "户室号不能为空"
            raise ValidationError(msg)
        if new_no == old_no:
            return BdRenameResult(success=True, message="户室号未变化", old_name=old_no, new_name=new_no)

        clash = (
            db.query(BdRoom)
            .filter(BdRoom.building_id == building_id, BdRoom.room_no == new_no, BdRoom.id != room_id)
            .first()
        )
        if clash:
            msg = f"该楼栋已存在户室「{new_no}」（ID {clash.id}），请先核对后再处理"
            raise ConflictError(msg)

        room.room_no = new_no
        room.floor = parse_room_floor(new_no)
        db.flush()

        self._promote_matching_pendings(
            db,
            kind=BdEntryKind.ROOM,
            community_id=None,
            parent_building_id=building_id,
            created_map={new_no: room_id},
            operator_id=operator_id,
        )

        self._audit(
            db,
            user_id=operator_id,
            action="bd_room_rename",
            resource_id=str(room_id),
            before={"room_no": old_no, "floor": old_floor},
            after={"room_no": new_no, "floor": room.floor, "building_id": building_id},
            request=request,
        )
        return BdRenameResult(
            success=True,
            message=f"户室号已修正：{old_no} → {new_no}（楼层 {old_floor} → {room.floor}）",
            old_name=old_no,
            new_name=new_no,
        )

    def rename_community(
        self,
        db: Session,
        community_id: str,
        body: BdCommunityRenameRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BdRenameResult:
        """修正小区名（BR-29：全库唯一 409 / 旧名沉淀别名 / 归档拦截 / 审计）.

        冗余面处理口径（刻意不回写，与 FR-12「原值冻结」一致）：
        - ``projects/leads/l4_marketing_projects/property_current.community_name``
          均为**录入时原文**，不回写；读侧以 ``community_id`` 关联为准；
        - 旧名写入 ``community_aliases(data_source='rename_operation')``，
          保证改名后用旧名搜索仍能命中（与合并吸纳别名同一套查询路径）。

        Args:
            db: 数据库会话
            community_id: 小区 ID
            body: 修正后的小区名（全库唯一）
            operator_id: 操作人用户 ID（审计）
            request: 当前请求（审计，可空）

        Returns:
            改名结果

        Raises:
            ResourceNotFoundError: 小区不存在
            ConflictError: 新名已被其他小区占用，或小区已合并归档
            ValidationError: 新名为空

        """
        community = db.query(Community).filter(Community.id == community_id).first()
        if not community:
            msg = "小区不存在"
            raise ResourceNotFoundError(msg)
        if not community.is_active:
            msg = "该小区已并入主档（is_active=false），不可改名；如需维护请在主档操作或先解除合并"
            raise ConflictError(msg)

        old_name = community.name
        new_name = " ".join(body.name.split())
        if not new_name:
            msg = "小区名不能为空"
            raise ValidationError(msg)
        if new_name == old_name:
            return BdRenameResult(success=True, message="小区名未变化", old_name=old_name, new_name=new_name)

        # 全库唯一（communities_name_key）：包含已归档子档，否则改名后解除合并会撞约束
        clash = db.query(Community).filter(Community.name == new_name, Community.id != community_id).first()
        if clash:
            state = "（已归档/已合并）" if not clash.is_active else ""
            msg = f"小区名「{new_name}」已被占用{state}，请换名或走治理合并"
            raise ConflictError(msg)

        community.name = new_name
        community.updated_at = datetime.now(timezone.utc)
        db.flush()

        # 旧名沉淀为别名：改名后用旧名搜索仍可命中（dict_read_service 的 keyword 分支已含别名）
        existing_alias = (
            db.query(CommunityAlias)
            .filter(CommunityAlias.alias_name == old_name, CommunityAlias.data_source == self.RENAME_ALIAS_SOURCE)
            .first()
        )
        if existing_alias:
            existing_alias.community_id = community_id
            existing_alias.is_deleted = False
        else:
            db.add(
                CommunityAlias(
                    community_id=community_id,
                    alias_name=old_name,
                    data_source=self.RENAME_ALIAS_SOURCE,
                    is_deleted=False,
                    created_at=datetime.now(timezone.utc),
                )
            )
        db.commit()

        self._audit(
            db,
            user_id=operator_id,
            action="bd_community_rename",
            resource_id=community_id,
            before={"name": old_name},
            after={"name": new_name, "alias_added": old_name},
            request=request,
        )
        return BdRenameResult(
            success=True,
            message=f"小区名已修正：{old_name} → {new_name}（旧名已存为别名，仍可搜索）",
            old_name=old_name,
            new_name=new_name,
        )
