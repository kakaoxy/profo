"""文件上传路由模块."""

import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import filetype
from fastapi import APIRouter, Depends, File, Request, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import LeadUploadPhotoPermDep
from services.system.exceptions import FileProcessingError, ValidationError
from settings import settings
from utils.common import RateLimits, limiter
from utils.file_security import get_safe_file_path, sanitize_filename
from utils.image_processing import generate_thumbnail
from utils.storage import get_storage_backend

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)

TEXT_BASED_EXTENSIONS: dict[str, str] = {
    ".csv": "text/csv",
    ".md": "text/markdown",
}

IMAGE_EXTENSIONS: set[str] = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


class FileUploadResponse(BaseModel):
    """文件上传响应."""

    url: str
    filename: str
    thumbnail_url: str | None = None


def save_upload_file(
    file: UploadFile,
    request: Request,
    allowed_ext: set[str] | None = None,
) -> FileUploadResponse:
    """校验并保存上传文件，返回访问 URL.

    Args:
        file: FastAPI UploadFile 对象
        request: Request 对象，用于构造静态文件访问 URL
        allowed_ext: 允许的扩展名白名单；为 None 时使用 settings.allowed_extensions

    Returns:
        FileUploadResponse: 包含 url 与 filename 的响应

    """
    try:
        safe_name = sanitize_filename(file.filename)
        ext = Path(safe_name).suffix.lower()
        effective_ext = allowed_ext if allowed_ext is not None else settings.allowed_extensions
        if ext not in effective_ext:
            msg = f"不支持的文件扩展名。允许的扩展名: {', '.join(sorted(effective_ext))}"
            raise ValidationError(msg)

        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > settings.max_upload_size:
            msg = f"文件大小超过限制。最大允许: {settings.max_upload_size} bytes"
            raise ValidationError(msg)

        header = file.file.read(2048)
        file.file.seek(0)

        kind = filetype.guess(header)
        if kind is None:
            if ext in TEXT_BASED_EXTENSIONS:
                guessed_mime = TEXT_BASED_EXTENSIONS[ext]
                if guessed_mime not in settings.allowed_mime_types:
                    msg = f"不支持的文件类型。检测到的MIME类型: {guessed_mime}"
                    raise ValidationError(msg)
            else:
                msg = "无法识别的文件类型"
                raise ValidationError(msg)
        elif kind.mime not in settings.allowed_mime_types:
            msg = f"不支持的文件类型。检测到的MIME类型: {kind.mime}"
            raise ValidationError(msg)

        filename = f"{datetime.now(timezone.utc).strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
        upload_path = Path(settings.upload_dir)
        upload_path.mkdir(parents=True, exist_ok=True)
        file_path = get_safe_file_path(settings.upload_dir, filename)

        # 先写到本地（安全校验 + 缩略图生成需要本地文件）
        with Path(file_path).open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # 通过存储后端上传，返回访问 URL
        # OSS 模式下若上传失败需清理本地临时文件，防止孤儿文件堆积
        storage = get_storage_backend()
        thumb_path: Path | None = None
        try:
            url = storage.upload_file(Path(file_path), filename)

            # 缩略图（仅图片）：本地生成后同样通过存储后端上传
            thumbnail_url: str | None = None
            if ext in IMAGE_EXTENSIONS:
                thumb_filename = f"{Path(filename).stem}.webp"
                thumb_path = upload_path / "thumbs" / thumb_filename
                if generate_thumbnail(file_path, thumb_path):
                    thumbnail_url = storage.upload_file(thumb_path, f"thumbs/{thumb_filename}")
        except Exception:
            # 上传失败时清理已写入的本地临时文件
            if settings.storage_backend == "oss":
                Path(file_path).unlink(missing_ok=True)
                if thumb_path is not None:
                    thumb_path.unlink(missing_ok=True)
            raise

        # OSS 模式下删除本地临时文件；local 模式下文件已在目标位置（copy2 检测同文件跳过）
        if settings.storage_backend == "oss":
            Path(file_path).unlink(missing_ok=True)
            if thumb_path is not None:
                thumb_path.unlink(missing_ok=True)

        return FileUploadResponse(url=url, filename=filename, thumbnail_url=thumbnail_url)

    except (ValidationError, FileProcessingError):
        raise
    except Exception:
        logger.exception("文件上传失败")
        msg = "文件上传失败，请稍后重试"
        raise FileProcessingError(msg) from None


@router.post("/upload", summary="上传文件")
@limiter.limit(RateLimits.FILE_UPLOAD)
def upload_file(
    request: Request,
    _current_user: LeadUploadPhotoPermDep,
    file: Annotated[UploadFile, File()],
    _db: Annotated[Session, Depends(get_db)],
) -> FileUploadResponse:
    """Handle file upload (Sync - Run in threadpool by FastAPI).

    Optimized to read only first 2KB for MIME check.
    速率限制：50次/小时（防止资源耗尽攻击）.
    """
    return save_upload_file(file, request)
