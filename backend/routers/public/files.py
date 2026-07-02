"""C端公开文件上传路由.

供 C 端用户（customer 角色）上传户型图等图片文件.
与后台 /files/upload 共享校验与落盘逻辑，但收紧扩展名白名单为图片，降低公开端点攻击面.
"""

from typing import Annotated

from fastapi import APIRouter, File, Request, UploadFile, status

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentCustomerUserDep
from routers.common.files import FileUploadResponse, save_upload_file

router = APIRouter(prefix="/public/files", tags=["public-files"])

# C 端公开端点仅允许图片格式，不开放 pdf/xlsx/doc 等
IMAGE_EXTENSIONS: set[str] = {".jpg", ".jpeg", ".png"}


@router.post(
    "/upload",
    status_code=status.HTTP_201_CREATED,
    summary="C端上传文件",
    description="C端用户上传图片（如户型图），仅支持 jpg/jpeg/png",
)
@limiter.limit(RateLimits.PUBLIC_FILE_UPLOAD)
def upload_file(
    request: Request,
    _current_user: CurrentCustomerUserDep,
    file: Annotated[UploadFile, File()],
) -> FileUploadResponse:
    """C端用户上传图片文件.

    速率限制：30次/小时（防止资源耗尽攻击）.
    """
    return save_upload_file(file, request, allowed_ext=IMAGE_EXTENSIONS)
