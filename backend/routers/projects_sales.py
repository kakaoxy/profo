from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, Path, Query
from services import ProjectService
from dependencies.projects import get_project_service
from schemas.project import SalesRolesUpdate, SalesRecordCreate, SalesRecordResponse, ProjectResponse
from schemas.response import ApiResponse

router = APIRouter()


@router.put("/{project_id}/selling/roles", response_model=ApiResponse[ProjectResponse])
def update_sales_roles(
    project_id: str = Path(..., description="项目ID"),
    roles_data: SalesRolesUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新销售角色 (Sync)"""
    project = service.update_sales_roles(project_id, roles_data)
    return ApiResponse.success(data=project)


@router.post("/{project_id}/selling/viewings", response_model=ApiResponse[SalesRecordResponse])
def create_viewing_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: SalesRecordCreate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """创建带看记录 (Sync)"""
    record = service.create_sales_record(project_id, record_data)
    return ApiResponse.success(data=record)


@router.post("/{project_id}/selling/offers", response_model=ApiResponse[SalesRecordResponse])
def create_offer_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: SalesRecordCreate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """创建出价记录 (Sync)"""
    record = service.create_sales_record(project_id, record_data)
    return ApiResponse.success(data=record)


@router.post("/{project_id}/selling/negotiations", response_model=ApiResponse[SalesRecordResponse])
def create_negotiation_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: SalesRecordCreate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """创建面谈记录 (Sync)"""
    record = service.create_sales_record(project_id, record_data)
    return ApiResponse.success(data=record)


@router.get("/{project_id}/selling/records", response_model=ApiResponse[List[Dict[str, Any]]])
def get_sales_records(
    project_id: str = Path(..., description="项目ID"),
    record_type: Optional[str] = Query(None, description="记录类型筛选"),
    service: ProjectService = Depends(get_project_service)
):
    """获取销售记录 (Sync)"""
    records = service.get_sales_records(project_id, record_type)
    return ApiResponse.success(data=records)


@router.delete("/{project_id}/selling/records/{record_id}", response_model=ApiResponse[None])
def delete_sales_record(
    project_id: str = Path(..., description="项目ID"),
    record_id: str = Path(..., description="记录ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除销售记录 (Sync)"""
    service.delete_sales_record(project_id, record_id)
    return ApiResponse.success(data=None)
