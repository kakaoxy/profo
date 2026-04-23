"""
房源批量导入任务模型
支持异步任务处理和状态跟踪
"""
import enum
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, Integer, String, DateTime, Text, Index, Float

from ..common.base import Base


class ImportTaskStatus(str, enum.Enum):
    """导入任务状态枚举"""
    PENDING = "pending"           # 待处理
    PROCESSING = "processing"     # 处理中
    COMPLETED = "completed"       # 完成
    FAILED = "failed"             # 失败
    CANCELLED = "cancelled"       # 已取消


class PropertyImportTask(Base):
    """房源批量导入任务表
    
    存储异步导入任务的状态和进度，支持轮询查询
    """
    __tablename__ = "property_import_tasks"
    
    id: str = Column(String(36), primary_key=True, comment="任务ID (UUID)")
    user_id: int = Column(Integer, nullable=False, index=True, comment="创建用户ID")
    
    # 任务状态
    status: str = Column(String(20), default=ImportTaskStatus.PENDING.value, nullable=False, comment="任务状态")
    
    # 文件信息
    filename: str = Column(String(255), nullable=False, comment="原始文件名")
    file_path: str = Column(String(500), nullable=False, comment="文件存储路径")
    file_size: int = Column(Integer, nullable=True, comment="文件大小(字节)")
    
    # 处理进度
    total_records: int = Column(Integer, default=0, comment="总记录数")
    processed_records: int = Column(Integer, default=0, comment="已处理记录数")
    success_count: int = Column(Integer, default=0, comment="成功导入数")
    failed_count: int = Column(Integer, default=0, comment="失败记录数")
    progress_percent: float = Column(Float, default=0.0, comment="进度百分比(0-100)")
    
    # 结果信息
    failed_file_url: Optional[str] = Column(String(500), nullable=True, comment="失败记录文件URL")
    error_message: Optional[str] = Column(Text, nullable=True, comment="错误信息(失败时)")
    
    # 时间戳
    created_at: datetime = Column(DateTime, default=datetime.now, nullable=False, comment="创建时间")
    started_at: Optional[datetime] = Column(DateTime, nullable=True, comment="开始处理时间")
    completed_at: Optional[datetime] = Column(DateTime, nullable=True, comment="完成时间")
    
    # 处理时长(秒)
    processing_duration: Optional[float] = Column(Float, nullable=True, comment="处理时长(秒)")
    
    __table_args__ = (
        Index("idx_import_task_user_status", "user_id", "status", "created_at"),
        Index("idx_import_task_status_created", "status", "created_at"),
    )
    
    def __repr__(self) -> str:
        return f"<PropertyImportTask(id='{self.id}', status='{self.status}', progress={self.progress_percent}%)>"
