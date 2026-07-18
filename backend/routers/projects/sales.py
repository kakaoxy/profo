"""项目销售相关路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from dependencies.auth import (
    ProjectReadOrBusinessPermDep,
    ProjectSalesAddRecordPermDep,
    ProjectSalesManageTeamPermDep,
)
from dependencies.projects import ProjectServiceDep
from schemas.project import (
    ProjectResponse,
    SalesRecordCreate,
    SalesRecordResponse,
    SalesRolesUpdate,
)
from schemas.project.sales import SalesRecordListResponse
from utils.common import RateLimits, limiter

router = APIRouter()


@router.put("/{project_id}/selling/roles")
@limiter.limit(RateLimits.SALES_UPDATE)
def update_sales_roles(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    roles_data: SalesRolesUpdate,
    service: ProjectServiceDep,
    current_user: ProjectSalesManageTeamPermDep,
) -> ProjectResponse:
    """更新销售角色.

    速率限制：100次/小时.
    """
    return service.update_sales_roles(project_id, roles_data, current_user=current_user)


@router.post("/{project_id}/selling/viewings", status_code=201)
@limiter.limit(RateLimits.SALES_UPDATE)
def create_viewing_record(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: ProjectSalesAddRecordPermDep,
) -> SalesRecordResponse:
    """创建带看记录."""
    return service.create_sales_record(project_id, record_data, current_user=current_user)


@router.post("/{project_id}/selling/offers", status_code=201)
@limiter.limit(RateLimits.SALES_UPDATE)
def create_offer_record(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: ProjectSalesAddRecordPermDep,
) -> SalesRecordResponse:
    """创建出价记录."""
    return service.create_sales_record(project_id, record_data, current_user=current_user)


@router.post("/{project_id}/selling/negotiations", status_code=201)
@limiter.limit(RateLimits.SALES_UPDATE)
def create_negotiation_record(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: ProjectSalesAddRecordPermDep,
) -> SalesRecordResponse:
    """创建面谈记录."""
    return service.create_sales_record(project_id, record_data, current_user=current_user)


@router.get("/{project_id}/selling/records")
def get_sales_records(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: ProjectReadOrBusinessPermDep,
    record_type: Annotated[str | None, Query(max_length=100, description="记录类型筛选")] = None,
) -> SalesRecordListResponse:
    """获取销售记录.

    使用 ProjectReadOrBusinessPermDep 双通道校验：持 project:read/write 或为该项目业务负责人.
    销售团队成员（渠道/讲房/谈判）需查看自己负责项目的销售记录以执行添加/删除操作。
    """
    records = service.get_sales_records(project_id, record_type)
    items = [SalesRecordResponse.model_validate(r) for r in records]
    return SalesRecordListResponse(items=items, total=len(items))


@router.delete("/{project_id}/selling/records/{record_id}", status_code=204)
@limiter.limit(RateLimits.SALES_DELETE)
def delete_sales_record(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    record_id: Annotated[str, Path(description="记录ID")],
    service: ProjectServiceDep,
    _current_user: ProjectSalesAddRecordPermDep,
) -> None:
    """删除销售记录.

    速率限制：20次/小时.
    """
    service.delete_sales_record(project_id, record_id)
