from typing import Annotated, Optional, List
from fastapi import APIRouter, Path, Query
from dependencies.projects import ProjectServiceDep
from dependencies.auth import CurrentInternalUserDep
from schemas.project import SalesRolesUpdate, SalesRecordCreate, SalesRecordResponse, ProjectResponse
from schemas.project.sales import SalesRecordListResponse

router = APIRouter()


@router.put("/{project_id}/selling/roles", response_model=ProjectResponse)
def update_sales_roles(
    project_id: Annotated[str, Path(description="项目ID")],
    roles_data: SalesRolesUpdate,
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """更新销售角色"""
    project = service.update_sales_roles(project_id, roles_data)
    return project


@router.post("/{project_id}/selling/viewings", response_model=SalesRecordResponse, status_code=201)
def create_viewing_record(
    project_id: Annotated[str, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """创建带看记录"""
    record = service.create_sales_record(project_id, record_data)
    return record


@router.post("/{project_id}/selling/offers", response_model=SalesRecordResponse, status_code=201)
def create_offer_record(
    project_id: Annotated[str, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """创建出价记录"""
    record = service.create_sales_record(project_id, record_data)
    return record


@router.post("/{project_id}/selling/negotiations", response_model=SalesRecordResponse, status_code=201)
def create_negotiation_record(
    project_id: Annotated[str, Path(description="项目ID")],
    record_data: SalesRecordCreate,
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """创建面谈记录"""
    record = service.create_sales_record(project_id, record_data)
    return record


@router.get("/{project_id}/selling/records", response_model=SalesRecordListResponse)
def get_sales_records(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
    record_type: Annotated[Optional[str], Query(description="记录类型筛选")] = None,
) -> SalesRecordListResponse:
    """获取销售记录"""
    records = service.get_sales_records(project_id, record_type)
    # 将字典列表转换为 Pydantic 模型
    items = [SalesRecordResponse.model_validate(r) for r in records]
    return SalesRecordListResponse(items=items, total=len(items))


@router.delete("/{project_id}/selling/records/{record_id}", status_code=204)
def delete_sales_record(
    project_id: Annotated[str, Path(description="项目ID")],
    record_id: Annotated[str, Path(description="记录ID")],
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """删除销售记录"""
    service.delete_sales_record(project_id, record_id)
    return None
