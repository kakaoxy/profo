"""项目状态流转日志相关Schema."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from schemas.response import PaginatedResponse


class StatusLogBase(BaseModel):
    """状态日志基础字段."""

    old_status: str = Field(description="变更前状态")
    new_status: str = Field(description="变更后状态")
    trigger_event: str | None = Field(None, max_length=100, description="触发事件")
    operator_id: str | None = Field(None, description="操作人ID")
    operate_at: datetime = Field(description="变更时间")
    remark: str | None = Field(None, description="变更说明")

    model_config = ConfigDict(from_attributes=True)


class StatusLogCreate(StatusLogBase):
    """创建状态日志请求."""

    project_id: str = Field(description="项目ID")


class StatusLogUpdate(BaseModel):
    """更新状态日志请求."""

    old_status: str | None = None
    new_status: str | None = None
    trigger_event: str | None = None
    operator_id: str | None = None
    operate_at: datetime | None = None
    remark: str | None = None


class StatusLogResponse(StatusLogBase):
    """状态日志响应."""

    id: str = Field(description="日志ID")
    project_id: str = Field(description="项目ID")
    created_at: datetime
    updated_at: datetime


class StatusLogListResponse(PaginatedResponse[StatusLogResponse]):
    """状态日志列表响应."""
