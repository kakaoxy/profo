from typing import Annotated
from fastapi import APIRouter, UploadFile, File, HTTPException, status, Depends
from sqlalchemy.orm import Session
import os
import shutil
import uuid
import filetype
import logging
from datetime import datetime
from pathlib import Path, PurePath
from pydantic import BaseModel
from settings import settings
from db import get_db
from dependencies.auth import CurrentOperatorUserDep

router = APIRouter(tags=["文件管理"])
logger = logging.getLogger(__name__)


class FileUploadResponse(BaseModel):
    url: str
    filename: str


@router.post("/upload", summary="上传文件", response_model=FileUploadResponse)
def upload_file(
    current_user: CurrentOperatorUserDep,
    file: Annotated[UploadFile, File()],
    db: Session = Depends(get_db),
) -> FileUploadResponse:
    """
    Handle file upload (Sync - Run in threadpool by FastAPI)
    Optimized to read only first 2KB for MIME check.
    """
    try:
        ext = os.path.splitext(file.filename)[1].lower()
        if ext not in settings.allowed_extensions:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的文件扩展名。允许的扩展名: {', '.join(settings.allowed_extensions)}"
            )

        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > settings.max_upload_size:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"文件大小超过限制。最大允许: {settings.max_upload_size} bytes"
            )

        header = file.file.read(2048)
        file.file.seek(0)

        kind = filetype.guess(header)
        if kind is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无法识别的文件类型")

        if kind.mime not in settings.allowed_mime_types:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持的文件类型。检测到的MIME类型: {kind.mime}"
            )

        filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
        upload_path = Path(settings.upload_dir)
        upload_path.mkdir(parents=True, exist_ok=True)
        file_path = upload_path / filename

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        url = f"/{PurePath(settings.upload_dir).as_posix()}/{filename}"

        return FileUploadResponse(url=url, filename=filename)

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"文件上传失败: {str(e)}")
