"""楼盘字典相关 Schema（SRS §9 端点规格）.

覆盖：导入任务、字典总览/详情、楼栋/户室、admin 补录、审核池、pending、存量绑定。
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

# ==================== 导入（FR-08） ====================


class BdImportTaskResponse(BaseModel):
    """字典导入任务响应."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    status: str
    filename: str
    file_size: int | None = None
    total_communities: int
    total_buildings: int
    total_rooms: int
    warnings_count: int
    processed_communities: int
    progress_percent: float
    communities_loaded: int
    buildings_loaded: int
    rooms_loaded: int
    failed_file_url: str | None = None
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    processing_duration: float | None = None


class BdImportTaskListResponse(BaseModel):
    """字典导入任务历史响应."""

    total: int
    items: list[BdImportTaskResponse]


class BdImportTaskCreateResponse(BaseModel):
    """创建导入任务响应."""

    task_id: str
    status: str
    message: str


# ==================== 总览（FR-01 / R3） ====================


class BdCommunityListItem(BaseModel):
    """字典总览小区行."""

    id: str
    name: str
    district: str | None = None
    business_circle: str | None = None
    ring: str | None = None
    property_types: list[str] = Field(default_factory=list)
    era_from: int | None = None
    era_to: int | None = None
    address: str | None = None
    building_count: int = 0
    room_count: int = 0
    linked_project_count: int = 0
    first_image_url: str | None = None
    merged_into_id: str | None = None


class BdCommunityListResponse(BaseModel):
    """字典总览响应."""

    total: int
    items: list[BdCommunityListItem]


class BdKpiResponse(BaseModel):
    """字典 KPI hero."""

    community_count: int
    building_count: int
    room_count: int
    linked_project_count: int
    pending_count: int


class BdRoomItem(BaseModel):
    """户室项."""

    id: int
    room_no: str
    floor: int | None = None
    # pending 叠加（R10）：非 NULL 时表示待审条目（id 为 pending 条目 id，真实 room_id 为空）
    pending: bool = False
    pending_id: int | None = None
    # 门牌自动映射（0401 → 401）；非标户室原样
    plate_no: str


class BdBuildingDetail(BaseModel):
    """楼栋详情（含楼层分组，R3/FR-04）."""

    id: int
    community_id: str
    building_no: str
    lng: float | None = None
    lat: float | None = None
    room_count: int = 0
    linked_project_count: int = 0
    # pending 叠加：本楼栋自身待审（楼栋级 pending）
    pending: bool = False
    pending_id: int | None = None
    rooms: list[BdRoomItem] = Field(default_factory=list)


class BdBuildingListItem(BaseModel):
    """楼栋列表行（FR-03）."""

    id: int
    community_id: str
    building_no: str
    lng: float | None = None
    lat: float | None = None
    room_count: int = 0
    floor_count: int = 0
    linked_project_count: int = 0
    pending: bool = False
    pending_id: int | None = None


class BdBuildingListResponse(BaseModel):
    """楼栋列表响应."""

    total: int
    items: list[BdBuildingListItem]


class BdFloorGroup(BaseModel):
    """楼层分组（呈现层，FR-04：名义 ∪ 实际 ∪ pending，未分层置底）."""

    floor: int | None = None  # NULL = 未分层
    room_count: int = 0
    has_pending: bool = False


class BdMergedChildItem(BaseModel):
    """已并入主档的被并小区行（FR-14 v2.0 抽屉合并信息区块：呈现 + 单条解除合并）."""

    id: str
    name: str
    address: str | None = None
    district: str | None = None
    building_count: int = 0
    room_count: int = 0
    linked_project_count: int = 0


class BdCommunityDetailResponse(BaseModel):
    """小区详情抽屉（FR-02）."""

    id: str
    name: str
    district: str | None = None
    business_circle: str | None = None
    ring: str | None = None
    property_types: list[str] = Field(default_factory=list)
    era_from: int | None = None
    era_to: int | None = None
    developer: str | None = None
    property_mgmt: str | None = None
    address: str | None = None
    lng: float | None = None
    lat: float | None = None
    building_count: int = 0
    room_count: int = 0
    linked_project_count: int = 0
    first_image_url: str | None = None
    merged_into_id: str | None = None
    # 主档视角：已并入本小区的被并小区（软归档）列表，v2.0 合并信息区块
    merged_children: list[BdMergedChildItem] = Field(default_factory=list)


class BdCommunityPatchRequest(BaseModel):
    """修正画像请求（PATCH 语义，admin）."""

    ring: str | None = Field(None, max_length=50, description="环线")
    property_types: list[str] | None = Field(None, description="物业类型列表")
    era_from: int | None = Field(None, ge=1900, le=2100, description="建成年代起")
    era_to: int | None = Field(None, ge=1900, le=2100, description="建成年代止")
    developer: str | None = Field(None, max_length=200, description="开发商")
    property_mgmt: str | None = Field(None, max_length=200, description="物业公司")
    address: str | None = Field(None, max_length=300, description="地址")
    lng: float | None = Field(None, description="经度(BD-09)")
    lat: float | None = Field(None, description="纬度(BD-09)")


# ==================== admin 补录（FR-06/07 / R4） ====================


