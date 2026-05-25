"""项目跟进记录相关Schema."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class FollowUpBase(BaseModel):
    """跟进记录基础字段."""

    follow_up_type: str = Field(description="跟进方式")
    content: str | None = Field(None, description="跟进详情")
    follow_up_at: datetime = Field(description="跟进时间")
    follower_id: str | None = Field(None, description="跟进人ID")

    model_config = ConfigDict(from_attributes=True)


class FollowUpCreate(FollowUpBase):
    """创建跟进记录请求."""

    project_id: str = Field(description="项目ID")


class FollowUpUpdate(BaseModel):
    """更新跟进记录请求."""

    follow_up_type: str | None = None
    content: str | None = None
    follow_up_at: datetime | None = None
    follower_id: str | None = None


class FollowUpResponse(FollowUpBase):
    """跟进记录响应."""

    id: str = Field(description="跟进记录ID")
    project_id: str = Field(description="项目ID")
    created_at: datetime
    updated_at: datetime


class FollowUpListResponse(BaseModel):
    """跟进记录列表响应."""

    items: list[FollowUpResponse]
    total: int
