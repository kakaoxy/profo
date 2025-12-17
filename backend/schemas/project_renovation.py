from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from models.base import RenovationStage

class RenovationUpdate(BaseModel):
    """更新改造阶段请求模型"""
    renovation_stage: RenovationStage = Field(..., description="改造子阶段")
    stage_completed_at: Optional[datetime] = Field(None, description="阶段完成时间")
    model_config = ConfigDict(from_attributes=True)

class RenovationPhotoUpload(BaseModel):
    """上传照片请求"""
    url: str = Field(..., min_length=1, max_length=500)
    filename: Optional[str] = None
    description: Optional[str] = None

class RenovationPhotoResponse(BaseModel):
    """照片响应"""
    id: str
    project_id: str
    stage: str
    url: str
    filename: Optional[str] = None
    description: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)