class BdBuildingCreateRequest(BaseModel):
    """新增楼栋请求（支持区间语法 `29-55`，≤60 栋）."""

    community_id: str = Field(description="小区ID")
    building_no: str = Field(min_length=1, max_length=100, description="楼栋号（单值如 `122乙` 或区间如 `29-55`）")


class BdRoomCreateRequest(BaseModel):
    """新增户室请求（楼层区间×户号区间笛卡尔展开，≤200 户）."""

    building_id: int = Field(description="楼栋ID")
    floor: str = Field(min_length=1, max_length=20, description="楼层（单值如 `4` 或区间如 `7-12`）")
    room_suffix: str = Field(min_length=1, max_length=20, description="户号尾号（单值如 `03` 或区间如 `01-08`）")


class BdBatchCreateResult(BaseModel):
    """批量补录结果（FR-06：uq 跳过返回 added/skipped）."""

    added: int
    skipped: int


class BdDeleteResult(BaseModel):
    """删除结果（admin：楼栋删除 deleted=1；楼层/批量删除 deleted=户室数）."""

    deleted: int


class BdCommunityCreateRequest(BaseModel):
    """admin 新增小区请求（FR-07：名/区/板块必填，重名拦截）."""

    name: str = Field(min_length=1, max_length=200, description="小区名")
    district: str = Field(min_length=1, max_length=100, description="行政区(必填)")
    business_circle: str = Field(min_length=1, max_length=100, description="板块(必填)")
    ring: str | None = Field(None, max_length=50, description="环线(可空)")
    address: str | None = Field(None, max_length=300, description="地址(可空)")
    lng: float | None = Field(None, description="经度(BD-09，可空)")
    lat: float | None = Field(None, description="纬度(BD-09，可空)")


# ==================== 审核池（FR-11 / R7） ====================


class BdReviewListItem(BaseModel):
    """审核池条目行."""

    id: int
    kind: str
    name: str
    community_id: str | None = None
    community_name: str | None = None
    parent_kind: str | None = None
    parent_id: int | None = None
    payload: dict | None = None
    source_type: str | None = None
    source_id: str | None = None
    submitted_by: str | None = None
    submitter_name: str | None = None
    status: str
    created_at: datetime
    reference_count: int = 0


class BdReviewListResponse(BaseModel):
    """审核池列表响应."""

    total: int
    items: list[BdReviewListItem]
    kpi: "BdReviewKpi"


class BdReviewKpi(BaseModel):
    """审核池 KPI（FR-11）."""

    pending: int = 0
    processed: int = 0
    merged_total: int = 0
    rejected_total: int = 0


class BdReviewResolveRequest(BaseModel):
    """审核 resolve 请求（三选一动作）.

    create：通过新增；merge：合并现有（target_id 必填）；reject：驳回
    （录入端来源必须带 target_id 当场改选，机器链路/C 端免）。
    """

    action: str = Field(pattern="^(create|merge|reject)$", description="审核动作")
    target_id: str | None = Field(None, description="目标ID(merge 必填；reject 录入端来源必填)")


class BdReviewResolveResponse(BaseModel):
    """审核 resolve 响应."""

    success: bool
    message: str
    backfill_enqueued: int = 0


# ==================== pending 提交（FR-10 / Task 11） ====================


class BdPendingSubmitRequest(BaseModel):
    """录入端新增提交载荷（FR-13/FR-18）.

    业务单据创建时携带：new_community（小区快照）或
    parent 目标 + new_building/new_room（楼栋/户室）。
    """

    kind: str = Field(pattern="^(community|building|room)$", description="提交类型")
    name: str = Field(min_length=1, max_length=200, description="提交内容名称(小区名/楼栋号/户室号)")
    # community 快照（kind=community 时提供）
    community_payload: dict | None = Field(None, description="小区表单快照 {district,business_circle,...}")
    # building/room 父级（字典实表 id 或父级 pending 条目 id，前缀区分）
    parent_kind: str | None = Field(None, pattern="^(community|building|pending_community|pending_building)$")
    parent_id: str | None = Field(None, description="父级ID")
    # 引用来源（创建来源单据）
    source_type: str | None = Field(None, pattern="^(project|lead|marketing|property|admin)$")
    source_id: str | None = Field(None, max_length=64)


class BdPendingSubmitResponse(BaseModel):
    """录入端提交响应（幂等复用时 created=false）."""

    pending_id: int
    created: bool = True
    reused: bool = False


# ==================== 存量绑定（FR-12 / R9） ====================


class DictionaryLinkRequest(BaseModel):
    """存量绑定请求（项目/线索/营销/房源四类统一）."""

    community_id: str = Field(description="字典小区ID")
    building_id: int | None = Field(None, description="字典楼栋ID(房源类不支持)")
    room_id: int | None = Field(None, description="字典户室ID(房源类不支持)")


class DictionaryLinkResponse(BaseModel):
    """存量绑定响应."""

    success: bool
    dict_status: str
    message: str


# ==================== 审核处理人角色（FR-15 / R8） ====================


class BdReviewerRolesResponse(BaseModel):
    """审核处理人角色配置响应."""

    roles: list[str]


class BdReviewerRolesRequest(BaseModel):
    """审核处理人角色配置保存请求（全量替换）."""

    roles: list[str] = Field(min_length=1)
