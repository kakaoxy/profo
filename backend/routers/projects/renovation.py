"""项目改造阶段路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from dependencies.auth import (
    ProjectReadOrBusinessPermDep,
    ProjectRenovationCompleteStagePermDep,
    ProjectRenovationUploadPhotoPermDep,
)
from dependencies.projects import ProjectServiceDep
from schemas.project import ProjectResponse, RenovationPhotoResponse, RenovationUpdate
from schemas.project.renovation import (
    RenovationContractResponse,
    RenovationContractUpdate,
    RenovationPhotoListResponse,
)
from utils.common import RateLimits, limiter

router = APIRouter()


@router.put("/{project_id}/renovation")
@limiter.limit(RateLimits.RENOVATION_UPDATE)
def update_renovation_stage(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    renovation_data: RenovationUpdate,
    service: ProjectServiceDep,
    current_user: ProjectRenovationCompleteStagePermDep,
) -> ProjectResponse:
    """更新改造阶段.

    速率限制：100次/小时.
    """
    return service.update_renovation_stage(project_id, renovation_data, current_user=current_user)


@router.post("/{project_id}/renovation/photos")
@limiter.limit(RateLimits.RENOVATION_UPDATE)
def upload_renovation_photo(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    stage: Annotated[str, Query(max_length=100, description="改造阶段")],
    url: Annotated[str, Query(max_length=2000, description="图片URL", pattern=r"^(https?://|/)[^\s]+$")],
    service: ProjectServiceDep,
    _current_user: ProjectRenovationUploadPhotoPermDep,
    filename: Annotated[str | None, Query(max_length=255, description="文件名")] = None,
    description: Annotated[str | None, Query(max_length=500, description="描述")] = None,
    thumbnail_url: Annotated[
        str | None, Query(max_length=2000, description="缩略图URL", pattern=r"^(https?://|/)[^\s]+$")
    ] = None,
    media_type: Annotated[str, Query(max_length=10, description="媒体种类: image/video")] = "image",
) -> RenovationPhotoResponse:
    """上传改造阶段照片."""
    return service.add_renovation_photo(
        project_id,
        stage,
        url,
        filename,
        description,
        thumbnail_url,
        media_type,
    )


@router.get("/{project_id}/renovation/photos")
def get_renovation_photos(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: ProjectReadOrBusinessPermDep,
    stage: Annotated[str | None, Query(max_length=100, description="改造阶段筛选")] = None,
) -> RenovationPhotoListResponse:
    """获取改造阶段照片.

    使用 ProjectReadOrBusinessPermDep 双通道校验：持 project:read/write 或为该项目业务负责人.
    装修对接负责人需查看自己负责项目的照片以执行上传/删除操作。
    """
    photos = service.get_renovation_photos(project_id, stage)
    items = [RenovationPhotoResponse.model_validate(p) for p in photos]
    return RenovationPhotoListResponse(items=items, total=len(items))


@router.delete("/{project_id}/renovation/photos/{photo_id}", status_code=204)
@limiter.limit(RateLimits.RENOVATION_DELETE)
def delete_renovation_photo(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    photo_id: Annotated[str, Path(description="照片ID")],
    service: ProjectServiceDep,
    _current_user: ProjectRenovationUploadPhotoPermDep,
) -> None:
    """删除改造阶段照片.

    速率限制：20次/小时.
    """
    service.delete_renovation_photo(project_id, photo_id)


@router.get("/{project_id}/renovation/contract")
def get_renovation_contract(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: ProjectReadOrBusinessPermDep,
) -> RenovationContractResponse:
    """获取装修合同信息.

    使用 ProjectReadOrBusinessPermDep 双通道校验：持 project:read/write 或为该项目业务负责人.
    """
    return service.get_renovation_contract(project_id)


@router.put("/{project_id}/renovation/contract")
@limiter.limit(RateLimits.RENOVATION_UPDATE)
def update_renovation_contract(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    contract_data: RenovationContractUpdate,
    service: ProjectServiceDep,
    current_user: ProjectRenovationCompleteStagePermDep,
) -> RenovationContractResponse:
    """更新装修合同信息.

    速率限制：100次/小时.
    """
    return service.update_renovation_contract(project_id, contract_data)
