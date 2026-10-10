"""项目销售相关路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request
from pydantic import UUID4

from dependencies.auth import (
    CurrentActiveUserDep,
    ProjectReadOrBusinessPermDep,
    ProjectSalesAddRecordPermDep,
    ProjectSalesManageTeamPermDep,
)
from dependencies.projects import ProjectServiceDep, SalesSummaryServiceDep
from schemas.project import (
    ProjectResponse,
    SalesRecordCreate,
    SalesRecordFlowResponse,
    SalesRecordResponse,
    SalesRolesUpdate,
    SalesSummaryResponse,
)
from schemas.project.sales import SalesRecordListResponse
from utils.common import RateLimits, limiter

router = APIRouter()


@router.get("/sales-summary")
def get_sales_summary(
    current_user: CurrentActiveUserDep,
    service: SalesSummaryServiceDep,
) -> SalesSummaryResponse:
    """销售指标 hero 区聚合（带看项目列表页页首三指标 + 周二周期新增）.

    仅需登录态：范围收敛在 Service 层（resolve_scope）——持 project:read
    聚合全部在售项目，否则按业务身份负责项目聚合，与列表双通道可见范围一致；
    无关人员得全零，不泄露无关项目数据（对齐 /keys/summary 口径）。
    """
    return service.get_summary(current_user)


@router.get("/sales-records")
def get_sales_record_flow(
    current_user: CurrentActiveUserDep,
    service: SalesSummaryServiceDep,
    page: Annotated[int, Query(ge=1, description="页码，从1开始")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="每页条数")] = 20,
    record_type: Annotated[
        str | None,
        Query(max_length=20, description="记录类型筛选: viewing/offer/negotiation"),
    ] = None,
) -> SalesRecordFlowResponse:
    """跨项目销售记录明细流（带看记录明细页，record_date 降序、同日 created_at 降序）.

    可见范围与 /sales-summary 完全同口径（同一 resolve_scope），不泄露无关项目记录。
    """
    return service.get_record_flow(current_user, page=page, page_size=page_size, record_type=record_type)


@router.put("/{project_id}/selling/roles")
@limiter.limit(RateLimits.SALES_UPDATE)
def update_sales_roles(
    request: Request,
    project_id: Annotated[UUID4, Path(description="项目ID")],
    roles_data: SalesRolesUpdate,
    service: ProjectServiceDep,
    current_user: ProjectSalesManageTeamPermDep,
) -> ProjectResponse:
    """更新销售角色.

    速率限制：100次/小时.
    """
    return service.update_sales_roles(
        project_id, roles_data, current_user=current_user, operator_id=str(current_user.id), request=request
    )


@router.post("/{project_id}/selling/viewings", status_code=201)
@limiter.limit(RateLimits.SALES_UPDATE)
def create_viewing_record(
    request: Request,
    project_id: Annotated[UUID4, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: ProjectSalesAddRecordPermDep,
) -> SalesRecordResponse:
    """创建带看记录."""
    return service.create_sales_record(
        project_id, record_data, current_user, operator_id=str(current_user.id), request=request
    )


@router.post("/{project_id}/selling/offers", status_code=201)
@limiter.limit(RateLimits.SALES_UPDATE)
def create_offer_record(
    request: Request,
    project_id: Annotated[UUID4, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: ProjectSalesAddRecordPermDep,
) -> SalesRecordResponse:
    """创建出价记录."""
    return service.create_sales_record(
        project_id, record_data, current_user, operator_id=str(current_user.id), request=request
    )


@router.post("/{project_id}/selling/negotiations", status_code=201)
@limiter.limit(RateLimits.SALES_UPDATE)
def create_negotiation_record(
    request: Request,
    project_id: Annotated[UUID4, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: ProjectSalesAddRecordPermDep,
) -> SalesRecordResponse:
    """创建面谈记录."""
    return service.create_sales_record(
        project_id, record_data, current_user, operator_id=str(current_user.id), request=request
    )


@router.get("/{project_id}/selling/records")
def get_sales_records(
    project_id: Annotated[UUID4, Path(description="项目ID")],
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
    project_id: Annotated[UUID4, Path(description="项目ID")],
    record_id: Annotated[str, Path(description="记录ID")],
    service: ProjectServiceDep,
    current_user: ProjectSalesAddRecordPermDep,
) -> None:
    """删除销售记录.

    速率限制：20次/小时.
    """
    service.delete_sales_record(project_id, record_id, operator_id=str(current_user.id), request=request)
