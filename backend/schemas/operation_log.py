"""操作审计日志相关 Pydantic 模型."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from schemas.response import PaginatedResponse


class OperationLogResponse(BaseModel):
    """操作审计日志响应模型."""

    id: str = Field(description="日志ID")
    user_id: str | None = Field(None, description="操作者用户ID(逻辑外键)")
    action: str = Field(description="操作类型：create/update/delete/sensitive_data_access等")
    resource_type: str = Field(description="资源类型：user/role/permission/project等")
    resource_id: str | None = Field(None, description="资源ID")
    ip: str | None = Field(None, description="操作者IP地址(IPv4/IPv6)")
    user_agent: str | None = Field(None, description="User-Agent")
    before: dict[str, Any] | None = Field(None, description="变更前快照")
    after: dict[str, Any] | None = Field(None, description="变更后快照")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class OperationLogListResponse(PaginatedResponse[OperationLogResponse]):
    """操作审计日志分页响应模型."""


class OperationLogFilter(BaseModel):
    """操作审计日志查询过滤模型."""

    user_id: str | None = Field(None, description="按操作者用户ID过滤")
    action: str | None = Field(None, description="按操作类型过滤")
    resource_type: str | None = Field(None, description="按资源类型过滤")
    start_time: datetime | None = Field(None, description="起始时间过滤(>=)")
    end_time: datetime | None = Field(None, description="结束时间过滤(<=)")


__all__ = [
    "OperationLogFilter",
    "OperationLogListResponse",
    "OperationLogResponse",
]
