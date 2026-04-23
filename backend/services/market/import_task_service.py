"""
房源导入任务管理服务
负责任务的创建、状态更新、查询
"""
import os
import uuid
import logging
from datetime import datetime
from typing import Optional, List

from sqlalchemy.orm import Session
from fastapi import UploadFile

from models import PropertyImportTask, ImportTaskStatus
from exceptions import FileProcessingException

logger = logging.getLogger(__name__)

# 存储上传文件的目录
UPLOAD_DIR = os.path.join(os.getcwd(), "temp", "uploads")


class ImportTaskService:
    """导入任务管理服务"""
    
    def __init__(self):
        os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    async def create_task(self, file: UploadFile, user_id: int, db: Session) -> PropertyImportTask:
        """
        创建新的导入任务

        1. 保存上传的文件到临时目录
        2. 创建任务记录
        3. 返回任务对象
        """
        # 生成任务ID
        task_id = str(uuid.uuid4())

        # 保存文件
        file_path = os.path.join(UPLOAD_DIR, f"{task_id}.csv")

        try:
            # 使用 UploadFile 的 read() 方法安全地读取文件内容
            # 注意：不要使用 file.file.seek(0)，因为 SpooledTemporaryFile 可能不支持 seek
            content = await file.read()
            file_size = len(content)

            with open(file_path, "wb") as f:
                f.write(content)

            logger.info(f"文件已保存: {file_path}, 大小: {file_size} bytes")
        except Exception as e:
            logger.error(f"保存上传文件时出错: {e}")
            raise FileProcessingException(
                message="保存上传文件失败",
                details={"error": str(e), "filename": file.filename}
            )
        
        # 创建任务记录
        task = PropertyImportTask(
            id=task_id,
            user_id=user_id,
            status=ImportTaskStatus.PENDING.value,
            filename=file.filename,
            file_path=file_path,
            file_size=file_size,
            total_records=0,
            processed_records=0,
            success_count=0,
            failed_count=0,
            progress_percent=0.0,
            created_at=datetime.now()
        )
        
        db.add(task)
        db.commit()
        db.refresh(task)
        
        logger.info(f"导入任务已创建: {task_id}, 用户: {user_id}, 文件: {file.filename}")
        return task
    
    def get_task(self, task_id: str, db: Session) -> Optional[PropertyImportTask]:
        """获取任务信息"""
        return db.query(PropertyImportTask).filter(PropertyImportTask.id == task_id).first()
    
    def get_user_tasks(
        self, 
        user_id: int, 
        db: Session, 
        status: Optional[str] = None,
        limit: int = 10
    ) -> List[PropertyImportTask]:
        """获取用户的任务列表"""
        query = db.query(PropertyImportTask).filter(PropertyImportTask.user_id == user_id)
        
        if status:
            query = query.filter(PropertyImportTask.status == status)
        
        return query.order_by(PropertyImportTask.created_at.desc()).limit(limit).all()
    
    def update_task_status(
        self,
        task_id: str,
        status: ImportTaskStatus,
        db: Session,
        error_message: Optional[str] = None,
        failed_file_url: Optional[str] = None
    ) -> None:
        """更新任务状态"""
        task = self.get_task(task_id, db)
        if not task:
            logger.warning(f"任务不存在: {task_id}")
            return
        
        task.status = status.value
        
        if status == ImportTaskStatus.PROCESSING and not task.started_at:
            task.started_at = datetime.now()
        
        if status in (ImportTaskStatus.COMPLETED, ImportTaskStatus.FAILED, ImportTaskStatus.CANCELLED):
            task.completed_at = datetime.now()
            if task.started_at:
                task.processing_duration = (task.completed_at - task.started_at).total_seconds()
        
        if error_message:
            task.error_message = error_message
        
        if failed_file_url:
            task.failed_file_url = failed_file_url
        
        db.commit()
        logger.info(f"任务状态更新: {task_id} -> {status.value}")
    
    def update_task_progress(
        self,
        task_id: str,
        processed: int,
        success: int,
        failed: int,
        total: int,
        db: Session
    ) -> None:
        """更新任务进度"""
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
        """取消任务（仅允许取消待处理或处理中的任务）"""
        task = db.query(PropertyImportTask).filter(
            PropertyImportTask.id == task_id,
            PropertyImportTask.user_id == user_id
        ).first()
        
        if not task:
            return False
        
        if task.status not in (ImportTaskStatus.PENDING.value, ImportTaskStatus.PROCESSING.value):
            return False
        
        self.update_task_status(task_id, ImportTaskStatus.CANCELLED, db)
        return True
    
    def cleanup_task_file(self, task_id: str, db: Session) -> None:
        """清理任务文件"""
        task = self.get_task(task_id, db)
        if task and os.path.exists(task.file_path):
            try:
                os.remove(task.file_path)
                logger.info(f"任务文件已清理: {task.file_path}")
            except Exception as e:
                logger.warning(f"清理任务文件失败: {e}")


# 全局服务实例
_import_task_service: Optional[ImportTaskService] = None


def get_import_task_service() -> ImportTaskService:
    """获取导入任务服务实例（单例）"""
    global _import_task_service
    if _import_task_service is None:
        _import_task_service = ImportTaskService()
    return _import_task_service
