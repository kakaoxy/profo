"""楼盘字典导入任务服务（SRS FR-08 / Task 2.4 / 3.1）.

复用 PropertyImportTask 任务模式：上传保存 → 建任务 → 后台线程装载 →
任务历史查询。上传（zip/txt ≤2GB）暂存 ``temp/uploads``，失败明细/原始包
归档 90 天由 ``temp/uploads/bd_archive`` 承担（部署侧定期清理）。
"""

import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from models import BdImportTask, ImportTaskStatus
from services.property.dict_import_loader import ARCHIVE_DAYS, MAX_UPLOAD_BYTES, DictImportProcessor
from services.system.exceptions import FileProcessingError
from settings import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path.cwd() / settings.import_upload_dir


def _ensure_upload_dir() -> None:
    """确保上传目录存在."""
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


class BdImportTaskService:
    """楼盘字典导入任务服务."""

    async def create_task(self, file: UploadFile, user_id: str, db: Session) -> BdImportTask:
        """保存上传文件并创建导入任务.

        Args:
            file: 上传文件（zip 或 txt）
            user_id: 操作人用户 ID
            db: 数据库会话

        Returns:
            创建的 BdImportTask

        Raises:
            FileProcessingError: 文件格式或大小不合法

        """
        filename = file.filename or "unnamed"
        if not (filename.lower().endswith(".zip") or filename.lower().endswith(".txt")):
            msg = "只支持 zip 包或 txt 文件"
            raise FileProcessingError(msg)

        _ensure_upload_dir()
        data = await file.read()
        if len(data) > MAX_UPLOAD_BYTES:
            msg = "文件超过 2GB 上限"
            raise FileProcessingError(msg)

        task_id = str(uuid.uuid4())
        suffix = ".zip" if filename.lower().endswith(".zip") else ".txt"
        stored_path = UPLOAD_DIR / f"bd_{task_id}{suffix}"
        stored_path.write_bytes(data)

        task = BdImportTask(
            id=task_id,
            user_id=user_id,
            status=ImportTaskStatus.PENDING,
            filename=filename,
            file_path=str(stored_path),
            file_size=len(data),
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        logger.info("字典导入任务已创建: %s (%s, %d bytes)", task_id, filename, len(data))
        return task

    def start_task(self, task_id: str) -> None:
        """在后台线程启动装载."""
        processor = DictImportProcessor(__import__("db", fromlist=["engine"]).engine)

        def run() -> None:
            processor.process_task(task_id)

        thread = threading.Thread(target=run, name=f"BdImportTask-{task_id[:8]}")
        thread.daemon = True
        thread.start()
        logger.info("字典导入任务已在后台启动: %s", task_id)

    def get_task(self, task_id: str, db: Session) -> BdImportTask | None:
        """按 ID 查询任务."""
        return db.get(BdImportTask, task_id)

    def list_tasks(self, db: Session, page: int = 1, page_size: int = 20) -> tuple[int, list[BdImportTask]]:
        """任务历史（创建时间倒序分页）."""
        query = db.query(BdImportTask)
        total = query.count()
        items = query.order_by(BdImportTask.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        return total, items

    def update_task_status(
        self,
        task_id: str,
        status: ImportTaskStatus,
        db: Session,
        error_message: str | None = None,
    ) -> None:
        """更新任务状态（取消/启动失败等场景）."""
        task = db.get(BdImportTask, task_id)
        if not task:
            return
        task.status = status
        if error_message:
            task.error_message = error_message
        if status in (ImportTaskStatus.FAILED, ImportTaskStatus.CANCELLED):
            task.completed_at = datetime.now(timezone.utc)
        db.commit()

    @staticmethod
    def cleanup_expired_archives() -> int:
        """清理超期归档文件（90 天，NFR-02；可由运维定时触发）."""
        cutoff = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_DAYS)
        archive_dir = UPLOAD_DIR / "bd_archive"
        if not archive_dir.exists():
            return 0
        removed = 0
        for f in archive_dir.iterdir():
            if f.is_file() and datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc) < cutoff:
                f.unlink(missing_ok=True)
                removed += 1
        return removed


_service: BdImportTaskService | None = None


def get_bd_import_task_service() -> BdImportTaskService:
    """获取服务单例."""
    global _service
    if _service is None:
        _service = BdImportTaskService()
    return _service
