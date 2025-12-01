"""
上传和导入相关Schema
包含CSV上传、JSON推送、导入结果等模型
"""
from typing import List, Optional
from pydantic import BaseModel, Field


class UploadResult(BaseModel):
    """CSV上传结果"""
    total: int = Field(..., description="总记录数")
    success: int = Field(..., description="成功导入数")
    failed: int = Field(..., description="失败记录数")
    failed_file_url: Optional[str] = Field(None, description="失败记录CSV下载链接")


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