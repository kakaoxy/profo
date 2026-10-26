"""C 端楼盘字典只读路由（小程序估价表单四级地址）.

为什么需要独立端点而不是复用 `/admin/building-dictionary/*`：
小程序 C 端用户持的是 C 端令牌（aud=c），admin 字典端点要求后台读权限，
直接调用必然 403。C 端只需要「选小区 → 选楼栋 → 选户室」的读能力，
写入口（新增小区/楼栋/户室进审核池）**不在此开放**——它随估价线索提交一并
透传 `new_*` 载荷，由 `LeadService.create_lead` 走与 admin 录入线索完全相同的
`submit_dict_chain`（同事务、幂等复用同名 pending），避免 C 端出现第二套
审核池写入口径。

读口径：全部委托 `BuildingDictReadService`（pending 叠加的 R10 单点），
禁止在此自行 union 实表与 pending 表。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from dependencies.auth import DbSessionDep
from schemas.building_dict import BdBuildingDetail, BdBuildingListResponse, BdFloorGroup
from services.property.dict_read_service import DEFAULT_ROOM_PAGE_SIZE, MAX_ROOM_PAGE_SIZE, BuildingDictReadService
from services.system.exceptions import ResourceNotFoundError
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/building-dictionary", tags=["public-building-dictionary"])


@router.get(
    "/communities/{community_id}/buildings",
    summary="C端楼栋列表",
    description="按小区查询楼栋（自然序分页，含待审楼栋标记），无需登录",
)
@limiter.limit(RateLimits.PUBLIC_BUILDING_DICT)
def list_public_buildings(
    request: Request,
    db: DbSessionDep,
    community_id: Annotated[str, Path(min_length=1, max_length=36, description="小区ID")],
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="每页数量")] = 50,
    keyword: Annotated[str | None, Query(max_length=100, description="楼栋号搜索")] = None,
) -> BdBuildingListResponse:
    """楼栋列表（C 端只读；pending 楼栋带标记，选择时由前端置灰）."""
    service = BuildingDictReadService()
    return service.list_buildings(
        db,
        community_id,
        keyword=keyword,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/buildings/{building_id}/floors",
    summary="C端楼层分组",
    description="楼栋楼层分组（名义 ∪ 实际 ∪ 待审，未分层置底），无需登录",
)
@limiter.limit(RateLimits.PUBLIC_BUILDING_DICT)
def get_public_floor_groups(
    request: Request,
    db: DbSessionDep,
    building_id: Annotated[int, Path(description="楼栋ID")],
) -> list[BdFloorGroup]:
    """楼层分组（C 端只读）."""
    service = BuildingDictReadService()
    return service.get_floor_groups(db, building_id)


@router.get(
    "/buildings/{building_id}",
    summary="C端楼栋详情（户室）",
    description="楼栋户室分页（含待审户室标记），无需登录",
)
@limiter.limit(RateLimits.PUBLIC_BUILDING_DICT)
def get_public_building_detail(
    request: Request,
    db: DbSessionDep,
    building_id: Annotated[int, Path(description="楼栋ID")],
    room_page: Annotated[int, Query(ge=1, description="户室页码")] = 1,
    room_page_size: Annotated[
        int,
        Query(ge=1, le=MAX_ROOM_PAGE_SIZE, description="每页户室数（默认 200，上限 500）"),
    ] = DEFAULT_ROOM_PAGE_SIZE,
) -> BdBuildingDetail:
    """楼栋详情（户室网格分页）.

    Raises:
        ResourceNotFoundError: 楼栋不存在

    """
    service = BuildingDictReadService()
    detail = service.get_building_detail(
        db,
        building_id,
        room_page=room_page,
        room_page_size=room_page_size,
    )
    if not detail:
        msg = "楼栋不存在"
        raise ResourceNotFoundError(msg)
    return detail
