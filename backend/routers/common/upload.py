"""CSV 文件上传路由.

处理 CSV 文件的上传、异步导入任务管理.
"""

import logging
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel

from common import RateLimits, limiter
from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from models import ImportTaskStatus
from schemas import ImportTaskCreateResponse, ImportTaskStatusResponse
from services.market import get_import_task_service, start_import_task
from services.system.exceptions import FileProcessingError, ResourceNotFoundError
from settings import settings
from utils.file_security import get_safe_file_path, is_safe_path


class CancelTaskResponse(BaseModel):
    """取消任务响应."""

    message: str
    task_id: str


logger = logging.getLogger(__name__)

router = APIRouter(tags=["upload"])


@router.post("/csv")
@limiter.limit(RateLimits.CSV_IMPORT)
async def create_import_task(
    request: Request,
    file: Annotated[UploadFile, File(description="CSV 文件")],
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> ImportTaskCreateResponse:
    """上传 CSV 文件并创建异步导入任务.

    流程：
    1. 验证文件格式和大小
    2. 保存文件并创建导入任务记录
    3. 启动后台任务处理导入
    4. 立即返回任务ID，前端可通过 /tasks/{task_id} 查询进度

    速率限制：30次/小时
    """
    if not file.filename.endswith(".csv"):
        msg = "只支持 CSV 文件格式"
        raise FileProcessingError(msg)

    logger.info("接收到 CSV 文件: %s, 用户: %s", file.filename, current_user.id)

    task_service = get_import_task_service()
    task = await task_service.create_task(file, current_user.id, db)

    try:
        start_import_task(task.id)
        logger.info("导入任务已创建并启动: %s", task.id)
    except Exception:
        logger.exception("启动导入任务失败: %s", task.id)
        task_service.update_task_status(
            task.id,
            ImportTaskStatus.FAILED,
            db,
            error_message=f"启动后台处理任务失败: {task.id}",
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="导入任务启动失败，请稍后重试",
        ) from None

    return ImportTaskCreateResponse(
        task_id=task.id,
        status=ImportTaskStatus.PENDING.value,
        message="导入任务已创建，正在后台处理中",
    )


@router.get("/tasks/{task_id}")
def get_task_status(
    task_id: str,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> ImportTaskStatusResponse:
    """查询导入任务状态和进度.

    前端应轮询此接口获取任务进度，建议每 2-3 秒查询一次
    """
    task_service = get_import_task_service()
    task = task_service.get_task(task_id, db)

    if not task:
        msg = "任务不存在"
        raise ResourceNotFoundError(msg)

    if task.user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权查看此任务",
        )

    return ImportTaskStatusResponse.model_validate(task)


@router.get("/tasks")
def list_tasks(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    status: Annotated[
        str | None,
        Query(description="按状态筛选: pending/processing/completed/failed/cancelled"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=50, description="返回数量限制")] = 10,
) -> list[ImportTaskStatusResponse]:
    """获取当前用户的导入任务列表.

    默认返回最近 10 条任务，按创建时间倒序排列
    """
    task_service = get_import_task_service()
    tasks = task_service.get_user_tasks(current_user.id, db, status=status, limit=limit)

    return [ImportTaskStatusResponse.model_validate(task) for task in tasks]


@router.post("/tasks/{task_id}/cancel")
def cancel_task(
    task_id: str,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> CancelTaskResponse:
    """取消导入任务.

    只能取消 pending 或 processing 状态的任务
    """
    task_service = get_import_task_service()
    success = task_service.cancel_task(task_id, current_user.id, db)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="任务不存在或无法取消（只能取消待处理或处理中的任务）",
        )

    return CancelTaskResponse(message="任务已取消", task_id=task_id)


@router.get("/download/{filename}")
def download_failed_file(
    filename: str,
    _current_user: CurrentInternalUserDep,
) -> FileResponse:
    """下载失败记录文件.

    注意：使用 def 避免文件操作阻塞
    已修复：使用安全的文件路径验证，防止目录遍历攻击.
    """
    temp_dir = Path.cwd() / settings.import_upload_dir
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        filepath = get_safe_file_path(str(temp_dir), filename)
    except ValueError as e:
        logger.warning("检测到非法文件名尝试: %s, 错误: %s", filename, e)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="无效的文件名",
        ) from e

    file_path = Path(filepath)
    if not file_path.exists() or file_path.is_dir():
        msg = "文件不存在或已过期"
        raise ResourceNotFoundError(msg)

    if not is_safe_path(str(temp_dir), filepath):
        logger.error("路径安全检查失败: %s", filepath)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="访问被拒绝",
        )

    safe_filename = file_path.name

    return FileResponse(
        path=filepath,
        filename=safe_filename,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )
