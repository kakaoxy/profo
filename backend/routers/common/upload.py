"""
CSV 文件上传路由
处理 CSV 文件的上传、异步导入任务管理
"""
from typing import Annotated

from fastapi import APIRouter, UploadFile, File, HTTPException, status, Request, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
import os
import logging

from schemas import (
    UploadResult, 
    ImportTaskCreateResponse, 
    ImportTaskStatusResponse
)


class CancelTaskResponse(BaseModel):
    """取消任务响应"""
    message: str
    task_id: str
from exceptions import FileProcessingException, ResourceNotFoundException
from dependencies.auth import DbSessionDep, CurrentInternalUserDep
from services.market import (
    CSVBatchImporter, 
    get_import_task_service,
    start_import_task
)
from models import User, PropertyImportTask, ImportTaskStatus
from utils.file_security import get_safe_file_path, is_safe_path
from common import limiter

logger = logging.getLogger(__name__)

router = APIRouter(tags=["upload"])


@router.post("/csv", response_model=ImportTaskCreateResponse)
@limiter.limit("30/hour")
async def create_import_task(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV 文件")],
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> ImportTaskCreateResponse:
    """
    上传 CSV 文件并创建异步导入任务
    
    流程：
    1. 验证文件格式和大小
    2. 保存文件并创建导入任务记录
    3. 启动后台任务处理导入
    4. 立即返回任务ID，前端可通过 /tasks/{task_id} 查询进度
    
    速率限制：30次/小时
    """
    if not file.filename.endswith('.csv'):
        raise FileProcessingException(
            message="只支持 CSV 文件格式",
            details={"filename": file.filename, "allowed_formats": [".csv"]}
        )

    logger.info(f"接收到 CSV 文件: {file.filename}, 用户: {current_user.id}")

    # 创建导入任务
    task_service = get_import_task_service()
    task = await task_service.create_task(file, current_user.id, db)
    
    # 启动后台处理任务
    start_import_task(task.id)
    
    logger.info(f"导入任务已创建并启动: {task.id}")
    
    return ImportTaskCreateResponse(
        task_id=task.id,
        status=ImportTaskStatus.PENDING.value,
        message="导入任务已创建，正在后台处理中"
    )


@router.get("/tasks/{task_id}", response_model=ImportTaskStatusResponse)
def get_task_status(
    task_id: str,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> ImportTaskStatusResponse:
    """
    查询导入任务状态和进度
    
    前端应轮询此接口获取任务进度，建议每 2-3 秒查询一次
    """
    task_service = get_import_task_service()
    task = task_service.get_task(task_id, db)
    
    if not task:
        raise ResourceNotFoundException(
            message="任务不存在",
            details={"task_id": task_id}
        )
    
    # 检查权限（只能查看自己的任务）
    if task.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权查看此任务"
        )
    
    return ImportTaskStatusResponse(
        task_id=task.id,
        status=task.status,
        filename=task.filename,
        total_records=task.total_records,
        processed_records=task.processed_records,
        success_count=task.success_count,
        failed_count=task.failed_count,
        progress_percent=task.progress_percent,
        failed_file_url=task.failed_file_url,
        error_message=task.error_message,
        created_at=task.created_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        processing_duration=task.processing_duration
    )


@router.get("/tasks", response_model=list[ImportTaskStatusResponse])
def list_tasks(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    status: Annotated[str | None, Query(description="按状态筛选: pending/processing/completed/failed/cancelled")] = None,
    limit: Annotated[int, Query(ge=1, le=50, description="返回数量限制")] = 10,
) -> list[ImportTaskStatusResponse]:
    """
    获取当前用户的导入任务列表
    
    默认返回最近 10 条任务，按创建时间倒序排列
    """
    task_service = get_import_task_service()
    tasks = task_service.get_user_tasks(current_user.id, db, status=status, limit=limit)
    
    return [
        ImportTaskStatusResponse(
            task_id=task.id,
            status=task.status,
            filename=task.filename,
            total_records=task.total_records,
            processed_records=task.processed_records,
            success_count=task.success_count,
            failed_count=task.failed_count,
            progress_percent=task.progress_percent,
            failed_file_url=task.failed_file_url,
            error_message=task.error_message,
            created_at=task.created_at,
            started_at=task.started_at,
            completed_at=task.completed_at,
            processing_duration=task.processing_duration
        )
        for task in tasks
    ]


@router.post("/tasks/{task_id}/cancel", response_model=CancelTaskResponse)
def cancel_task(
    task_id: str,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> CancelTaskResponse:
    """
    取消导入任务
    
    只能取消 pending 或 processing 状态的任务
    """
    task_service = get_import_task_service()
    success = task_service.cancel_task(task_id, current_user.id, db)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="任务不存在或无法取消（只能取消待处理或处理中的任务）"
        )
    
    return CancelTaskResponse(message="任务已取消", task_id=task_id)


@router.get("/download/{filename}")
def download_failed_file(
    filename: str,
    current_user: CurrentInternalUserDep,
) -> FileResponse:
    """
    下载失败记录文件
    注意：使用 def 避免文件操作阻塞
    已修复：使用安全的文件路径验证，防止目录遍历攻击
    """
    # 使用安全的临时目录
    temp_dir = os.path.join(os.getcwd(), 'temp', 'uploads')
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


# 保留旧的同步上传接口作为兼容性支持（可选）
@router.post("/csv-sync", response_model=UploadResult, include_in_schema=False)
@limiter.limit("10/hour")
def upload_csv_sync_legacy(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV 文件")],
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> UploadResult:
    """
    [已弃用] 同步上传 CSV 文件
    
    此接口保留用于小文件快速导入（<100条记录），不推荐用于大量数据
    建议使用 /csv 异步接口
    """
    if not file.filename.endswith('.csv'):
        raise FileProcessingException(
            message="只支持 CSV 文件格式",
            details={"filename": file.filename, "allowed_formats": [".csv"]}
        )

    logger.info(f"[同步模式] 接收到 CSV 文件: {file.filename}")

    importer = CSVBatchImporter()
    result = importer.batch_import_csv(file, db)
    return result
