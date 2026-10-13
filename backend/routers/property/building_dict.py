"""楼盘字典管理路由（SRS §9 / R2-R7）.

路由前缀 ``/admin/building-dictionary``。权限矩阵（SRS §3）：
- 读（总览/详情/搜索）：项目读权限（PropertyReadPermDep 同口径）
- 画像修正/补录/新增小区/导入：admin（CurrentAdminUserDep）
- 审核池处理：building_dict_reviewer_roles 配置（缺省 admin）
- 存量绑定：对应单据可编辑者（在各自模块路由中实现）
"""

import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi import Path as PathParam
from fastapi.responses import FileResponse

from dependencies.auth import CurrentAdminUserDep, DbSessionDep, PropertyReadPermDep
from dependencies.common import PaginationDep
from schemas.building_dict import (
    BdBatchCreateResult,
    BdBuildingCreateRequest,
    BdBuildingDetail,
    BdBuildingListResponse,
    BdCommunityCreateRequest,
    BdCommunityDetailResponse,
    BdCommunityListResponse,
    BdCommunityPatchRequest,
    BdDeleteResult,
    BdFloorGroup,
    BdImportTaskCreateResponse,
    BdImportTaskListResponse,
    BdImportTaskResponse,
    BdKpiResponse,
    BdPendingSubmitRequest,
    BdPendingSubmitResponse,
    BdReviewerRolesRequest,
    BdReviewerRolesResponse,
    BdReviewListResponse,
    BdReviewResolveRequest,
    BdReviewResolveResponse,
    BdRoomCreateRequest,
)
from services.property.building_review_service import (
    get_building_review_service,
    get_reviewer_roles,
    set_reviewer_roles,
)
from services.property.dict_read_service import BuildingDictReadService
from services.property.dict_submit_service import get_dict_submit_service
from services.property.dict_write_service import get_dict_write_service
from services.system.exceptions import FileProcessingError, ResourceNotFoundError
from settings import settings
from utils.common import RateLimits, limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/building-dictionary", tags=["building-dictionary"])

ReadServiceDep = Annotated[BuildingDictReadService, Depends(BuildingDictReadService)]


# ==================== 导入（FR-08 / Task 3.1） ====================


@router.post("/import", status_code=201)
@limiter.limit(RateLimits.CSV_IMPORT)
async def create_dict_import_task(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    file: Annotated[UploadFile, File(description="zip 包或 txt 文件(≤2GB，GBK/UTF-8 自动识别)")],
) -> BdImportTaskCreateResponse:
    """上传 zip/txt 创建字典导入任务（异步装载，四步：上传→解析→装载→对账）.

    权限：admin。速率限制：复用 CSV_IMPORT（30次/小时）。
    """
    from services.property.dict_import_service import get_bd_import_task_service

    service = get_bd_import_task_service()
    task = await service.create_task(file, current_user.id, db)
    try:
        service.start_task(task.id)
    except Exception:
        logger.exception("启动字典导入任务失败: %s", task.id)
        service.update_task_status(task.id, "failed", db, error_message="启动后台处理任务失败")
        msg = "导入任务启动失败，请稍后重试"
        raise FileProcessingError(msg) from None
    return BdImportTaskCreateResponse(task_id=task.id, status=task.status, message="导入任务已创建并启动")


@router.get("/import/tasks")
def list_dict_import_tasks(
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
    pagination: PaginationDep,
) -> BdImportTaskListResponse:
    """导入任务历史（状态/进度/对账/失败明细）."""
    from services.property.dict_import_service import get_bd_import_task_service

    service = get_bd_import_task_service()
    total, tasks = service.list_tasks(db, page=pagination.page, page_size=pagination.page_size)
    return BdImportTaskListResponse(
        total=total,
        items=[BdImportTaskResponse.model_validate(t) for t in tasks],
    )


