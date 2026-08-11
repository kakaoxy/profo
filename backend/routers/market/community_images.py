"""小区户型图库管理路由.

提供 admin 端小区户型图的查询、上传、编辑、软删除能力。

路由设计：
- ``GET /admin/communities/{community_id}/images``：按小区查询户型图列表（分页）
- ``POST /admin/communities/{community_id}/images``：上传户型图（multipart）
- ``PATCH /admin/community-images/{image_id}``：更新描述/排序
- ``DELETE /admin/community-images/{image_id}``：软删除

整个模块只管户型图，不区分 ``media_type``。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, File, Path, Query, Request, UploadFile

from dependencies.auth import (
    DbSessionDep,
    PropertyReadPermDep,
    PropertyWritePermDep,
)
from dependencies.common import PaginationDep
from routers.common.files import IMAGE_EXTENSIONS, FileUploadResponse, save_upload_file
from schemas.community_image import (
    CommunityImageCreate,
    CommunityImageListResponse,
    CommunityImageResponse,
    CommunityImageUpdate,
)
from services.market import get_community_image_service
from services.market.community_image_service import CommunityImageService
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/admin", tags=["community-images"])

CommunityImageServiceDep = Annotated[CommunityImageService, Depends(get_community_image_service)]


@router.get("/communities/{community_id}/images")
def list_community_images(
    db: DbSessionDep,
    _current_user: PropertyReadPermDep,
    service: CommunityImageServiceDep,
    community_id: Annotated[str, Path(description="小区ID")],
    pagination: PaginationDep,
) -> CommunityImageListResponse:
    """按小区查询户型图列表."""
    return service.list_by_community(
        db=db,
        community_id=community_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post(
    "/communities/{community_id}/images",
    status_code=201,
)
@limiter.limit(RateLimits.FILE_UPLOAD)
def upload_community_image(
    request: Request,
    db: DbSessionDep,
    _current_user: PropertyWritePermDep,
    service: CommunityImageServiceDep,
    community_id: Annotated[str, Path(description="小区ID")],
    file: Annotated[UploadFile, File(description="户型图文件")],
    description: Annotated[str | None, Query(max_length=200, description="描述")] = None,
) -> CommunityImageResponse:
    """上传户型图到指定小区.

    速率限制：复用 FILE_UPLOAD（2000/hour）
    """
    # 复用通用上传逻辑：保存文件 + 生成缩略图
    upload_result: FileUploadResponse = save_upload_file(
        file=file,
        request=request,
        allowed_ext=IMAGE_EXTENSIONS,
    )

    body = CommunityImageCreate(
        url=upload_result.url,
        thumbnail_url=upload_result.thumbnail_url,
        description=description,
    )
    return service.create_uploaded(db=db, community_id=community_id, body=body)


@router.patch("/community-images/{image_id}")
@limiter.limit(RateLimits.COMMUNITY_IMAGE_UPDATE)
def update_community_image(
    request: Request,
    db: DbSessionDep,
    _current_user: PropertyWritePermDep,
    service: CommunityImageServiceDep,
    image_id: Annotated[int, Path(description="户型图ID")],
    body: CommunityImageUpdate,
) -> CommunityImageResponse:
    """更新户型图描述/排序（PATCH 语义）."""
    return service.update(db=db, image_id=image_id, body=body)


@router.delete("/community-images/{image_id}", status_code=204)
@limiter.limit(RateLimits.COMMUNITY_IMAGE_DELETE)
def delete_community_image(
    request: Request,
    db: DbSessionDep,
    _current_user: PropertyWritePermDep,
    service: CommunityImageServiceDep,
    image_id: Annotated[int, Path(description="户型图ID")],
) -> None:
    """软删除户型图."""
    service.soft_delete(db=db, image_id=image_id)
