"""
项目相关API路由（简化版本）
使用统一的 ApiResponse 响应包装器
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status
from services import ProjectService
from dependencies.projects import get_project_service
from schemas.project import (
    ProjectCreate, ProjectUpdate, StatusUpdate, ProjectCompleteRequest,
    ProjectResponse, ProjectListResponse, ProjectStatsResponse, ProjectReportResponse
)
from schemas.response import ApiResponse
from .projects_renovation import router as renovation_router
from .projects_sales import router as sales_router

router = APIRouter(prefix="/projects", tags=["projects"])

# Include Sub-Routers
router.include_router(renovation_router, tags=["renovation"])
router.include_router(sales_router, tags=["sales"])


# ========== 项目基础操作 ==========

@router.post("", response_model=ApiResponse[ProjectResponse])
def create_project(
    project_data: ProjectCreate,
    service: ProjectService = Depends(get_project_service)
):
    """创建项目 (Sync)"""
    project = service.create_project(project_data)
    return ApiResponse.success(data=project)


@router.get("", response_model=ApiResponse[Dict[str, Any]])
def get_projects(
    status: Optional[str] = Query(None, description="项目状态筛选"),
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    service: ProjectService = Depends(get_project_service)
):
    """获取项目列表 (Sync)"""
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=page,
        page_size=page_size
    )
    return ApiResponse.success(data=result)


@router.get("/stats", response_model=ApiResponse[ProjectStatsResponse])
def get_project_stats(
    service: ProjectService = Depends(get_project_service)
):
    """获取项目统计 (Sync)"""
    stats = service.get_project_stats()
    return ApiResponse.success(data=stats)


@router.get("/{project_id}", response_model=ApiResponse[ProjectResponse])
def get_project(
    project_id: str = Path(..., description="项目ID"),
    full: bool = Query(False, description="是否获取完整详情(包含大字段)"),
    service: ProjectService = Depends(get_project_service)
):
    """获取项目详情 (Sync)"""
    project = service.get_project(project_id, include_all=full)
    return ApiResponse.success(data=project)


@router.put("/{project_id}", response_model=ApiResponse[ProjectResponse])
def update_project(
    project_id: str = Path(..., description="项目ID"),
    update_data: ProjectUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新项目信息 (Sync)"""
    project = service.update_project(project_id, update_data)
    return ApiResponse.success(data=project)


@router.delete("/{project_id}", response_model=ApiResponse[None])
def delete_project(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除项目 (Sync)"""
    service.delete_project(project_id)
    return ApiResponse.success(data=None)


# ========== 项目状态流转 ==========

@router.put("/{project_id}/status", response_model=ApiResponse[ProjectResponse])
def update_project_status(
    project_id: str = Path(..., description="项目ID"),
    status_update: StatusUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新项目状态 (Sync)"""
    project = service.update_status(project_id, status_update)
    return ApiResponse.success(data=project)


@router.post("/{project_id}/complete", response_model=ApiResponse[ProjectResponse])
def complete_project(
    project_id: str = Path(..., description="项目ID"),
    complete_data: ProjectCompleteRequest = ...,
    service: ProjectService = Depends(get_project_service)
):
    """完成项目 (Sync)"""
    project = service.complete_project(project_id, complete_data)
    return ApiResponse.success(data=project)


# ========== 项目报告 ==========

@router.get("/{project_id}/report", response_model=ApiResponse[ProjectReportResponse])
def get_project_report(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service)
):
    """获取项目报告 (Sync)"""
    report = service.get_project_report(project_id)
    return ApiResponse.success(data=report)


# ========== 数据导出 ==========

@router.get("/export", response_model=ApiResponse[Dict[str, Any]])
def export_projects(
    status: Optional[str] = Query(None, description="项目状态筛选"),
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    service: ProjectService = Depends(get_project_service)
):
    """导出项目数据 (Sync)"""
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=1,
        page_size=10000
    )

    return ApiResponse.success(data={
        "total": result["total"],
        "message": "请实现Excel导出功能"
    })