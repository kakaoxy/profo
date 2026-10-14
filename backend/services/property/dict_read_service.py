"""楼盘字典读服务（R3 / R10 单点收敛）.

[不拆分理由] 总览/详情/楼栋/户室四组读模型共享 pending 叠加（R10 单点）与
关联计数口径（dict_status ∈ linked/pending），拆分会造成口径漂移；读路径无状态。

**pending 叠加读路径单点（NFR-05/BR-23）**：所有需要展示 pending 楼栋/楼层/户室的
查询（总览、详情抽屉、四级选择器、单据详情）一律经本服务，禁止业务代码各自
union 正式表与 pending 表。「未审核」标记 = 查询时实时 join
``bd_pending_entries(status='pending')``，不做缓存（BR-23）；
pending 转正后随终态查询自然摘除标签（R10）。

楼层分组（FR-04）：可见楼层集合 = 名义层数（楼栋内户室楼层）∪ pending 户室楼层；
``floor = NULL`` 归「未分层」组置底。
"""

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import BdBuilding, BdEntryStatus, BdPendingEntry, Community, CommunityAlias, CommunityImage, Project
from schemas.building_dict import (
    BdBuildingDetail,
    BdBuildingListItem,
    BdBuildingListResponse,
    BdCommunityDetailResponse,
    BdCommunityListItem,
    BdCommunityListResponse,
    BdFloorGroup,
    BdKpiResponse,
    BdRoomItem,
)
from utils.building_dict import format_plate_no, parse_room_floor
from utils.formatters import escape_like

logger = logging.getLogger(__name__)


def _community_first_image(db: Session, community_ids: list[str]) -> dict[str, str | None]:
    """批量取小区首图（sort_order 最小、未删除），无图为 None."""
    if not community_ids:
        return {}
    images = (
        db.query(CommunityImage)
        .filter(
            CommunityImage.community_id.in_(community_ids),
            CommunityImage.is_deleted.is_(False),
        )
        .order_by(CommunityImage.community_id, CommunityImage.sort_order.asc(), CommunityImage.id.asc())
        .all()
    )
    result: dict[str, str | None] = dict.fromkeys(community_ids)
    for img in images:
        if result.get(img.community_id) is None and img.url:
            result[img.community_id] = img.url
    return result


def _community_linked_project_counts(db: Session, community_ids: list[str]) -> dict[str, int]:
    """批量统计小区已关联项目数（projects.community_id + dict_status 口径）."""
    if not community_ids:
        return {}
    rows = (
        db.query(Project.community_id, func.count(Project.id))
        .filter(
            Project.community_id.in_(community_ids),
            Project.is_deleted.is_(False),
        )
        .group_by(Project.community_id)
        .all()
    )
    return {cid: int(cnt) for cid, cnt in rows}


def _community_merged_children(db: Session, community_id: str) -> list[dict]:
    """主档视角：已并入本小区的被并小区（软归档，merged_into_id 指针）.

    FR-14 v2.0 抽屉「合并信息区块」：呈现已并入小区及其数据情况 + 单条解除合并。
    """
    merged = (
        db.query(Community)
        .filter(Community.merged_into_id == community_id, Community.is_active.is_(False))
        .order_by(Community.name)
        .all()
    )
    if not merged:
        return []
    ids = [c.id for c in merged]
    building_counts = (
        dict(
            db.query(BdBuilding.community_id, func.count(BdBuilding.id))
            .filter(BdBuilding.community_id.in_(ids))
            .group_by(BdBuilding.community_id)
            .all()
        )
        if ids
        else {}
    )
    room_counts = (
        dict(
            db.query(BdBuilding.community_id, func.coalesce(func.sum(BdBuilding.room_count), 0))
            .filter(BdBuilding.community_id.in_(ids))
            .group_by(BdBuilding.community_id)
            .all()
        )
        if ids
        else {}
    )
    linked = _community_linked_project_counts(db, ids)
    return [
        {
            "id": c.id,
            "name": c.name,
            "address": c.address,
            "district": c.district,
            "building_count": int(building_counts.get(c.id, 0)),
            "room_count": int(room_counts.get(c.id, 0)),
            "linked_project_count": linked.get(c.id, 0),
        }
        for c in merged
    ]


