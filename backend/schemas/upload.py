"""
上传和导入相关Schema
包含CSV上传、JSON推送、导入结果等模型
"""
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class UploadResult(BaseModel):
    """CSV上传结果"""
    total: int = Field(..., description="总记录数")
    success: int = Field(..., description="成功导入数")
    failed: int = Field(..., description="失败记录数")
    failed_file_url: Optional[str] = Field(None, description="失败记录CSV下载链接")


class ImportTaskCreateResponse(BaseModel):
    """导入任务创建响应"""
    task_id: str = Field(..., description="任务ID")
    status: str = Field(..., description="任务状态")
    message: str = Field(default="导入任务已创建", description="提示信息")


class ImportTaskStatusResponse(BaseModel):
    """导入任务状态响应"""
    task_id: str = Field(..., description="任务ID")
    status: str = Field(..., description="任务状态: pending/processing/completed/failed/cancelled")
    filename: str = Field(..., description="原始文件名")
    
    # 进度信息
    total_records: int = Field(default=0, description="总记录数")
    processed_records: int = Field(default=0, description="已处理记录数")
    success_count: int = Field(default=0, description="成功导入数")
    failed_count: int = Field(default=0, description="失败记录数")
    progress_percent: float = Field(default=0.0, description="进度百分比(0-100)")
    
    # 结果信息
    failed_file_url: Optional[str] = Field(None, description="失败记录文件URL")
    error_message: Optional[str] = Field(None, description="错误信息")
    
    # 时间信息
    created_at: datetime = Field(..., description="创建时间")
    started_at: Optional[datetime] = Field(None, description="开始处理时间")
    completed_at: Optional[datetime] = Field(None, description="完成时间")
    processing_duration: Optional[float] = Field(None, description="处理时长(秒)")


class PushResult(BaseModel):
    """JSON推送结果"""
    total: int = Field(..., description="总记录数")
    success: int = Field(..., description="成功导入数")
    failed: int = Field(..., description="失败记录数")
    errors: List[dict] = Field(default_factory=list, description="错误详情列表")


class ImportResult(BaseModel):
    """单条数据导入结果"""
    success: bool
    property_id: Optional[int] = None
    error: Optional[str] = None


class BatchImportResult(BaseModel):
    """批量导入结果"""
    total: int
    success: int
    failed: int
    failed_records: List[dict] = Field(default_factory=list)