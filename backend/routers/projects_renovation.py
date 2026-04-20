from typing import Annotated, Optional, List, Any, Dict
from fastapi import APIRouter, Path, Query
from dependencies.projects import ProjectServiceDep
from dependencies.auth import CurrentInternalUserDep
from schemas.project import RenovationUpdate, RenovationPhotoResponse, ProjectResponse
from schemas.project.renovation import RenovationContractUpdate, RenovationContractResponse

router = APIRouter()


@router.put("/{project_id}/renovation", response_model=ProjectResponse)
def update_renovation_stage(
    project_id: Annotated[str, Path(description="项目ID")],
    renovation_data: RenovationUpdate,
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """更新改造阶段"""
    project = service.update_renovation_stage(project_id, renovation_data)
    return project


@router.post("/{project_id}/renovation/photos", response_model=RenovationPhotoResponse)
def upload_renovation_photo(
    project_id: Annotated[str, Path(description="项目ID")],
    stage: Annotated[str, Query(description="改造阶段")],
    url: Annotated[str, Query(description="图片URL")],
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
    filename: Annotated[Optional[str], Query(description="文件名")] = None,
    description: Annotated[Optional[str], Query(description="描述")] = None,
):
    """上传改造阶段照片"""
    photo = service.add_renovation_photo(project_id, stage, url, filename, description)
    return photo


@router.get("/{project_id}/renovation/photos", response_model=List[Dict[str, Any]])
def get_renovation_photos(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
    stage: Annotated[Optional[str], Query(description="改造阶段筛选")] = None,
):
    """获取改造阶段照片"""
    photos = service.get_renovation_photos(project_id, stage)
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
    project_id: Annotated[str, Path(description="项目ID")],
    photo_id: Annotated[str, Path(description="照片ID")],
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """删除改造阶段照片"""
    service.delete_renovation_photo(project_id, photo_id)
    return None


@router.get("/{project_id}/renovation/contract", response_model=RenovationContractResponse)
def get_renovation_contract(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """获取装修合同信息"""
    contract = service.get_renovation_contract(project_id)
    return contract


@router.put("/{project_id}/renovation/contract", response_model=RenovationContractResponse)
def update_renovation_contract(
    project_id: Annotated[str, Path(description="项目ID")],
    contract_data: RenovationContractUpdate,
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
):
    """更新装修合同信息"""
    contract = service.update_renovation_contract(project_id, contract_data)
    return contract
