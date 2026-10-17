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

from models import (
    BdBuilding,
    BdEntryStatus,
    BdPendingEntry,
    BdPendingReference,
    BdReferenceStatus,
    BdRoom,
    Community,
    CommunityAlias,
    CommunityImage,
    Project,
)
from schemas.building_dict import (
    BdBuildingDetail,
    BdBuildingListItem,
    BdBuildingListResponse,
    BdCommunityDetailResponse,
    BdCommunityListItem,
    BdCommunityListResponse,
    BdFilterOption,
    BdFilterOptionsResponse,
    BdFloorGroup,
    BdKpiResponse,
    BdRoomItem,
)
from services.property.doc_dict_resolver import DocDictKey, DocDictNames
from utils.building_dict import format_plate_no, parse_room_floor
from utils.formatters import escape_like

logger = logging.getLogger(__name__)

# P3：楼栋详情户室分页口径（默认 200/页，上限 500）。
# 实测库内最大楼栋 928 户、>500 户的楼栋 26 个、>300 户的 163 个；默认 200 覆盖
# 绝大多数楼栋一页返回，超大楼栋由前端「加载更多」翻页。
DEFAULT_ROOM_PAGE_SIZE = 200
MAX_ROOM_PAGE_SIZE = 500


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

    def resolve_doc_names(self, db: Session, keys: list[DocDictKey]) -> dict[str, DocDictNames]:
        """按业务单据批量解析字典地址名称（surface-dict-binding-info 单点）.

        三模块（项目/线索/营销）详情与列表响应的 ``building_no/room_no/floor``
        解析收敛于此：

        - 已绑定单据：批量查 ``bd_buildings/bd_rooms`` 实表（两次 IN 查询，无 N+1）；
        - pending 且 ID 为空的单据：join ``bd_pending_references(open)`` →
          ``bd_pending_entries(pending)`` 取待审楼栋/户室名（复用 pending 的单据
          只落引用账本，entry.source_id 仅首提者，故必须经引用账本关联）；
        - 未绑定 / manual / rejected：返回空名称（None），前端维持现有展示。

        pending 户室楼层从户室号即时解析（与 R10 楼层呈现口径一致）。

        Args:
            db: 数据库会话
            keys: 单据字典关联键列表（doc_id 需唯一）

        Returns:
            ``{doc_id: DocDictNames}``；未出现在结果中的 doc_id 视为全 None

        """
        if not keys:
            return {}
        result: dict[str, DocDictNames] = {k.doc_id: DocDictNames() for k in keys}

        # 1. 已绑定楼栋批量解析
        building_ids = {k.building_id for k in keys if k.building_id is not None}
        building_nos: dict[int, str] = {}
        if building_ids:
            rows = db.query(BdBuilding.id, BdBuilding.building_no).filter(BdBuilding.id.in_(building_ids)).all()
            building_nos = dict(rows)

        # 2. 已绑定户室批量解析（floor 由 room_no 解析，无需额外列）
        room_ids = {k.room_id for k in keys if k.room_id is not None}
        room_infos: dict[int, tuple[str, int | None]] = {}
        if room_ids:
            rows = db.query(BdRoom.id, BdRoom.room_no, BdRoom.floor).filter(BdRoom.id.in_(room_ids)).all()
            room_infos = {rid: (no, fl) for rid, no, fl in rows}

        for k in keys:
            building_no = building_nos.get(k.building_id) if k.building_id is not None else None
            room_no: str | None = None
            floor: int | None = None
            if k.room_id is not None and k.room_id in room_infos:
                room_no, floor = room_infos[k.room_id]
            if building_no is not None or room_no is not None:
                result[k.doc_id] = DocDictNames(building_no=building_no, room_no=room_no, floor=floor)

        # 3. pending 单据待审名称叠加：仅处理解析结果为空且 dict_status=pending 的单据
        pending_keys = [
            k for k in keys if k.dict_status == "pending" and result[k.doc_id] == DocDictNames() and k.source_type
        ]
        if pending_keys:
            # open 引用按 (biz_type, biz_id) 分组取 pending_id：field 区分楼栋/户室
            ref_rows = (
                db.query(
                    BdPendingReference.biz_id,
                    BdPendingReference.field,
                    BdPendingEntry.name,
                )
                .join(BdPendingEntry, BdPendingEntry.id == BdPendingReference.pending_id)
                .filter(
                    BdPendingReference.biz_type.in_({k.source_type for k in pending_keys if k.source_type}),
                    BdPendingReference.biz_id.in_([k.doc_id for k in pending_keys]),
                    BdPendingReference.status == BdReferenceStatus.OPEN,
                    BdPendingEntry.status == BdEntryStatus.PENDING,
                    BdPendingReference.field.in_(("building_id", "room_id")),
                )
                .all()
            )
            pending_names: dict[tuple[str, str], dict[str, str]] = {}
            for biz_id, field, name in ref_rows:
                pending_names.setdefault(biz_id, {})[field] = name
            for k in pending_keys:
                names = pending_names.get(k.doc_id)
                if not names:
                    continue
                building_no = names.get("building_id")
                room_no = names.get("room_id")
                result[k.doc_id] = DocDictNames(
                    building_no=building_no,
                    room_no=room_no,
                    floor=parse_room_floor(room_no) if room_no else None,
                )
        return result

    def get_filter_options(self, db: Session, *, district: str | None = None) -> BdFilterOptionsResponse:
        """总览筛选下拉选项（M3：区域/板块从库里 distinct 值拉取）.

        原前端硬编码 16 个无「区」后缀名称，而库内主流值带后缀（浦东区 1421 条），
        选「黄浦」只能命中 6 条、选「黄浦区」命中 19 条 —— 同一行政区被拆成两个值域。
        选项改为后端聚合（只统计 is_active）并带计数，前端不再维护硬编码常量；
        板块按已选区县联动，避免一次下发 205 个选项。

        Args:
            db: 数据库会话
            district: 限定板块所属区县（可空：返回全量板块）

        """
        districts = (
            db.query(Community.district, func.count(Community.id))
            .filter(
                Community.is_active.is_(True),
                Community.district.isnot(None),
                Community.district != "",
            )
            .group_by(Community.district)
            .order_by(func.count(Community.id).desc())
            .all()
        )
        circles_query = db.query(Community.business_circle, func.count(Community.id)).filter(
            Community.is_active.is_(True),
            Community.business_circle.isnot(None),
            Community.business_circle != "",
        )
        if district:
            circles_query = circles_query.filter(Community.district == district)
        circles = circles_query.group_by(Community.business_circle).order_by(func.count(Community.id).desc()).all()
        return BdFilterOptionsResponse(
            districts=[BdFilterOption(value=v, count=int(c)) for v, c in districts],
            business_circles=[BdFilterOption(value=v, count=int(c)) for v, c in circles],
        )

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
        """小区详情画像（FR-02 上半部）.

        S2 修复：只返回未归档小区（``is_active=True``）。合并后的子档是软归档行，
        总览页按 ``is_active`` 过滤本就不可见；原实现只按 id 查，导致运营可通过
        历史链接打开一个「在总览里永远搜不到」的小区，误判为数据丢失。

        Returns:
            小区详情；小区不存在或已归档（已并入主档）时返回 None

        """
        community = db.query(Community).filter(Community.id == community_id, Community.is_active.is_(True)).first()
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

        M1 修复（分页/搜索口径）：
        - pending 查询拼 ``keyword``（原实现无视关键词，搜「nothingmatch」仍返回待审楼栋，
          导致「找不到可新建」引导语永不出现，用户重复提交同名 pending）；
        - pending 行仅在 ``page == 1`` 叠加：它不计入 ``total``（真实楼栋计数），
          若每页都叠就会跨页重复渲染同一楼栋。运营看待审数据的入口是审核池，
          列表页只做「第 1 页顶部提醒」。
        """
        query = db.query(BdBuilding).filter(BdBuilding.community_id == community_id)
        if keyword:
            query = query.filter(BdBuilding.building_no.like(f"%{escape_like(keyword)}%", escape="\\"))
        total = query.count()
        buildings = query.order_by(BdBuilding.id).offset((page - 1) * page_size).limit(page_size).all()

        # pending 楼栋叠加（R10 单点：pending join 只出现在本服务）
        pending_entries: list[BdPendingEntry] = []
        if page == 1:
            pending_query = db.query(BdPendingEntry).filter(
                BdPendingEntry.kind == "building",
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.community_id == community_id,
            )
            if keyword:
                pending_query = pending_query.filter(BdPendingEntry.name.like(f"%{escape_like(keyword)}%", escape="\\"))
            pending_entries = pending_query.all()

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
        # P3：楼层数改为聚合查询（原实现遍历 b.rooms —— 依赖 lazy="selectin" 把每栋
        # 楼栋的全部户室读进内存，只为算一个「有几种楼层」）
        floor_counts: dict[int, int] = (
            dict(
                db.query(BdRoom.building_id, func.count(func.distinct(BdRoom.floor)))
                .filter(BdRoom.building_id.in_(building_ids), BdRoom.floor.isnot(None))
                .group_by(BdRoom.building_id)
                .all()
            )
            if building_ids
            else {}
        )
        merged: list[BdBuildingListItem] = [
            BdBuildingListItem(
                id=b.id,
                community_id=b.community_id,
                building_no=b.building_no,
                lng=b.lng,
                lat=b.lat,
                room_count=b.room_count,
                floor_count=int(floor_counts.get(b.id, 0)),
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
        room_page: int = 1,
        room_page_size: int = DEFAULT_ROOM_PAGE_SIZE,
    ) -> BdBuildingDetail | None:
        """楼栋详情：户室网格（分页）+ pending 叠加（FR-04/05，R10 单点）.

        pending 户室叠加（BR-23）：bd_pending_entries(kind=room, status=pending)
        挂本楼栋（parent_kind=building, parent_id=楼栋id）或挂待审父楼栋条目。
        仅来源单据（source_biz_* 命中引用记录）的调用方可将 pending 置为可选；
        其他调用方拿到 pending 标记自行置灰（hover「审核中，通过后可选」）。

        P3 修复（无上限）：原实现由 ``building.rooms``（``lazy="selectin"``）全量
        构造户室列表 —— 实测最大楼栋 928 户、响应体 87.9KB，接口无 ``page_size``
        上限，前端户室网格也是一次全渲染。现在实表户室按 ``room_page``/
        ``room_page_size`` 分页（默认 200、上限 500），pending 户室不分页（量级
        个位数且必须全量呈现「审核中」标记）。``room_total`` 为实表总数。

        Args:
            db: 数据库会话
            building_id: 楼栋 ID
            source_biz_type: 调用方单据类型（可选，project/lead/marketing/property）
            source_biz_id: 调用方单据 ID（可选）
            room_page: 户室页码（≥1）
            room_page_size: 每页户室数（1~MAX_ROOM_PAGE_SIZE）

        Returns:
            楼栋详情（含户室 pending 标记与分页元信息）；楼栋不存在返回 None

        """
        building = db.get(BdBuilding, building_id)
        if not building:
            return None

        page = max(1, room_page)
        page_size = min(max(1, room_page_size), MAX_ROOM_PAGE_SIZE)

        # 找挂本楼栋的 pending 户室 + 挂「待审父楼栋」的 pending 户室
        pending_rooms: list[BdPendingEntry] = []
        # 本楼栋为实表：kind=room 且 parent_kind=building 且 parent_id=楼栋id
        # （parent_is_pending=false：H2 后待审父级的户室 parent_id 指向 pending 条目 id，
        #   与实表楼栋 id 可能数值相等，必须显式排除）
        pending_rooms = (
            db.query(BdPendingEntry)
            .filter(
                BdPendingEntry.kind == "room",
                BdPendingEntry.status == BdEntryStatus.PENDING,
                BdPendingEntry.parent_kind == "building",
                BdPendingEntry.parent_is_pending.is_(False),
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

        # P3：实表户室分页（楼层升序、未分层置底、同层按户室号；SQL 侧排序避免
        # 一次加载整栋户室后再在内存排序）
        room_total = db.query(func.count(BdRoom.id)).filter(BdRoom.building_id == building_id).scalar() or 0
        page_rooms = (
            db.query(BdRoom)
            .filter(BdRoom.building_id == building_id)
            .order_by(BdRoom.floor.is_(None), BdRoom.floor.asc(), BdRoom.room_no.asc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
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
            for r in page_rooms
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
        # 排序：楼层升序、未分层置底；同层按户室号（pending 并入后重新排序）
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
            room_total=int(room_total),
            room_page=page,
            room_page_size=page_size,
            room_has_more=page * page_size < int(room_total),
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
                BdPendingEntry.parent_is_pending.is_(False),
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