@router.get("/import/{filename}/failed-csv")
def download_dict_import_failed_csv(
    _current_user: CurrentAdminUserDep,
    filename: Annotated[str, PathParam(description="失败明细文件名")],
) -> FileResponse:
    """下载失败明细 csv（归档 90 天）."""
    safe_name = Path(filename).name
    if ".." in safe_name or "/" in safe_name:
        msg = "非法文件名"
        raise FileProcessingError(msg)
    path = Path.cwd() / settings.import_upload_dir / "bd_archive" / safe_name
    if not path.exists():
        msg = "失败明细文件不存在或已过期"
        raise ResourceNotFoundError(msg)
    return FileResponse(path, filename=safe_name, media_type="text/csv")


# ==================== 总览与详情（FR-01/02 / R3） ====================


@router.get("/kpi")
def get_dict_kpi(db: DbSessionDep, _current_user: PropertyReadPermDep, service: ReadServiceDep) -> BdKpiResponse:
    """字典 KPI hero."""
    return service.get_kpi(db)


@router.get("/communities")
def query_dict_communities(
    db: DbSessionDep,
    _current_user: PropertyReadPermDep,
    service: ReadServiceDep,
    pagination: PaginationDep,
    keyword: Annotated[str | None, Query(max_length=100, description="关键词(名/地址/别名)")] = None,
    district: Annotated[str | None, Query(max_length=100)] = None,
    business_circle: Annotated[str | None, Query(max_length=100)] = None,
    ring: Annotated[str | None, Query(max_length=50)] = None,
    property_type: Annotated[str | None, Query(max_length=50)] = None,
    era_from: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    era_to: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    has_project_link: Annotated[bool | None, Query(description="有无项目关联")] = None,
) -> BdCommunityListResponse:
    """字典总览（筛选 + 关键词 + 分页 20/页 + 首图缩略列）."""
    return service.query_communities(
        db,
        keyword=keyword,
        district=district,
        business_circle=business_circle,
        ring=ring,
        property_type=property_type,
        era_from=era_from,
        era_to=era_to,
        has_project_link=has_project_link,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/communities/{community_id}")
def get_dict_community_detail(
    db: DbSessionDep,
    _current_user: PropertyReadPermDep,
    service: ReadServiceDep,
    community_id: Annotated[str, PathParam(description="小区ID")],
) -> BdCommunityDetailResponse:
    """小区详情画像（FR-02 上半部）."""
    detail = service.get_community_detail(db, community_id)
    if not detail:
        msg = "小区不存在"
        raise ResourceNotFoundError(msg)
    return detail


@router.patch("/communities/{community_id}")
@limiter.limit(RateLimits.COMMUNITY_UPDATE)
def patch_dict_community(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    community_id: Annotated[str, PathParam(description="小区ID")],
    body: BdCommunityPatchRequest,
) -> BdCommunityDetailResponse:
    """修正画像（环线/类型/年代/开发商/物业/地址/锚点，admin + 审计）."""
    write_service = get_dict_write_service()
    return write_service.patch_community(db, community_id, body, operator_id=str(current_user.id), request=request)


# ==================== 楼栋与户室（FR-03/04/05） ====================


@router.get("/communities/{community_id}/buildings")
def list_dict_buildings(
    db: DbSessionDep,
    _current_user: PropertyReadPermDep,
    service: ReadServiceDep,
    community_id: Annotated[str, PathParam(description="小区ID")],
    pagination: PaginationDep,
    keyword: Annotated[str | None, Query(max_length=100, description="楼栋号搜索")] = None,
) -> BdBuildingListResponse:
    """楼栋列表（自然序 20/页，pending 楼栋叠加）."""
    return service.list_buildings(
        db,
        community_id,
        keyword=keyword,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/buildings/{building_id}")
def get_dict_building_detail(
    db: DbSessionDep,
    _current_user: PropertyReadPermDep,
    service: ReadServiceDep,
    building_id: Annotated[int, PathParam(description="楼栋ID")],
    source_biz_type: Annotated[str | None, Query(max_length=20, description="来源单据类型(回显选中用)")] = None,
    source_biz_id: Annotated[str | None, Query(max_length=64, description="来源单据ID")] = None,
) -> BdBuildingDetail:
    """楼栋详情（户室网格 + pending 叠加；非标户室门牌回退原串）."""
    detail = service.get_building_detail(
        db,
        building_id,
        source_biz_type=source_biz_type,
        source_biz_id=source_biz_id,
    )
    if not detail:
        msg = "楼栋不存在"
        raise ResourceNotFoundError(msg)
    return detail


@router.get("/buildings/{building_id}/floors")
def get_dict_floor_groups(
    db: DbSessionDep,
    _current_user: PropertyReadPermDep,
    service: ReadServiceDep,
    building_id: Annotated[int, PathParam(description="楼栋ID")],
) -> list[BdFloorGroup]:
    """楼层分组（名义 ∪ 实际 ∪ pending，未分层置底）."""
    return service.get_floor_groups(db, building_id)


# ==================== admin 补录与新增小区（FR-06/07 / R4） ====================


@router.post("/buildings", status_code=201)
@limiter.limit(RateLimits.COMMUNITY_CREATE)
def create_dict_buildings(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    body: BdBuildingCreateRequest,
) -> BdBatchCreateResult:
    """Admin 补录楼栋（区间语法笛卡尔展开，≤60 栋，uq 跳过，审计）."""
    write_service = get_dict_write_service()
    return write_service.create_buildings(db, body, operator_id=str(current_user.id), request=request)


@router.post("/buildings/{building_id}/rooms", status_code=201)
@limiter.limit(RateLimits.COMMUNITY_CREATE)
def create_dict_rooms(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    building_id: Annotated[int, PathParam(description="楼栋ID")],
    body: BdRoomCreateRequest,
) -> BdBatchCreateResult:
    """Admin 补录户室（楼层区间×户号区间，≤200 户，uq 跳过，审计）."""
    write_service = get_dict_write_service()
    return write_service.create_rooms(db, building_id, body, operator_id=str(current_user.id), request=request)


@router.post("/communities", status_code=201)
@limiter.limit(RateLimits.COMMUNITY_CREATE)
def create_dict_community(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    body: BdCommunityCreateRequest,
) -> BdCommunityDetailResponse:
    """Admin 新增小区（重名拦截 + 撞同名 open pending 自动转正 + 审计/通知）."""
    write_service = get_dict_write_service()
    return write_service.create_community(db, body, operator_id=str(current_user.id), request=request)


@router.delete("/buildings/{building_id}")
@limiter.limit(RateLimits.COMMUNITY_UPDATE)
def delete_dict_building(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    building_id: Annotated[int, PathParam(description="楼栋ID")],
) -> BdDeleteResult:
    """Admin 删除楼栋（含其下全部户室；业务引用/待审子级拦截，审计）."""
    write_service = get_dict_write_service()
    return write_service.delete_building(db, building_id, operator_id=str(current_user.id), request=request)


@router.delete("/buildings/{building_id}/floors/{floor}")
@limiter.limit(RateLimits.COMMUNITY_UPDATE)
def delete_dict_floor(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    building_id: Annotated[int, PathParam(description="楼栋ID")],
    floor: Annotated[int, PathParam(description="楼层号")],
) -> BdDeleteResult:
    """Admin 删除楼层（= 批量删除该层全部户室；业务引用拦截，审计）."""
    write_service = get_dict_write_service()
    return write_service.delete_floor(db, building_id, floor, operator_id=str(current_user.id), request=request)


@router.delete("/buildings/{building_id}/rooms/{room_id}")
@limiter.limit(RateLimits.COMMUNITY_UPDATE)
def delete_dict_room(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    building_id: Annotated[int, PathParam(description="楼栋ID")],
    room_id: Annotated[int, PathParam(description="户室ID")],
) -> BdDeleteResult:
    """Admin 删除单个户室（业务引用拦截，审计）."""
    write_service = get_dict_write_service()
    return write_service.delete_room(db, building_id, room_id, operator_id=str(current_user.id), request=request)


# ==================== 审核池（FR-11 / R7 / Task 12） ====================


@router.get("/review")
def get_review_queue(
    db: DbSessionDep,
    current_user: PropertyReadPermDep,
    pagination: PaginationDep,
    status: Annotated[str | None, Query(max_length=20, description="状态筛选")] = None,
    community_id: Annotated[str | None, Query(max_length=36, description="小区筛选")] = None,
) -> BdReviewListResponse:
    """审核池队列（时间排序/状态/小区筛选/KPI）+ 权限校验."""
    review_service = get_building_review_service()
    return review_service.list_queue(
        db,
        viewer=current_user,
        status=status,
        community_id=community_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/review/reviewer-roles")
def get_reviewer_roles_config(
    db: DbSessionDep,
    _current_user: PropertyReadPermDep,
) -> BdReviewerRolesResponse:
    """读取审核处理人角色配置（FR-15，缺省 ['admin']）."""
    return BdReviewerRolesResponse(roles=get_reviewer_roles(db))


@router.put("/review/reviewer-roles")
@limiter.limit(RateLimits.COMMUNITY_UPDATE)
def update_reviewer_roles_config(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    body: BdReviewerRolesRequest,
) -> BdReviewerRolesResponse:
    """保存审核处理人角色配置（admin，全量替换 + 审计）."""
    from services.system.operation_log import operation_log_service

    set_reviewer_roles(db, body.roles, updated_by=str(current_user.id))
    operation_log_service.log_action(
        db,
        user_id=str(current_user.id),
        action="bd_reviewer_roles_set",
        resource_type="building_dict_config",
        resource_id="reviewer_roles",
        after={"roles": body.roles},
        request=request,
    )
    return BdReviewerRolesResponse(roles=body.roles)


@router.post("/review/{entry_id}/resolve")
@limiter.limit(RateLimits.COMMUNITY_MERGE)
def resolve_review_entry(
    request: Request,
    db: DbSessionDep,
    current_user: PropertyReadPermDep,
    entry_id: Annotated[int, PathParam(description="审核池条目ID")],
    body: BdReviewResolveRequest,
) -> BdReviewResolveResponse:
    """审核三动作（create/merge/reject）：行锁 + 状态机校验（并发 409）."""
    review_service = get_building_review_service()
    return review_service.resolve(
        db,
        entry_id=entry_id,
        body=body,
        operator=current_user,
        request=request,
    )


@router.post("/review/pending-backfill")
@limiter.limit(RateLimits.COMMUNITY_MERGE)
def retry_pending_backfill(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> BdReviewResolveResponse:
    """引用批量回填任务重试入口（BR-13：异步幂等任务失败后的运营重跑）."""
    review_service = get_building_review_service()
    return review_service.retry_backfill(db, operator_id=str(current_user.id), request=request)


# ==================== 录入端提交（FR-10 / Task 11） ====================


@router.post("/pending", status_code=201)
@limiter.limit(RateLimits.COMMUNITY_CREATE)
def submit_pending_entry(
    request: Request,
    db: DbSessionDep,
    current_user: PropertyReadPermDep,
    body: BdPendingSubmitRequest,
) -> BdPendingSubmitResponse:
    """录入端提交新增进审核池（不阻塞业务创建；同名 open pending 幂等复用）.

    M3 修复：补速率限制（原端点无限流，只读账号可刷不同名 pending 垃圾条目）。
    """
    submit_service = get_dict_submit_service()
    return submit_service.submit(
        db,
        body,
        submitted_by=str(current_user.id),
    )
