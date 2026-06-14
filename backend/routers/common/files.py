"""文件上传路由模块."""

import logging
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import filetype
from fastapi import APIRouter, Depends, File, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from utils.common import RateLimits, limiter
from db import get_db
from dependencies.auth import CurrentOperatorUserDep
from services.system.exceptions import FileProcessingError, ValidationError
from settings import settings
from utils.file_security import get_safe_file_path, sanitize_filename

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)

TEXT_BASED_EXTENSIONS: dict[str, str] = {
    ".csv": "text/csv",
    ".md": "text/markdown",
}


class FileUploadResponse(BaseModel):
    """文件上传响应."""

    url: str
    filename: str


@router.post("/upload", summary="上传文件")
@limiter.limit(RateLimits.FILE_UPLOAD)
def upload_file(
    request: Request,
    _current_user: CurrentOperatorUserDep,
    file: Annotated[UploadFile, File()],
    _db: Annotated[Session, Depends(get_db)],
) -> FileUploadResponse:
    """Handle file upload (Sync - Run in threadpool by FastAPI).

    Optimized to read only first 2KB for MIME check.
    速率限制：50次/小时（防止资源耗尽攻击）.
    """
    try:
        safe_name = sanitize_filename(file.filename)
        ext = Path(safe_name).suffix.lower()
        if ext not in settings.allowed_extensions:
            raise ValidationError(f"不支持的文件扩展名。允许的扩展名: {', '.join(settings.allowed_extensions)}")

        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > settings.max_upload_size:
            raise ValidationError(f"文件大小超过限制。最大允许: {settings.max_upload_size} bytes")

        header = file.file.read(2048)
        file.file.seek(0)

        kind = filetype.guess(header)
        if kind is None:
            if ext in TEXT_BASED_EXTENSIONS:
                guessed_mime = TEXT_BASED_EXTENSIONS[ext]
                if guessed_mime not in settings.allowed_mime_types:
                    raise ValidationError(f"不支持的文件类型。检测到的MIME类型: {guessed_mime}")
            else:
                raise ValidationError("无法识别的文件类型")
        elif kind.mime not in settings.allowed_mime_types:
            raise ValidationError(f"不支持的文件类型。检测到的MIME类型: {kind.mime}")

        filename = f"{datetime.now(timezone.utc).strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
        upload_path = Path(settings.upload_dir)
        upload_path.mkdir(parents=True, exist_ok=True)
        file_path = get_safe_file_path(settings.upload_dir, filename)

        with Path(file_path).open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        url = str(request.url_for("static", path=f"uploads/{filename}"))

        return FileUploadResponse(url=url, filename=filename)

    except (ValidationError, FileProcessingError):
        raise
    except Exception:
        logger.exception("文件上传失败")
        raise FileProcessingError("文件上传失败，请稍后重试")
