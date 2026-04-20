"""
CSV 文件上传路由
处理 CSV 文件的上传、解析和批量导入
"""
from typing import Annotated

from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse
import os
import logging

from schemas import UploadResult
from exceptions import FileProcessingException, ResourceNotFoundException
from dependencies.auth import DbSessionDep, CurrentInternalUserDep
from services.market import CSVBatchImporter
from models import User

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/csv", response_model=UploadResult)
def upload_csv(
    file: Annotated[UploadFile, File(description="CSV 文件")],
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> UploadResult:
    """
    上传并处理 CSV 文件
    注意：使用 def 而非 async def，以便在线程池中运行，避免阻塞主循环
    """
    if not file.filename.endswith('.csv'):
        raise FileProcessingException(
            message="只支持 CSV 文件格式",
            details={"filename": file.filename, "allowed_formats": [".csv"]}
        )

    logger.info(f"接收到 CSV 文件: {file.filename}")

    importer = CSVBatchImporter()
    result = importer.batch_import_csv(file, db)
    return result


@router.get("/download/{filename}")
def download_failed_records(
    filename: str,
    current_user: CurrentInternalUserDep,
) -> FileResponse:
    """
    下载失败记录文件
    注意：使用 def 避免文件操作阻塞
    """
    temp_dir = os.path.join(os.getcwd(), 'temp')
    filepath = os.path.join(temp_dir, filename)

    if not os.path.exists(filepath):
        raise ResourceNotFoundException(
            message="文件不存在或已过期",
            details={"filename": filename}
        )

    return FileResponse(
        path=filepath,
        filename=filename,
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{filename}"'}
    )