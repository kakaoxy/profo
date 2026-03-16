"""
项目跟进记录相关Schema
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class FollowUpBase(BaseModel):
    """跟进记录基础字段"""
    follow_up_type: str = Field(..., description="跟进方式")
    content: Optional[str] = Field(None, description="跟进详情")
    follow_up_at: datetime = Field(..., description="跟进时间")
    follower_id: Optional[str] = Field(None, description="跟进人ID")

    model_config = ConfigDict(from_attributes=True)


class FollowUpCreate(FollowUpBase):
    """创建跟进记录请求"""
    project_id: str = Field(..., description="项目ID")


class FollowUpUpdate(BaseModel):
    """更新跟进记录请求"""
    follow_up_type: Optional[str] = None
    content: Optional[str] = None
    follow_up_at: Optional[datetime] = None
    follower_id: Optional[str] = None


class FollowUpResponse(FollowUpBase):
    """跟进记录响应"""
    id: str = Field(..., description="跟进记录ID")
    project_id: str = Field(..., description="项目ID")
    created_at: datetime
    updated_at: datetime


class FollowUpListResponse(BaseModel):
    """跟进记录列表响应"""
    items: List[FollowUpResponse]
    total: int