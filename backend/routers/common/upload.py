"""
CSV 文件上传路由
处理 CSV 文件的上传、解析和批量导入
"""
from typing import Annotated

from fastapi import APIRouter, UploadFile, File, HTTPException, status, Request
from fastapi.responses import FileResponse
import os
import logging

from schemas import UploadResult
from exceptions import FileProcessingException, ResourceNotFoundException
from dependencies.auth import DbSessionDep, CurrentInternalUserDep
from services.market import CSVBatchImporter
from models import User
from utils.file_security import get_safe_file_path, is_safe_path
from common import limiter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/csv", response_model=UploadResult)
@limiter.limit("30/hour")
def upload_csv(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV 文件")],
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> UploadResult:
    """
    上传并处理 CSV 文件
    注意：使用 def 而非 async def，以便在线程池中运行，避免阻塞主循环
    速率限制：30次/小时（防止资源耗尽攻击）
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
    已修复：使用安全的文件路径验证，防止目录遍历攻击
    """
    # 使用安全的临时目录
    temp_dir = os.path.join(os.getcwd(), 'temp')
    os.makedirs(temp_dir, exist_ok=True)

    try:
        # 使用安全的文件路径获取函数，防止目录遍历攻击
        filepath = get_safe_file_path(temp_dir, filename)
    except ValueError as e:
        logger.warning(f"检测到非法文件名尝试: {filename}, 错误: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的文件名"
        )

    # 二次验证：确保文件存在且不是目录
    if not os.path.exists(filepath) or os.path.isdir(filepath):
        raise ResourceNotFoundException(
            message="文件不存在或已过期",
            details={"filename": filename}
        )

    # 三次验证：确保文件确实在安全目录内（防御性编程）
    if not is_safe_path(temp_dir, filepath):
        logger.error(f"路径安全检查失败: {filepath}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="访问被拒绝"
        )

    # 清理后的安全文件名
    safe_filename = os.path.basename(str(filepath))

    return FileResponse(
        path=str(filepath),
        filename=safe_filename,
        media_type='text/csv',
        headers={'Content-Disposition': f'attachment; filename="{safe_filename}"'}
    )
