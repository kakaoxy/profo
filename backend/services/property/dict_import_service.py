"""楼盘字典导入任务服务（SRS FR-08 / Task 2.4 / 3.1）.

复用 PropertyImportTask 任务模式：上传保存 → 建任务 → 后台线程装载 →
任务历史查询。上传暂存 ``temp/uploads``，失败明细/原始包归档 90 天由
``temp/uploads/bd_archive`` 承担（应用内启动 + 每日巡检清理）。

口径（承载力报告 L2-⑥）：SRS 的「≤2GB」承诺已被 nginx 100M 网关限制否决，
可执行口径为「单包压缩 ≤100MB、解压总量 ≤1GB」；大包按批次目录拆分分批导入
（幂等，重传不重复入库）。
"""

import logging
import threading
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy import text
from sqlalchemy.orm import Session

from models import BdImportTask, ImportTaskStatus
from services.property.dict_import_loader import ARCHIVE_DAYS, MAX_UPLOAD_BYTES, DictImportProcessor
from services.system.exceptions import ConflictError, FileProcessingError
from settings import settings

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path.cwd() / settings.import_upload_dir
_OVERSIZE_MSG = "文件超过 2GB 上限"
# M5 上传互斥提示（承载力报告 §5.1）
_IN_PROGRESS_MSG = "已有导入任务进行中，请等待完成后再上传"
# P4 修复：BdImportTask.filename 为 String(255)，超长文件名原实现会写盘成功、
# DB commit 失败（StringDataRightTruncation → 500）并留下无任务指向的孤儿文件。
# 入口显式校验 → 422 明确提示（而不是 500「数据格式错误」）。
_MAX_FILENAME_LEN = 255
# 多 worker 部署下 create_task 互斥检查用的事务级 advisory lock key
# （固定 bigint；与其他迁移/业务锁取值隔离；事务结束自动释放）
_IMPORT_ADVISORY_LOCK_KEY = 202610170001


def _oversize_error() -> FileProcessingError:
    """构造超限错误（统一文案，供预检与流式写盘两处使用）."""
    return FileProcessingError(_OVERSIZE_MSG)


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
            ConflictError: 已有进行中的导入任务（pending/processing）

        """
        filename = file.filename or "unnamed"
        if not (filename.lower().endswith(".zip") or filename.lower().endswith(".txt")):
            msg = "只支持 zip 包或 txt 文件"
            raise FileProcessingError(msg)
        # P4：filename 列 String(255)，超长会在 db.commit 时抛 DB 异常（500）并留下孤儿文件
        if len(filename) > _MAX_FILENAME_LEN:
            msg = f"文件名过长（{len(filename)} 字符，上限 {_MAX_FILENAME_LEN}），请重命名后上传"
            raise FileProcessingError(msg)

        # M5 修复（承载力报告 L2-②）：上传互斥。导入是 backend 容器内同进程
        # 后台线程的重内存操作，两个任务并发 = 内存叠加（全量包实测可达数百 MB
        # 级）→ 512m 容器限额下必超限。导入链路无进程内状态锁可用（多 worker），
        # 以事务级 advisory lock（pg_try_advisory_xact_lock）从检查点持有到
        # 任务行 commit 才释放（异常回滚自动释放），精确覆盖「检查→建任务」
        # 全程竞态窗口：占用期间直接 409，占不到锁同样 409。
        lock_row = db.execute(text("SELECT pg_try_advisory_xact_lock(:k)"), {"k": _IMPORT_ADVISORY_LOCK_KEY}).scalar()
        if not lock_row:
            raise ConflictError(_IN_PROGRESS_MSG) from None
        active = (
            db.query(BdImportTask)
            .filter(BdImportTask.status.in_([ImportTaskStatus.PENDING, ImportTaskStatus.PROCESSING]))
            .order_by(BdImportTask.created_at.desc())
            .first()
        )
        if active:
            raise ConflictError(_IN_PROGRESS_MSG) from None

        # M3 修复：先按 Content-Length 预检（避免 2GB 文件全量读入内存后才报错 OOM）
        declared = file.size
        if declared is not None and declared > MAX_UPLOAD_BYTES:
            raise _oversize_error() from None

        _ensure_upload_dir()
        # M3 修复：分块流式写盘（原 await file.read() 全量读内存，2GB 上限下可 OOM）
        task_id = str(uuid.uuid4())
        suffix = ".zip" if filename.lower().endswith(".zip") else ".txt"
        stored_path = UPLOAD_DIR / f"bd_{task_id}{suffix}"
        file_size = 0
        try:
            with stored_path.open("wb") as out:
                while chunk := await file.read(1 << 20):  # 1MB 分块
                    file_size += len(chunk)
                    if file_size > MAX_UPLOAD_BYTES:
                        stored_path.unlink(missing_ok=True)
                        raise _oversize_error() from None
                    out.write(chunk)
        except FileProcessingError:
            stored_path.unlink(missing_ok=True)
            raise

        task = BdImportTask(
            id=task_id,
            user_id=user_id,
            status=ImportTaskStatus.PENDING,
            filename=filename,
            file_path=str(stored_path),
            file_size=file_size,
        )
        db.add(task)
        try:
            db.commit()
        except Exception:
            # P4 修复：DB 写失败时清理已落盘文件（原实现只捕获 FileProcessingError，
            # 其他 DB 异常会留下无任务行指向的孤儿文件，直到 90 天归档清理才回收）。
            db.rollback()
            stored_path.unlink(missing_ok=True)
            logger.exception("字典导入任务落库失败，已清理临时文件: %s", stored_path)
            raise
        db.refresh(task)
        logger.info("字典导入任务已创建: %s (%s, %d bytes)", task_id, filename, file_size)
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
        """清理超期归档文件（90 天，NFR-02）.

        范围：``temp/uploads`` 下的
        - ``bd_archive/`` 失败明细 csv；
        - ``bd_*.{zip,txt}`` 原始上传包（装载完成/失败后仍留在盘上，
          报告 §4.2-2：原实现无任何调用方且不清理原始文件，任务堆积后
          磁盘不可控且任务记录的 file_path 失效无法复核）。

        由 lifespan 启动时与每日巡检后台任务调用（报告修复项 #2）。
        """
        cutoff = datetime.now(timezone.utc) - timedelta(days=ARCHIVE_DAYS)
        removed = 0
        if not UPLOAD_DIR.exists():
            return 0
        # 1) 失败明细归档目录
        archive_dir = UPLOAD_DIR / "bd_archive"
        if archive_dir.exists():
            for f in archive_dir.iterdir():
                if f.is_file() and datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc) < cutoff:
                    f.unlink(missing_ok=True)
                    removed += 1
        # 2) 原始上传包（bd_{uuid}.zip / bd_{uuid}.txt）
        for f in UPLOAD_DIR.glob("bd_*"):
            if (
                f.is_file()
                and f.suffix.lower() in (".zip", ".txt")
                and datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc) < cutoff
            ):
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
