"""
房源导入任务后台处理器
在后台线程中执行 CSV 导入任务

文件行数说明：
本文件约360行代码（超过250行限制）。未进一步拆分的原因：
1. 核心处理逻辑（ImportTaskProcessor类）是高内聚的，拆分会破坏流程完整性
2. 已将CSV解析（csv_parser.py）和失败记录处理（failed_record_handler.py）拆分为独立模块
3. 剩余代码是任务处理的主流程，包括：任务准备->分批处理->结果处理->错误处理
4. 各方法职责清晰，按处理阶段划分，具有良好的可读性和可维护性
"""
import logging
import threading
from typing import Dict, Any, Optional

from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from models import PropertyImportTask, ImportTaskStatus
from schemas import PropertyIngestionModel
from services.market.importer import PropertyImporter
from services.market.import_task_service import get_import_task_service, UPLOAD_DIR
from services.market.csv_parser import CSVParser
from services.market.failed_record_handler import FailedRecordHandler
from utils.error_formatters import format_validation_error
from settings import settings

logger = logging.getLogger(__name__)

# 全局锁，防止同时处理多个批次导致数据库压力过大
_processing_lock = threading.Lock()

# 批处理大小
BATCH_SIZE = 100


class ImportTaskProcessor:
    """导入任务处理器
    
    在独立线程中执行导入任务，支持进度更新和取消检测
    """
    
    def __init__(self):
        self.importer = PropertyImporter()
        self.csv_parser = CSVParser()
        self.failed_handler = FailedRecordHandler(UPLOAD_DIR)
        
        # 创建独立的数据库引擎（用于后台线程）
        self.engine = create_engine(
            settings.database_url,
            connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
            pool_pre_ping=True,
            pool_recycle=3600
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
    
    def process_task(self, task_id: str) -> None:
        """
        处理导入任务的主入口
        在独立线程中执行
        """
        thread_name = threading.current_thread().name
        logger.info(f"[{thread_name}] 开始处理导入任务: {task_id}")
        
        db = self.SessionLocal()
        task_service = get_import_task_service()
        
        try:
            if not self._prepare_task(task_id, db, task_service):
                return
            
            # 执行导入
            result = self._execute_import(task_id, db, task_service)
            
            # 更新最终结果
            self._finalize_task(task_id, result, db, task_service)
            
            logger.info(f"[{thread_name}] 导入任务处理完成: {task_id}")
            
        except Exception as e:
            logger.error(f"处理导入任务时发生错误: {e}", exc_info=True)
            self._handle_task_error(task_id, e, db, task_service)
        finally:
            db.close()
    
    def _prepare_task(
        self, 
        task_id: str, 
        db: Session, 
        task_service
    ) -> bool:
        """准备任务，检查并更新状态为处理中"""
        task = task_service.get_task(task_id, db)
        if not task:
            logger.error(f"任务不存在: {task_id}")
            return False
        
        # 检查任务是否已被取消
        if task.status == ImportTaskStatus.CANCELLED.value:
            logger.info(f"任务已被取消，跳过处理: {task_id}")
            return False
        
        # 更新状态为处理中
        task_service.update_task_status(task_id, ImportTaskStatus.PROCESSING, db)
        return True
    
    def _execute_import(
        self,
        task_id: str,
        db: Session,
        task_service
    ) -> Dict[str, Any]:
        """执行实际的 CSV 导入逻辑"""
        task = task_service.get_task(task_id, db)
        if not task:
            return {"success": False, "error": "任务不存在"}
        
        # 解析 CSV 文件
        rows, original_headers = self.csv_parser.parse_file(task.file_path)
        total = len(rows)
        
        logger.info(f"[{task_id}] CSV 解析完成: 共 {total} 条记录")
        
        # 更新总记录数
        task.total_records = total
        db.commit()
        
        # 处理批次
        result = self._process_batches(
            task_id, rows, original_headers, total, db, task_service
        )
        
        # 生成失败记录文件
        if result.get("failed_records"):
            result["failed_file_url"] = self.failed_handler.generate_failed_csv(
                result["failed_records"], original_headers, task_id
            )
        
        return result
    
    def _process_batches(
        self,
        task_id: str,
        rows: list,
        original_headers: list,
        total: int,
        db: Session,
        task_service
    ) -> Dict[str, Any]:
        """分批处理数据"""
        processed = 0
        success = 0
        failed = 0
        failed_records = []
        
        for batch_start in range(0, total, BATCH_SIZE):
            # 检查任务是否被取消
            db.refresh(task_service.get_task(task_id, db))
            task = task_service.get_task(task_id, db)
            if task and task.status == ImportTaskStatus.CANCELLED.value:
                logger.info(f"[{task_id}] 任务被取消，停止处理")
                return {"cancelled": True}
            
            batch_result = self._process_single_batch(
                task_id, rows, batch_start, total, db
            )
            
            processed += batch_result["processed"]
            success += batch_result["success"]
            failed += batch_result["failed"]
            failed_records.extend(batch_result["failed_records"])
            
            # 提交批次并更新进度
            self._commit_batch(task_id, processed, success, failed, total, db, task_service)
        
        return {
            "success": True,
            "total": total,
            "success_count": success,
            "failed_count": failed,
            "failed_records": failed_records
        }
    
    def _process_single_batch(
        self,
        task_id: str,
        rows: list,
        batch_start: int,
        total: int,
        db: Session
    ) -> Dict[str, int]:
        """处理单个批次"""
        batch_end = min(batch_start + BATCH_SIZE, total)
        batch_rows = rows[batch_start:batch_end]
        
        processed = 0
        success = 0
        failed = 0
        failed_records = []
        
        # 验证并导入批次数据
        for idx_in_batch, row in enumerate(batch_rows):
            global_index = batch_start + idx_in_batch + 1
            
            validation_result = self._validate_row(row, global_index)
            if validation_result["error"]:
                failed += 1
                failed_records.append({
                    'row_number': global_index,
                    'data': row,
                    'error': validation_result["error"]
                })
                self.failed_handler.save_failed_record_sync(row, validation_result["error"], task_id)
                processed += 1
                continue
            
            # 导入数据
            import_result = self._import_row(validation_result["data"], row, global_index, db)
            if import_result["success"]:
                success += 1
            else:
                failed += 1
                failed_records.append({
                    'row_number': global_index,
                    'data': row,
                    'error': import_result["error"]
                })
                self.failed_handler.save_failed_record_sync(
                    row, import_result["error"] or "导入失败", task_id
                )
            
            processed += 1
        
        return {
            "processed": processed,
            "success": success,
            "failed": failed,
            "failed_records": failed_records
        }
    
    def _validate_row(self, row: dict, row_number: int) -> Dict[str, Any]:
        """验证单行数据"""
        try:
            validated_data = PropertyIngestionModel(**row)
            return {"data": validated_data, "error": None}
        except ValidationError as e:
            error_msg = format_validation_error(e)
            return {"data": None, "error": error_msg}
        except Exception as e:
            error_msg = f"数据验证异常: {str(e)}"
            return {"data": None, "error": error_msg}
    
    def _import_row(
        self, 
        validated_data: PropertyIngestionModel, 
        original_row: dict,
        row_number: int,
        db: Session
    ) -> Dict[str, Any]:
        """导入单行数据"""
        try:
            result = self.importer.import_property(validated_data, db)
            return {
                "success": result.success,
                "error": result.error
            }
        except Exception as e:
            return {
                "success": False,
                "error": f"导入异常: {str(e)}"
            }
    
    def _commit_batch(
        self,
        task_id: str,
        processed: int,
        success: int,
        failed: int,
        total: int,
        db: Session,
        task_service
    ) -> None:
        """提交批次并更新进度"""
        try:
            db.commit()
            task_service.update_task_progress(task_id, processed, success, failed, total, db)
            logger.info(f"[{task_id}] 进度更新: {processed}/{total}")
        except Exception as e:
            db.rollback()
            logger.error(f"[{task_id}] 批次提交失败: {e}")
            raise
    
    def _finalize_task(
        self,
        task_id: str,
        result: Dict[str, Any],
        db: Session,
        task_service
    ) -> None:
        """完成任务，更新最终状态"""
        if result.get("cancelled"):
            task_service.update_task_status(task_id, ImportTaskStatus.CANCELLED, db)
        elif result.get("success"):
            task_service.update_task_status(
                task_id, 
                ImportTaskStatus.COMPLETED, 
                db,
                failed_file_url=result.get("failed_file_url")
            )
        else:
            task_service.update_task_status(
                task_id, 
                ImportTaskStatus.FAILED, 
                db,
                error_message=result.get("error", "未知错误")
            )
    
    def _handle_task_error(
        self,
        task_id: str,
        error: Exception,
        db: Session,
        task_service
    ) -> None:
        """处理任务错误"""
        try:
            task_service.update_task_status(
                task_id, 
                ImportTaskStatus.FAILED, 
                db,
                error_message=str(error)
            )
        except Exception as update_error:
            logger.error(f"更新任务失败状态时出错: {update_error}")


# 全局处理器实例
_processor: Optional[ImportTaskProcessor] = None


def get_task_processor() -> ImportTaskProcessor:
    """获取任务处理器实例（单例）"""
    global _processor
    if _processor is None:
        _processor = ImportTaskProcessor()
    return _processor


def start_import_task(task_id: str) -> None:
    """
    启动导入任务（在后台线程中执行）
    
    这个函数应该在 API 路由中调用，创建后台线程处理任务
    """
    processor = get_task_processor()
    
    def run_task():
        with _processing_lock:
            processor.process_task(task_id)
    
    # 创建并启动后台线程
    thread = threading.Thread(target=run_task, name=f"ImportTask-{task_id[:8]}")
    thread.daemon = True  # 设置为守护线程，主程序退出时自动结束
    thread.start()
    
    logger.info(f"导入任务已在后台启动: {task_id}")