"""L4 市场营销层导入路由.

负责从L3项目导入数据相关API.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, status

from dependencies.auth import DbSessionDep, require_roles
from schemas.l4_marketing.import_schemas import (
    L3ProjectBriefResponse,
    L3ProjectImportResponse,
    L3ProjectListResponse,
)
from services.marketing import (
    MarketingImportService as L4MarketingImportService,
)
from services.marketing import (
    MarketingQueryService as L4MarketingQueryService,
)
from services.system.exceptions import ResourceNotFoundError, ServiceException

router = APIRouter(
    prefix="/admin/l4-marketing",
    tags=["l4-marketing-import"],
    dependencies=[Depends(require_roles(["admin", "operator"]))],
)

QueryServiceDep = Annotated[L4MarketingQueryService, Depends(L4MarketingQueryService)]
ImportServiceDep = Annotated[L4MarketingImportService, Depends(L4MarketingImportService)]


def get_query_service(db: DbSessionDep) -> L4MarketingQueryService:
    """获取查询服务实例."""
    return L4MarketingQueryService(db)


def get_import_service(db: DbSessionDep) -> L4MarketingImportService:
    """获取导入服务实例."""
    return L4MarketingImportService(db)


@router.get(
    "/available-projects",
    summary="获取可关联的L3项目列表",
)
async def list_available_projects(
    service: Annotated[L4MarketingQueryService, Depends(get_query_service)],
    community_name: Annotated[str | None, Query(description="小区名称筛选")] = None,
    status: Annotated[str | None, Query(description="项目状态筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页大小")] = 20,
) -> L3ProjectListResponse:
    """获取可用于关联的L3项目列表.

    用于在创建营销房源时选择关联的L3项目
    """
    items, total = service.get_available_l3_projects(
        community_name=community_name,
        status=status,
        page=page,
        page_size=page_size,
    )
    return L3ProjectListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/available-projects/{project_id}",
    summary="获取L3项目详情",
)
async def get_l3_project_detail(
    project_id: Annotated[str, Path(description="项目ID")],
    service: Annotated[L4MarketingQueryService, Depends(get_query_service)],
) -> L3ProjectBriefResponse:
    """获取单个L3项目详情.

    用于项目选择器中预览项目信息
    """
    project = service.get_l3_project_for_import(project_id)
    if not project:
        raise ResourceNotFoundError("项目不存在或已删除")

    return L3ProjectBriefResponse(
        id=project.id,
        name=project.name or "未命名项目",
        community_name=project.community_name or "",
        address=project.address or "",
        area=project.area,
        layout=project.layout,
        orientation=project.orientation,
        status=project.status.value if hasattr(project.status, "value") else str(project.status),
    )


@router.post(
    "/projects/import-from-l3/{project_id}",
    summary="从L3项目导入数据",
)
async def import_from_l3_project(
    project_id: Annotated[str, Path(description="项目ID")],
    query_service: Annotated[L4MarketingQueryService, Depends(get_query_service)],
    import_service: Annotated[L4MarketingImportService, Depends(get_import_service)],
) -> L3ProjectImportResponse:
    """从L3项目导入数据.

    根据L3项目ID获取可导入的数据，用于创建营销房源
    采用写时复制(CoW)模式，L4独立存储数据
    """
    if not query_service.check_project_exists(project_id):
        raise ResourceNotFoundError("项目不存在或已删除")

    result = import_service.import_from_l3_project(project_id)
    if not result:
        raise ServiceException("导入数据失败")

    return result