class BuildingDictReadService:
    """字典读服务（pending 叠加单点）."""

    def get_kpi(self, db: Session) -> BdKpiResponse:
        """字典 KPI hero（FR-01：小区/楼栋/户室/已关联项目 + 待审核数）."""
        from models import BdRoom

        community_count = db.query(func.count(Community.id)).filter(Community.is_active.is_(True)).scalar() or 0
        building_count = db.query(func.count(BdBuilding.id)).scalar() or 0
        room_count = db.query(func.count(BdRoom.id)).scalar() or 0
        linked = (
            db.query(func.count(Project.id))
            .filter(
                Project.community_id.isnot(None),
                Project.dict_status.in_(("linked", "pending")),
                Project.is_deleted.is_(False),
            )
            .scalar()
            or 0
        )
        pending_count = (
            db.query(func.count(BdPendingEntry.id)).filter(BdPendingEntry.status == BdEntryStatus.PENDING).scalar() or 0
        )
        return BdKpiResponse(
            community_count=int(community_count),
            building_count=int(building_count),
            room_count=int(room_count),
            linked_project_count=int(linked),
            pending_count=int(pending_count),
        )

    def query_communities(
        self,
        db: Session,
        *,
        keyword: str | None = None,
        district: str | None = None,
        business_circle: str | None = None,
        ring: str | None = None,
        property_type: str | None = None,
        era_from: int | None = None,
        era_to: int | None = None,
        has_project_link: bool | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> BdCommunityListResponse:
        """字典总览（FR-01：筛选 + 关键词 名/地址/别名 + 首图缩略列）."""
        query = db.query(Community).filter(Community.is_active.is_(True))

        if keyword:
            kw = f"%{escape_like(keyword)}%"
            alias_community_ids = (
                db.query(CommunityAlias.community_id)
                .filter(CommunityAlias.alias_name.like(kw, escape="\\"), CommunityAlias.is_deleted.is_(False))
                .subquery()
            )
            query = query.filter(
                Community.name.like(kw, escape="\\")
                | Community.address.like(kw, escape="\\")
                | Community.id.in_(alias_community_ids)
            )
        if district:
            query = query.filter(Community.district == district)
        if business_circle:
            query = query.filter(Community.business_circle == business_circle)
        if ring:
            query = query.filter(Community.ring == ring)
        if property_type:
            # text[] 包含查询（PG ARRAY @>）
            query = query.filter(Community.property_types.any(property_type))
        if era_from is not None:
            query = query.filter((Community.era_to.is_(None)) | (Community.era_to >= era_from))
        if era_to is not None:
            query = query.filter((Community.era_from.is_(None)) | (Community.era_from <= era_to))

        # 已关联项目筛选（has_project_link）：SQL 半连接在分页前过滤（M2 修复：
        # 原实现在分页后内存过滤，total = len(当前页)，跨页翻页与计数均失真）。
        # 口径与 KPI linked_project_count 一致：community_id 非空 + dict_status ∈ (linked,pending)
        if has_project_link is True or has_project_link is False:
            linked_subq = (
                db.query(Project.community_id)
                .filter(
                    Project.community_id.isnot(None),
                    Project.dict_status.in_(("linked", "pending")),
                    Project.is_deleted.is_(False),
                )
                .subquery()
            )
            query = query.filter(Community.id.in_(linked_subq) if has_project_link else ~Community.id.in_(linked_subq))

        total = query.count()
        community_rows = query.order_by(Community.name).offset((page - 1) * page_size).limit(page_size).all()
        community_ids = [c.id for c in community_rows]
        linked_counts = _community_linked_project_counts(db, community_ids)

        first_images = _community_first_image(db, [c.id for c in community_rows])
        building_counts = (
            dict(
                db.query(BdBuilding.community_id, func.count(BdBuilding.id))
                .filter(BdBuilding.community_id.in_(community_ids))
                .group_by(BdBuilding.community_id)
                .all()
            )
            if community_ids
            else {}
        )
        room_counts = (
            dict(
                db.query(BdBuilding.community_id, func.coalesce(func.sum(BdBuilding.room_count), 0))
                .filter(BdBuilding.community_id.in_(community_ids))
                .group_by(BdBuilding.community_id)
                .all()
            )
            if community_ids
            else {}
        )

        items = [
            BdCommunityListItem(
                id=c.id,
                name=c.name,
                district=c.district,
                business_circle=c.business_circle,
                ring=c.ring,
                property_types=list(c.property_types or []),
                era_from=c.era_from,
                era_to=c.era_to,
                address=c.address,
                building_count=int(building_counts.get(c.id, 0)),
                room_count=int(room_counts.get(c.id, 0)),
                linked_project_count=linked_counts.get(c.id, 0),
                first_image_url=first_images.get(c.id),
                merged_into_id=c.merged_into_id,
            )
            for c in community_rows
        ]
        return BdCommunityListResponse(total=total, items=items)

    def get_community_detail(self, db: Session, community_id: str) -> BdCommunityDetailResponse | None:
        """小区详情画像（FR-02 上半部）."""
        community = db.query(Community).filter(Community.id == community_id).first()
        if not community:
            return None
        building_count = (
            db.query(func.count(BdBuilding.id)).filter(BdBuilding.community_id == community_id).scalar() or 0
        )
        room_count = (
            db.query(func.coalesce(func.sum(BdBuilding.room_count), 0))
            .filter(BdBuilding.community_id == community_id)
            .scalar()
            or 0
        )
        linked_counts = _community_linked_project_counts(db, [community_id])
        first_images = _community_first_image(db, [community_id])
        return BdCommunityDetailResponse(
            id=community.id,
            name=community.name,
            district=community.district,
            business_circle=community.business_circle,
            ring=community.ring,
            property_types=list(community.property_types or []),
            era_from=community.era_from,
            era_to=community.era_to,
            developer=community.developer,
            property_mgmt=community.property_mgmt,
            address=community.address,
            lng=community.lng,
            lat=community.lat,
            building_count=int(building_count),
            room_count=int(room_count),
            linked_project_count=linked_counts.get(community_id, 0),
            first_image_url=first_images.get(community_id),
            merged_into_id=community.merged_into_id,
            merged_children=_community_merged_children(db, community_id),
        )

    def list_buildings(
        self,
        db: Session,
        community_id: str,
        *,
        keyword: str | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> BdBuildingListResponse:
        """楼栋列表（FR-03：搜索 + 自然序 + pending 楼栋叠加）.

        pending 楼栋叠加：bd_pending_entries(kind=building, status=pending,
        community_id=本小区) 以虚线行并入列表（BR-23），按楼栋号自然序混排。
        """
        query = db.query(BdBuilding).filter(BdBuilding.community_id == community_id)
        if keyword:
            query = query.filter(BdBuilding.building_no.like(f"%{escape_like(keyword)}%", escape="\\"))
        total = query.count()
        buildings = query.order_by(BdBuilding.id).offset((page - 1) * page_size).limit(page_size).all()

        # pending 楼栋叠加（R10 单点：pending join 只出现在本服务）
        pending_entries = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == "building",
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.community_id == community_id,
            )
            .all()
        )

        # 自然序合并：正式楼栋 + pending 楼栋按名称数字自然排序
        def _natural_key(no: str) -> tuple:
            import re

            return tuple(int(t) if t.isdigit() else t for t in re.split(r"(\d+)", no))

        # 已关联项目计数（projects.building_id + dict_status，与小区级口径一致）
        building_ids = [b.id for b in buildings]
        linked_by_building: dict[int, int] = (
            dict(
                db.query(Project.building_id, func.count(Project.id))
                .filter(
                    Project.building_id.in_(building_ids),
                    Project.dict_status.in_(("linked", "pending")),
                    Project.is_deleted.is_(False),
                )
                .group_by(Project.building_id)
                .all()
            )
            if building_ids
            else {}
        )

        pending_items: dict[str, BdPendingEntry] = {e.name: e for e in pending_entries}
        # 同名 pending 与实表并存时（罕见），实表优先
        existing_nos = {b.building_no for b in buildings}
        merged: list[BdBuildingListItem] = [
            BdBuildingListItem(
                id=b.id,
                community_id=b.community_id,
                building_no=b.building_no,
                lng=b.lng,
                lat=b.lat,
                room_count=b.room_count,
                floor_count=len({r.floor for r in b.rooms if r.floor is not None}) if b.rooms else 0,
                linked_project_count=int(linked_by_building.get(b.id, 0)),
                pending=False,
                pending_id=None,
            )
            for b in buildings
        ]
        for no, e in pending_items.items():
            if no in existing_nos:
                continue
            merged.append(
                BdBuildingListItem(
                    id=0,
                    community_id=community_id,
                    building_no=no,
                    lng=None,
                    lat=None,
                    room_count=0,
                    floor_count=0,
                    linked_project_count=0,
                    pending=True,
                    pending_id=e.id,
                )
            )
        merged.sort(key=lambda x: _natural_key(x.building_no))
        return BdBuildingListResponse(total=total, items=merged)

    def get_building_detail(
        self,
        db: Session,
        building_id: int,
        *,
        source_biz_type: str | None = None,
        source_biz_id: str | None = None,
    ) -> BdBuildingDetail | None:
        """楼栋详情：户室网格 + pending 叠加（FR-04/05，R10 单点）.

        pending 户室叠加（BR-23）：bd_pending_entries(kind=room, status=pending)
        挂本楼栋（parent_kind=building, parent_id=楼栋id）或挂待审父楼栋条目。
        仅来源单据（source_biz_* 命中引用记录）的调用方可将 pending 置为可选；
        其他调用方拿到 pending 标记自行置灰（hover「审核中，通过后可选」）。

        Args:
            db: 数据库会话
            building_id: 楼栋 ID
            source_biz_type: 调用方单据类型（可选，project/lead/marketing/property）
            source_biz_id: 调用方单据 ID（可选）

        Returns:
            楼栋详情（含户室 pending 标记）；楼栋不存在返回 None

        """
        building = db.get(BdBuilding, building_id)
        if not building:
            return None

        # 找挂本楼栋的 pending 户室 + 挂「待审父楼栋」的 pending 户室
        pending_rooms: list[BdPendingEntry] = []
        # 本楼栋为实表：kind=room 且 parent_kind=building 且 parent_id=楼栋id
        pending_rooms = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == "room",
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.parent_kind == "building",
                BdPendingEntry.parent_id == building_id,
            )
            .all()
        )

        # 来源单据可回显判定：命中该 pending 的 open 引用记录
        selectable_pending_ids: set[int] = set()
        if source_biz_type and source_biz_id:
            from models import BdPendingReference

            refs = (
                db.query(BdPendingReference)
                .filter(
                    BdPendingReference.biz_type == source_biz_type,
                    BdPendingReference.biz_id == source_biz_id,
                    BdPendingReference.status == "open",
                    BdPendingReference.pending_id.in_([e.id for e in pending_rooms]),
                )
                .all()
            )
            selectable_pending_ids = {r.pending_id for r in refs}
            logger.debug(
                "来源单据 %s/%s 可回显 pending 户室: %s", source_biz_type, source_biz_id, selectable_pending_ids
            )

        room_items = [
            BdRoomItem(
                id=r.id,
                room_no=r.room_no,
                floor=r.floor,
                pending=False,
                pending_id=None,
                plate_no=format_plate_no(r.room_no),
            )
            for r in building.rooms
        ]
        # pending 户室并入（id=0 表示字典无行）；楼层从户室号解析（0403→4），
        # 与 get_floor_groups 口径一致：未建层直接建户室时楼层即时可见
        room_items.extend(
            BdRoomItem(
                id=0,
                room_no=e.name,
                floor=parse_room_floor(e.name),
                pending=True,
                pending_id=e.id,
                plate_no=format_plate_no(e.name),
            )
            for e in pending_rooms
        )
        # 排序：楼层升序、未分层置底；同层按户室号
        room_items.sort(key=lambda r: (r.floor is None, r.floor or 0, r.room_no))

        return BdBuildingDetail(
            id=building.id,
            community_id=building.community_id,
            building_no=building.building_no,
            lng=building.lng,
            lat=building.lat,
            room_count=building.room_count,
            linked_project_count=0,
            pending=False,
            pending_id=None,
            rooms=room_items,
        )

    def get_floor_groups(self, db: Session, building_id: int) -> list[BdFloorGroup]:
        """楼层分组（FR-04：名义 ∪ 实际 ∪ pending，未分层置底）.

        - 实际户室楼层：bd_rooms.floor 非空集合；
        - pending 户室楼层：room_no 前两位可解析的 pending 条目并入；
        - 未分层（floor NULL，含非标户室号）置底。
        """
        from models import BdRoom

        actual = (
            db.query(BdRoom.floor, func.count(BdRoom.id))
            .filter(BdRoom.building_id == building_id)
            .group_by(BdRoom.floor)
            .all()
        )
        groups: dict[int | None, BdFloorGroup] = {}
        for floor, cnt in actual:
            groups[floor] = BdFloorGroup(floor=floor, room_count=int(cnt), has_pending=False)

        # pending 户室楼层并入（R10 单点）
        pending_rooms = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == "room",
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.parent_kind == "building",
                BdPendingEntry.parent_id == building_id,
            )
            .all()
        )
        for e in pending_rooms:
            floor = parse_room_floor(e.name)
            g = groups.get(floor)
            if g:
                g.room_count += 1
                g.has_pending = True
            else:
                groups[floor] = BdFloorGroup(floor=floor, room_count=1, has_pending=True)

        # 未分层置底，其余楼层升序
        result = sorted(
            (g for g in groups.values() if g.floor is not None),
            key=lambda g: g.floor or 0,
        )
        if None in groups:
            result.append(groups[None])
        return result
