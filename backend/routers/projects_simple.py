"""
项目相关API路由（简化版本）
直接返回 Pydantic 模型，不使用 ApiResponse 包装器
符合 AGENTS.md 规范第 26 条
"""
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status
from services import ProjectService
from dependencies.projects import get_project_service
from dependencies.auth import get_current_internal_user
from models.user import User
from schemas.project import (
    ProjectCreate, ProjectUpdate, StatusUpdate, ProjectCompleteRequest,
    ProjectResponse, ProjectListResponse, ProjectStatsResponse, ProjectReportResponse
)
from schemas.common import PaginatedResponse
from .projects_renovation import router as renovation_router
from .projects_sales import router as sales_router

router = APIRouter(prefix="/projects", tags=["projects"])

# Include Sub-Routers
router.include_router(renovation_router, tags=["renovation"])
router.include_router(sales_router, tags=["sales"])


# ========== 项目基础操作 ==========

@router.post("", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    project_data: ProjectCreate,
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """创建项目"""
    project = service.create_project(project_data)
    return project


@router.get("", response_model=PaginatedResponse[ProjectResponse])
def get_projects(
    status: Optional[str] = Query(None, description="项目状态筛选"),
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """获取项目列表"""
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=page,
        page_size=page_size
    )
    return PaginatedResponse(
        items=result["items"],
        total=result["total"],
        page=page,
        size=page_size
    )


@router.get("/stats", response_model=ProjectStatsResponse)
def get_project_stats(
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """获取项目统计"""
    stats = service.get_project_stats()
    return stats


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str = Path(..., description="项目ID"),
    full: bool = Query(False, description="是否获取完整详情(包含大字段)"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """获取项目详情"""
    project = service.get_project(project_id, include_all=full)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str = Path(..., description="项目ID"),
    update_data: ProjectUpdate = ...,
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """更新项目信息"""
    project = service.update_project(project_id, update_data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """删除项目"""
    service.delete_project(project_id)
    return None


# ========== 项目状态流转 ==========

@router.put("/{project_id}/status", response_model=ProjectResponse)
def update_project_status(
    project_id: str = Path(..., description="项目ID"),
    status_update: StatusUpdate = ...,
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """更新项目状态"""
    project = service.update_status(project_id, status_update)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/{project_id}/complete", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def complete_project(
    project_id: str = Path(..., description="项目ID"),
    complete_data: ProjectCompleteRequest = ...,
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """完成项目"""
    project = service.complete_project(project_id, complete_data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


# ========== 项目报告 ==========

@router.get("/{project_id}/report", response_model=ProjectReportResponse)
def get_project_report(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """获取项目报告"""
    report = service.get_project_report(project_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report


# ========== 数据导出 ==========

@router.get("/export", response_model=Dict[str, Any])
def export_projects(
    status: Optional[str] = Query(None, description="项目状态筛选"),
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """导出项目数据"""
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=1,
        page_size=10000
    )

    return {
        "total": result["total"],
        "message": "请实现Excel导出功能"
    }
