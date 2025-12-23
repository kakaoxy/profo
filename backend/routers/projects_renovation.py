from typing import Optional
from fastapi import APIRouter, Depends, Path, Query
from services import ProjectService
from dependencies.projects import get_project_service
from schemas.project import RenovationUpdate

# Note: Prefix is handled by parent router inclusion
router = APIRouter()

@router.put("/{project_id}/renovation")
def update_renovation_stage(
    project_id: str = Path(..., description="项目ID"),
    renovation_data: RenovationUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新改造阶段 (Sync)"""
    project = service.update_renovation_stage(project_id, renovation_data)
    return {"code": 200, "msg": "success", "data": project}


@router.post("/{project_id}/renovation/photos")
def upload_renovation_photo(
    project_id: str = Path(..., description="项目ID"),
    stage: str = Query(..., description="改造阶段"),
    url: str = Query(..., description="图片URL"),
    filename: Optional[str] = Query(None, description="文件名"),
    description: Optional[str] = Query(None, description="描述"),
    service: ProjectService = Depends(get_project_service)
):
    """上传改造阶段照片 (Sync)"""
    photo = service.add_renovation_photo(project_id, stage, url, filename, description)
    return {"code": 200, "msg": "success", "data": photo}


@router.get("/{project_id}/renovation/photos")
def get_renovation_photos(
    project_id: str = Path(..., description="项目ID"),
    stage: Optional[str] = Query(None, description="改造阶段筛选"),
    service: ProjectService = Depends(get_project_service)
):
    """获取改造阶段照片 (Sync)"""
    photos = service.get_renovation_photos(project_id, stage)
    return {"code": 200, "msg": "success", "data": photos}

@router.delete("/{project_id}/renovation/photos/{photo_id}")
def delete_renovation_photo(
    project_id: str = Path(..., description="项目ID"),
    photo_id: str = Path(..., description="照片ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除改造阶段照片 (Sync)"""
    service.delete_renovation_photo(project_id, photo_id)
    return {"code": 200, "msg": "success", "data": None}
