"""房源导入任务管理服务.

负责任务的创建、状态更新、查询.
"""

import logging
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from models import ImportTaskStatus, PropertyImportTask
from services.system.exceptions import FileProcessingError
from settings import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path.cwd() / settings.import_upload_dir


class ImportTaskService:
    """导入任务管理服务."""

    def __init__(self) -> None:
        """初始化服务，确保上传目录存在."""
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    async def create_task(self, file: UploadFile, user_id: int, db: Session) -> PropertyImportTask:
        """创建新的导入任务.

        1. 保存上传的文件到临时目录
        2. 创建任务记录
        3. 返回任务对象
        """
        task_id = str(uuid.uuid4())

        file_path = UPLOAD_DIR / f"{task_id}.csv"

        try:
            content = await file.read()
            file_size = len(content)

            file_path.write_bytes(content)

            logger.info("文件已保存: %s, 大小: %s bytes", file_path, file_size)
        except Exception as e:
            logger.exception("保存上传文件时出错")
            msg = "保存上传文件失败"
            raise FileProcessingError(msg) from e

        task = PropertyImportTask(
            id=task_id,
            user_id=user_id,
            status=ImportTaskStatus.PENDING.value,
            filename=file.filename,
            file_path=str(file_path),
            file_size=file_size,
            total_records=0,
            processed_records=0,
            success_count=0,
            failed_count=0,
            progress_percent=0.0,
            created_at=datetime.now(timezone.utc),
        )

        db.add(task)
        db.commit()
        db.refresh(task)

        logger.info("导入任务已创建: %s, 用户: %s, 文件: %s", task_id, user_id, file.filename)
        return task

    def get_task(self, task_id: str, db: Session) -> PropertyImportTask | None:
        """获取任务信息."""
        return db.query(PropertyImportTask).filter(PropertyImportTask.id == task_id).first()

    def get_user_tasks(
        self,
        user_id: int,
        db: Session,
        status: str | None = None,
        limit: int = 10,
    ) -> list[PropertyImportTask]:
        """获取用户的任务列表."""
        query = db.query(PropertyImportTask).filter(PropertyImportTask.user_id == user_id)

        if status:
            query = query.filter(PropertyImportTask.status == status)

        return query.order_by(PropertyImportTask.created_at.desc()).limit(limit).all()

    def update_task_status(
        self,
        task_id: str,
        status: ImportTaskStatus,
        db: Session,
        error_message: str | None = None,
        failed_file_url: str | None = None,
    ) -> None:
        """更新任务状态."""
        task = self.get_task(task_id, db)
        if not task:
            logger.warning("任务不存在: %s", task_id)
            return

        task.status = status.value

        if status == ImportTaskStatus.PROCESSING and not task.started_at:
            task.started_at = datetime.now(timezone.utc)

        if status in (ImportTaskStatus.COMPLETED, ImportTaskStatus.FAILED, ImportTaskStatus.CANCELLED):
            task.completed_at = datetime.now(timezone.utc)
            if task.started_at:
                task.processing_duration = (task.completed_at - task.started_at).total_seconds()

        if error_message:
            task.error_message = error_message

        if failed_file_url:
            task.failed_file_url = failed_file_url

        db.commit()
        logger.info("任务状态更新: %s -> %s", task_id, status.value)

    def update_task_progress(  # noqa: PLR0913
        self,
        task_id: str,
        processed: int,
        success: int,
        failed: int,
        total: int,
        db: Session,
    ) -> None:
        """更新任务进度."""
        task = self.get_task(task_id, db)
        if not task:
            return

        task.processed_records = processed
        task.success_count = success
        task.failed_count = failed
        task.total_records = total

        if total > 0:
            task.progress_percent = round((processed / total) * 100, 2)

        db.commit()

    def cancel_task(self, task_id: str, user_id: int, db: Session) -> bool:
        """取消任务（仅允许取消待处理或处理中的任务）."""
        task = (
            db.query(PropertyImportTask)
            .filter(
                PropertyImportTask.id == task_id,
                PropertyImportTask.user_id == user_id,
            )
            .first()
        )

        if not task:
            return False

        if task.status not in (ImportTaskStatus.PENDING.value, ImportTaskStatus.PROCESSING.value):
            return False

        self.update_task_status(task_id, ImportTaskStatus.CANCELLED, db)
        return True

    def cleanup_task_file(self, task_id: str, db: Session) -> None:
        """清理任务文件."""
        task = self.get_task(task_id, db)
        if task:
            fp = Path(task.file_path)
            if fp.exists():
                try:
                    fp.unlink()
                    logger.info("任务文件已清理: %s", task.file_path)
                except Exception:  # noqa: BLE001
                    logger.warning("清理任务文件失败: %s", task.file_path)


_import_task_service: ImportTaskService | None = None


def get_import_task_service() -> ImportTaskService:
    """获取导入任务服务实例（单例）."""
    global _import_task_service  # noqa: PLW0603
    if _import_task_service is None:
        _import_task_service = ImportTaskService()
    return _import_task_service
