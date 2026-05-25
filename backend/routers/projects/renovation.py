"""项目改造阶段路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from common import RateLimits, limiter
from dependencies.auth import CurrentInternalUserDep
from dependencies.projects import ProjectServiceDep
from schemas.project import ProjectResponse, RenovationPhotoResponse, RenovationUpdate
from schemas.project.renovation import (
    RenovationContractResponse,
    RenovationContractUpdate,
    RenovationPhotoListResponse,
)

router = APIRouter()


@router.put("/{project_id}/renovation")
@limiter.limit(RateLimits.RENOVATION_UPDATE)
def update_renovation_stage(
    _request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    renovation_data: RenovationUpdate,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectResponse:
    """更新改造阶段.

    速率限制：100次/小时.
    """
    return service.update_renovation_stage(project_id, renovation_data)


@router.post("/{project_id}/renovation/photos")
def upload_renovation_photo(  # noqa: PLR0913
    project_id: Annotated[str, Path(description="项目ID")],
    stage: Annotated[str, Query(description="改造阶段")],
    url: Annotated[str, Query(description="图片URL")],
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
    filename: Annotated[str | None, Query(description="文件名")] = None,
    description: Annotated[str | None, Query(description="描述")] = None,
) -> RenovationPhotoResponse:
    """上传改造阶段照片."""
    return service.add_renovation_photo(project_id, stage, url, filename, description)


@router.get("/{project_id}/renovation/photos")
def get_renovation_photos(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
    stage: Annotated[str | None, Query(description="改造阶段筛选")] = None,
) -> RenovationPhotoListResponse:
    """获取改造阶段照片."""
    photos = service.get_renovation_photos(project_id, stage)
    items = [RenovationPhotoResponse.model_validate(p) for p in photos]
    return RenovationPhotoListResponse(items=items, total=len(items))


@router.delete("/{project_id}/renovation/photos/{photo_id}", status_code=204)
@limiter.limit(RateLimits.RENOVATION_DELETE)
def delete_renovation_photo(
    _request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    photo_id: Annotated[str, Path(description="照片ID")],
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> None:
    """删除改造阶段照片.

    速率限制：20次/小时.
    """
    service.delete_renovation_photo(project_id, photo_id)


@router.get("/{project_id}/renovation/contract")
def get_renovation_contract(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> RenovationContractResponse:
    """获取装修合同信息."""
    return service.get_renovation_contract(project_id)


@router.put("/{project_id}/renovation/contract")
@limiter.limit(RateLimits.RENOVATION_UPDATE)
def update_renovation_contract(
    _request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    contract_data: RenovationContractUpdate,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> RenovationContractResponse:
    """更新装修合同信息.

    速率限制：100次/小时.
    """
    return service.update_renovation_contract(project_id, contract_data)
