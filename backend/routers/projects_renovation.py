from typing import Optional, List, Any, Dict
from fastapi import APIRouter, Depends, Path, Query
from services import ProjectService
from dependencies.projects import get_project_service
from dependencies.auth import get_current_internal_user
from models.user import User
from schemas.project import RenovationUpdate, RenovationPhotoResponse, ProjectResponse
from schemas.project_renovation import RenovationContractUpdate, RenovationContractResponse

# Note: Prefix is handled by parent router inclusion
router = APIRouter()


@router.put("/{project_id}/renovation", response_model=ProjectResponse)
def update_renovation_stage(
    project_id: str = Path(..., description="项目ID"),
    renovation_data: RenovationUpdate = ...,
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """更新改造阶段 (Sync)"""
    project = service.update_renovation_stage(project_id, renovation_data)
    return project


@router.post("/{project_id}/renovation/photos", response_model=RenovationPhotoResponse)
def upload_renovation_photo(
    project_id: str = Path(..., description="项目ID"),
    stage: str = Query(..., description="改造阶段"),
    url: str = Query(..., description="图片URL"),
    filename: Optional[str] = Query(None, description="文件名"),
    description: Optional[str] = Query(None, description="描述"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """上传改造阶段照片 (Sync)"""
    photo = service.add_renovation_photo(project_id, stage, url, filename, description)
    return photo


@router.get("/{project_id}/renovation/photos", response_model=List[Dict[str, Any]])
def get_renovation_photos(
    project_id: str = Path(..., description="项目ID"),
    stage: Optional[str] = Query(None, description="改造阶段筛选"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """获取改造阶段照片 (Sync)"""
    photos = service.get_renovation_photos(project_id, stage)
    # 将 ORM 对象转换为字典
    photos_dict = [
        {
            "id": photo.id,
            "project_id": photo.project_id,
            "renovation_id": photo.renovation_id,
            "stage": photo.stage,
            "url": photo.url,
            "filename": photo.filename,
            "description": photo.description,
            "created_at": photo.created_at,
            "updated_at": photo.updated_at,
        }
        for photo in photos
    ]
    return photos_dict


@router.delete("/{project_id}/renovation/photos/{photo_id}", status_code=204)
def delete_renovation_photo(
    project_id: str = Path(..., description="项目ID"),
    photo_id: str = Path(..., description="照片ID"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """删除改造阶段照片 (Sync)"""
    service.delete_renovation_photo(project_id, photo_id)
    return None


@router.get("/{project_id}/renovation/contract", response_model=RenovationContractResponse)
def get_renovation_contract(
    project_id: str = Path(..., description="项目ID"),
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """获取装修合同信息 (Sync)"""
    contract = service.get_renovation_contract(project_id)
    return contract


@router.put("/{project_id}/renovation/contract", response_model=RenovationContractResponse)
def update_renovation_contract(
    project_id: str = Path(..., description="项目ID"),
    contract_data: RenovationContractUpdate = ...,
    service: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_internal_user)
):
    """更新装修合同信息 (Sync)"""
    contract = service.update_renovation_contract(project_id, contract_data)
    return contract
