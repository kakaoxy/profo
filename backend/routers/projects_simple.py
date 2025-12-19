"""
项目相关API路由（简化版本，暂时移除response_model）
"""
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, Query, Path, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from services import ProjectService
from schemas.project import (
    ProjectCreate, ProjectUpdate, ProjectResponse,
    ProjectListResponse, ProjectStatsResponse, RenovationUpdate,
    RenovationPhotoResponse, StatusUpdate, ProjectCompleteRequest,
    SalesRecordCreate, SalesRecordResponse, SalesRolesUpdate,
    ProjectReportResponse, BaseResponse
)

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


def get_project_service(db: Session = Depends(get_db)):
    return ProjectService(db)


# ========== 项目基础操作 ==========

@router.post("")
async def create_project(
    project_data: ProjectCreate,
    service: ProjectService = Depends(get_project_service)
):
    """创建项目"""
    project = service.create_project(project_data)
    return {"code": 200, "msg": "success", "data": project}


@router.get("")
async def get_projects(
    status: Optional[str] = Query(None, description="项目状态筛选"),
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    service: ProjectService = Depends(get_project_service)
):
    """获取项目列表"""
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=page,
        page_size=page_size
    )
    return {"code": 200, "msg": "success", "data": result}


@router.get("/stats")
async def get_project_stats(
    service: ProjectService = Depends(get_project_service)
):
    """获取项目统计"""
    stats = service.get_project_stats()
    return {"code": 200, "msg": "success", "data": stats}


@router.get("/{project_id}")
async def get_project(
    project_id: str = Path(..., description="项目ID"),
    full: bool = Query(False, description="是否获取完整详情(包含大字段)"), # [新增]
    service: ProjectService = Depends(get_project_service)
):
    """获取项目详情"""
    # 传递 full 参数给 service
    project = service.get_project(project_id, include_all=full)
    return {"code": 200, "msg": "success", "data": project}


@router.put("/{project_id}")
async def update_project(
    project_id: str = Path(..., description="项目ID"),
    update_data: ProjectUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新项目信息（仅签约阶段可修改）"""
    project = service.update_project(project_id, update_data)
    return {"code": 200, "msg": "success", "data": project}


@router.delete("/{project_id}")
async def delete_project(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除项目（软删除）"""
    service.delete_project(project_id)
    return {"code": 200, "msg": "success", "data": None}


# ========== 项目状态流转 ==========

@router.put("/{project_id}/status")
async def update_project_status(
    project_id: str = Path(..., description="项目ID"),
    status_update: StatusUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新项目状态"""
    project = service.update_status(project_id, status_update)
    return {"code": 200, "msg": "success", "data": project}


@router.post("/{project_id}/complete")
async def complete_project(
    project_id: str = Path(..., description="项目ID"),
    complete_data: ProjectCompleteRequest = ...,
    service: ProjectService = Depends(get_project_service)
):
    """完成项目（标记为已售）"""
    project = service.complete_project(project_id, complete_data)
    return {"code": 200, "msg": "success", "data": project}


# ========== 改造阶段管理 ==========

@router.put("/{project_id}/renovation")
async def update_renovation_stage(
    project_id: str = Path(..., description="项目ID"),
    renovation_data: RenovationUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新改造阶段"""
    project = service.update_renovation_stage(project_id, renovation_data)
    return {"code": 200, "msg": "success", "data": project}


@router.post("/{project_id}/renovation/photos")
async def upload_renovation_photo(
    project_id: str = Path(..., description="项目ID"),
    stage: str = Query(..., description="改造阶段"),
    url: str = Query(..., description="图片URL"),
    filename: Optional[str] = Query(None, description="文件名"),
    description: Optional[str] = Query(None, description="描述"),
    service: ProjectService = Depends(get_project_service)
):
    """上传改造阶段照片"""
    photo = service.add_renovation_photo(project_id, stage, url, filename, description)
    return {"code": 200, "msg": "success", "data": photo}


@router.get("/{project_id}/renovation/photos")
async def get_renovation_photos(
    project_id: str = Path(..., description="项目ID"),
    stage: Optional[str] = Query(None, description="改造阶段筛选"),
    service: ProjectService = Depends(get_project_service)
):
    """获取改造阶段照片"""
    photos = service.get_renovation_photos(project_id, stage)
    return {"code": 200, "msg": "success", "data": photos}

@router.delete("/{project_id}/renovation/photos/{photo_id}")
async def delete_renovation_photo(
    project_id: str = Path(..., description="项目ID"),
    photo_id: str = Path(..., description="照片ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除改造阶段照片"""
    service.delete_renovation_photo(project_id, photo_id)
    return {"code": 200, "msg": "success", "data": None}


# ========== 在售阶段管理 ==========

@router.put("/{project_id}/selling/roles")
async def update_sales_roles(
    project_id: str = Path(..., description="项目ID"),
    roles_data: SalesRolesUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新销售角色"""
    project = service.update_sales_roles(project_id, roles_data)
    return {"code": 200, "msg": "success", "data": project}


@router.post("/{project_id}/selling/viewings")
async def create_viewing_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: SalesRecordCreate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """创建带看记录"""
    record = service.create_sales_record(project_id, record_data)
    return {"code": 200, "msg": "success", "data": record}


@router.post("/{project_id}/selling/offers")
async def create_offer_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: SalesRecordCreate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """创建出价记录"""
    record = service.create_sales_record(project_id, record_data)
    return {"code": 200, "msg": "success", "data": record}


@router.post("/{project_id}/selling/negotiations")
async def create_negotiation_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: SalesRecordCreate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """创建面谈记录"""
    record = service.create_sales_record(project_id, record_data)
    return {"code": 200, "msg": "success", "data": record}


@router.get("/{project_id}/selling/records")
async def get_sales_records(
    project_id: str = Path(..., description="项目ID"),
    record_type: Optional[str] = Query(None, description="记录类型筛选"),
    service: ProjectService = Depends(get_project_service)
):
    """获取销售记录"""
    records = service.get_sales_records(project_id, record_type)
    return {"code": 200, "msg": "success", "data": records}


@router.delete("/{project_id}/selling/records/{record_id}")
async def delete_sales_record(
    project_id: str = Path(..., description="项目ID"),
    record_id: str = Path(..., description="记录ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除销售记录"""
    service.delete_sales_record(project_id, record_id)
    return {"code": 200, "msg": "success", "data": None}


# ========== 项目报告 ==========

@router.get("/{project_id}/report")
async def get_project_report(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service)
):
    """获取项目报告"""
    report = service.get_project_report(project_id)
    return {"code": 200, "msg": "success", "data": report}


# ========== 数据导出 ==========

@router.get("/export")
async def export_projects(
    status: Optional[str] = Query(None, description="项目状态筛选"),
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    service: ProjectService = Depends(get_project_service)
):
    """导出项目数据到Excel"""
    # 获取所有项目数据（不分页）
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=1,
        page_size=10000  # 假设最多导出10000条
    )

    # 这里可以集成Excel导出功能
    # 暂时返回一个提示信息
    return {
        "code": 200,
        "msg": "Excel导出功能待实现",
        "data": {
            "total": result["total"],
            "message": "请实现Excel导出功能"
        }
    }