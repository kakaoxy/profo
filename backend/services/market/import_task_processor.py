"""房源导入任务后台处理器.

在后台线程中执行 CSV 导入任务.

文件行数说明：
本文件约360行代码（超过250行限制）。未进一步拆分的原因：
1. 核心处理逻辑（ImportTaskProcessor类）是高内聚的，拆分会破坏流程完整性
2. 已将CSV解析（csv_parser.py）和失败记录处理（failed_record_handler.py）拆分为独立模块
3. 剩余代码是任务处理的主流程，包括：任务准备->分批处理->结果处理->错误处理
4. 各方法职责清晰，按处理阶段划分，具有良好的可读性和可维护性
"""

import logging
import threading
from typing import Any

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from models import ImportTaskStatus
from schemas import PropertyIngestionModel
from services.market.csv_parser import CSVParser
from services.market.failed_record_handler import FailedRecordHandler
from services.market.import_task_service import UPLOAD_DIR, ImportTaskService, get_import_task_service
from services.market.importer import PropertyImporter
from settings import settings
from utils.error_formatters import format_validation_error

logger = logging.getLogger(__name__)

_processing_lock = threading.Lock()

BATCH_SIZE = 100


class ImportTaskProcessor:
    """导入任务处理器.

    在独立线程中执行导入任务，支持进度更新和取消检测
    """

    def __init__(self) -> None:
        """初始化处理器."""
        self.importer = PropertyImporter()
        self.csv_parser = CSVParser()
        self.failed_handler = FailedRecordHandler(str(UPLOAD_DIR))

        self.engine = create_engine(
            settings.database_url,
            connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
            pool_pre_ping=True,
            pool_recycle=3600,
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def process_task(self, task_id: str) -> None:
        """处理导入任务的主入口.

        在独立线程中执行.
        """
        thread_name = threading.current_thread().name
        logger.info("[%s] 开始处理导入任务: %s", thread_name, task_id)

        db = self.SessionLocal()
        task_service = get_import_task_service()

        try:
            if not self._prepare_task(task_id, db, task_service):
                return

            result = self._execute_import(task_id, db, task_service)

            self._finalize_task(task_id, result, db, task_service)

            logger.info("[%s] 导入任务处理完成: %s", thread_name, task_id)

        except Exception as e:
            logger.exception("处理导入任务时发生错误")
            self._handle_task_error(task_id, e, db, task_service)
        finally:
            db.close()

    def _prepare_task(
        self,
        task_id: str,
        db: Session,
        task_service: ImportTaskService,
    ) -> bool:
        """准备任务，检查并更新状态为处理中."""
        task = task_service.get_task(task_id, db)
        if not task:
            logger.error("任务不存在: %s", task_id)
            return False

        if task.status == ImportTaskStatus.CANCELLED.value:
            logger.info("任务已被取消，跳过处理: %s", task_id)
            return False

        task_service.update_task_status(task_id, ImportTaskStatus.PROCESSING, db)
        return True

    def _execute_import(
        self,
        task_id: str,
        db: Session,
        task_service: ImportTaskService,
    ) -> dict[str, Any]:
        """执行实际的 CSV 导入逻辑."""
        task = task_service.get_task(task_id, db)
        if not task:
            return {"success": False, "error": "任务不存在"}

        rows, original_headers = self.csv_parser.parse_file(task.file_path)
        total = len(rows)

        logger.info("[%s] CSV 解析完成: 共 %s 条记录", task_id, total)

        task.total_records = total
        db.commit()

        result = self._process_batches(
            task_id,
            rows,
            total,
            db,
            task_service,
        )

        if result.get("failed_records"):
            result["failed_file_url"] = self.failed_handler.generate_failed_csv(
                result["failed_records"],
                original_headers,
                task_id,
            )

        return result

    def _process_batches(
        self,
        task_id: str,
        rows: list,
        total: int,
        db: Session,
        task_service: ImportTaskService,
    ) -> dict[str, Any]:
        """分批处理数据."""
        processed = 0
        success = 0
        failed = 0
        failed_records = []

        for batch_start in range(0, total, BATCH_SIZE):
            db.refresh(task_service.get_task(task_id, db))
            task = task_service.get_task(task_id, db)
            if task and task.status == ImportTaskStatus.CANCELLED.value:
                logger.info("[%s] 任务被取消，停止处理", task_id)
                return {"cancelled": True}

            batch_result = self._process_single_batch(
                task_id,
                rows,
                batch_start,
                total,
                db,
            )

            processed += batch_result["processed"]
            success += batch_result["success"]
            failed += batch_result["failed"]
            failed_records.extend(batch_result["failed_records"])

            self._commit_batch(task_id, processed, success, failed, total, db, task_service)

        return {
            "success": True,
            "total": total,
            "success_count": success,
            "failed_count": failed,
            "failed_records": failed_records,
        }

    def _process_single_batch(
        self,
        task_id: str,
        rows: list,
        batch_start: int,
        total: int,
        db: Session,
    ) -> dict[str, Any]:
        """处理单个批次."""
        batch_end = min(batch_start + BATCH_SIZE, total)
        batch_rows = rows[batch_start:batch_end]

        processed = 0
        success = 0
        failed = 0
        failed_records: list = []

        for idx_in_batch, row in enumerate(batch_rows):
            global_index = batch_start + idx_in_batch + 1

            validation_result = self._validate_row(row)
            if validation_result["error"]:
                failed += 1
                failed_records.append(
                    {
                        "row_number": global_index,
                        "data": row,
                        "error": validation_result["error"],
                    },
                )
                self.failed_handler.save_failed_record_sync(row, validation_result["error"], task_id)
                processed += 1
                continue

            import_result = self._import_row(validation_result["data"], db)
            if import_result["success"]:
                success += 1
            else:
                failed += 1
                failed_records.append(
                    {
                        "row_number": global_index,
                        "data": row,
                        "error": import_result["error"],
                    },
                )
                self.failed_handler.save_failed_record_sync(
                    row,
                    import_result["error"] or "导入失败",
                    task_id,
                )

            processed += 1

        return {
            "processed": processed,
            "success": success,
            "failed": failed,
            "failed_records": failed_records,
        }

    def _validate_row(self, row: dict) -> dict[str, Any]:
        """验证单行数据."""
        try:
            validated_data = PropertyIngestionModel(**row)
        except ValidationError as e:
            error_msg = format_validation_error(e)
            return {"data": None, "error": error_msg}
        except Exception as e:  # noqa: BLE001
            error_msg = f"数据验证异常: {e!s}"
            return {"data": None, "error": error_msg}
        else:
            return {"data": validated_data, "error": None}

    def _import_row(
        self,
        validated_data: PropertyIngestionModel,
        db: Session,
    ) -> dict[str, Any]:
        """导入单行数据."""
        try:
            result = self.importer.import_property(validated_data, db)
        except Exception as e:  # noqa: BLE001
            return {"success": False, "error": f"导入异常: {e!s}"}
        else:
            return {"success": result.success, "error": result.error}

    def _commit_batch(  # noqa: PLR0913
        self,
        task_id: str,
        processed: int,
        success: int,
        failed: int,
        total: int,
        db: Session,
        task_service: ImportTaskService,
    ) -> None:
        """提交批次并更新进度."""
        try:
            db.commit()
            task_service.update_task_progress(task_id, processed, success, failed, total, db)
            logger.info("[%s] 进度更新: %s/%s", task_id, processed, total)
        except Exception:
            db.rollback()
            logger.exception("[%s] 批次提交失败", task_id)
            raise

    def _finalize_task(
        self,
        task_id: str,
        result: dict[str, Any],
        db: Session,
        task_service: ImportTaskService,
    ) -> None:
        """完成任务，更新最终状态."""
        if result.get("cancelled"):
            task_service.update_task_status(task_id, ImportTaskStatus.CANCELLED, db)
        elif result.get("success"):
            task_service.update_task_status(
                task_id,
                ImportTaskStatus.COMPLETED,
                db,
                failed_file_url=result.get("failed_file_url"),
            )
        else:
            task_service.update_task_status(
                task_id,
                ImportTaskStatus.FAILED,
                db,
                error_message=result.get("error", "未知错误"),
            )

    def _handle_task_error(
        self,
        task_id: str,
        error: Exception,
        db: Session,
        task_service: ImportTaskService,
    ) -> None:
        """处理任务错误."""
        try:
            task_service.update_task_status(
                task_id,
                ImportTaskStatus.FAILED,
                db,
                error_message=str(error),
            )
        except Exception:
            logger.exception("更新任务失败状态时出错")


_processor: ImportTaskProcessor | None = None


def get_task_processor() -> ImportTaskProcessor:
    """获取任务处理器实例（单例）."""
    global _processor  # noqa: PLW0603
    if _processor is None:
        _processor = ImportTaskProcessor()
    return _processor


def start_import_task(task_id: str) -> None:
    """启动导入任务（在后台线程中执行）.

    这个函数应该在 API 路由中调用，创建后台线程处理任务
    """
    processor = get_task_processor()

    def run_task() -> None:
        with _processing_lock:
            processor.process_task(task_id)

    thread = threading.Thread(target=run_task, name=f"ImportTask-{task_id[:8]}")
    thread.daemon = True
    thread.start()

    logger.info("导入任务已在后台启动: %s", task_id)
