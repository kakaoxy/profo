from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, Path, Query
from services import ProjectService
from dependencies.projects import get_project_service
from schemas.project import RenovationUpdate, RenovationPhotoResponse, ProjectResponse
from schemas.response import ApiResponse

# Note: Prefix is handled by parent router inclusion
router = APIRouter()


@router.put("/{project_id}/renovation", response_model=ApiResponse[ProjectResponse])
def update_renovation_stage(
    project_id: str = Path(..., description="项目ID"),
    renovation_data: RenovationUpdate = ...,
    service: ProjectService = Depends(get_project_service)
):
    """更新改造阶段 (Sync)"""
    project = service.update_renovation_stage(project_id, renovation_data)
    return ApiResponse.success(data=project)


@router.post("/{project_id}/renovation/photos", response_model=ApiResponse[RenovationPhotoResponse])
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
    return ApiResponse.success(data=photo)


@router.get("/{project_id}/renovation/photos", response_model=ApiResponse[List[Dict[str, Any]]])
def get_renovation_photos(
    project_id: str = Path(..., description="项目ID"),
    stage: Optional[str] = Query(None, description="改造阶段筛选"),
    service: ProjectService = Depends(get_project_service)
):
    """获取改造阶段照片 (Sync)"""
    photos = service.get_renovation_photos(project_id, stage)
    return ApiResponse.success(data=photos)


@router.delete("/{project_id}/renovation/photos/{photo_id}", response_model=ApiResponse[None])
def delete_renovation_photo(
    project_id: str = Path(..., description="项目ID"),
    photo_id: str = Path(..., description="照片ID"),
    service: ProjectService = Depends(get_project_service)
):
    """删除改造阶段照片 (Sync)"""
    service.delete_renovation_photo(project_id, photo_id)
    return ApiResponse.success(data=None)
