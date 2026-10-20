"""审核落库与拓扑搬运（BR-13/BR-28/BR-29，从 building_review_service 拆分）.

[拆分理由] ``building_review_service`` 已 912 行（基线 663 行，本次 BR-29 名称修正
与「合并到待审兄弟」新增约 250 行），远超 AGENTS「单文件 >500 行必须拆分」约束。
本模块以 Mixin 承载「pending → 字典落库」的三级创建方法（含名称修正入参），
与外层共享 ``_check_topology`` / ``_resolve_room_parent`` / ``_rewire_child_buildings``
及审计协作，故不做函数化重写，行为与事务边界完全不变。

BR-29 名称修正进入落库方法的路径：``_resolve_create(override_name=...)`` 归一后
作为 ``name`` 参数传入，三处查重键与 ``db.add`` 都改用该名称 —— 名称一改查重键
必须同步改，否则会插出重复行或被 uq 打成 500。
"""

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from models import BdBuilding, BdPendingEntry, BdRoom, Community
from services.property.dict_parser import normalize_district_value
from services.system.exceptions import ValidationError
from utils.building_dict import parse_room_floor

logger = logging.getLogger(__name__)


class BuildingDictCreateMixin:
    """pending 条目转字典行（community / building / room 三级），BR-29 支持改名."""

    # ---------- 字典落库（create 用） ----------

    def _create_community_from_pending(
        self,
        db: Session,
        entry: BdPendingEntry,
        *,
        name: str | None = None,
    ) -> str:
        """Pending 小区 → communities 落库（BR-26 防重：再查重名兜底）.

        Args:
            db: 数据库会话
            entry: 待审小区条目
            name: BR-29 修正后的名称；None=沿用 ``entry.name``

        """
        target_name = name or entry.name
        existing = db.query(Community).filter(Community.name == target_name).first()
        if existing:
            # 修正后撞同名已有小区（含已归档子档，communities.name 是全库 UNIQUE）
            # → 幂等并入，不报错；已归档小区不可并入（会在读侧隐身），单独拦截
            if not existing.is_active:
                msg = f"名称「{target_name}」已被一个已归档（已合并）的小区占用，请换个名称或先解除合并"
                raise ValidationError(msg)
            entry.resolved_target_id = existing.id
            return existing.id
        payload = entry.payload or {}
        community = Community(
            name=target_name,
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

    def _create_building_from_pending(
        self,
        db: Session,
        entry: BdPendingEntry,
        *,
        name: str | None = None,
    ) -> int:
        """Pending 楼栋 → bd_buildings 落库（父级必已转正：拓扑校验在 resolve 入口）.

        Args:
            db: 数据库会话
            entry: 待审楼栋条目
            name: BR-29 修正后的名称（已做量词归一）；None=沿用 ``entry.name``

        """
        if not entry.community_id:
            msg = "楼栋 pending 缺少归属小区"
            raise ValidationError(msg)
        target_name = name or entry.name
        existing = (
            db.query(BdBuilding)
            .filter(BdBuilding.community_id == entry.community_id, BdBuilding.building_no == target_name)
            .first()
        )
        if existing:
            return existing.id
        building = BdBuilding(
            community_id=entry.community_id,
            building_no=target_name,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(building)
        db.flush()
        return building.id

    def _create_room_from_pending(
        self,
        db: Session,
        entry: BdPendingEntry,
        *,
        name: str | None = None,
    ) -> int:
        """Pending 户室 → bd_rooms 落库.

        Args:
            db: 数据库会话
            entry: 待审户室条目
            name: BR-29 修正后的户室号；None=沿用 ``entry.name``

        """
        parent_building = self._resolve_room_parent(db, entry)
        target_name = name or entry.name
        existing = (
            db.query(BdRoom).filter(BdRoom.building_id == parent_building.id, BdRoom.room_no == target_name).first()
        )
        if existing:
            return existing.id
        room = BdRoom(
            building_id=parent_building.id,
            room_no=target_name,
            floor=parse_room_floor(target_name),
            created_at=datetime.now(timezone.utc),
        )
        db.add(room)
        db.flush()
        # H4 修复：flush 后 count() 已包含本户，原实现再 +1 造成每次审核新增户室
        # 冗余计数偏移 +1 且不可自愈；这里以实表行数为准（与 dict_write_service 口径一致）
        parent_building.room_count = db.query(BdRoom).filter(BdRoom.building_id == parent_building.id).count()
        return room.id
