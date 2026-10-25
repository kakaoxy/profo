"""操作审计日志相关 Pydantic 模型."""

from datetime import datetime
from typing import Any

from pydantic import UUID4, BaseModel, ConfigDict, Field

from schemas.response import PaginatedResponse


class OperationLogResponse(BaseModel):
    """操作审计日志响应模型."""

    id: UUID4 = Field(description="日志ID")
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


class ActionCountItem(BaseModel):
    """按 action 聚合的计数项."""

    action: str = Field(description="operation_logs.action 原值")
    count: int = Field(description="条数")


class OperationLogSummaryResponse(BaseModel):
    """审计概览（迭代二 audit_summary widget）.

    **只有可算指标**（SPEC D-03 / D-10）：
    - ``today_total``：今日操作数；
    - ``login_failure_count``：今日登录失败数（真实存在的 action）；
    - ``action_distribution``：今日按 action 原值聚合 Top 6。

    ⚠️ **不含「高风险」指标**：``operation_logs`` 无风险等级列，业务中不存在该概念。
    ⚠️ **不做「查询/新增/修改」四分类**：审计只记录写操作与敏感读，
    普通查询不落库（``routers/leads/core.py`` 无 ``log_action`` 调用）。
    """

    today_total: int = Field(description="今日操作总数")
    login_failure_count: int = Field(description="今日登录失败数")
    action_distribution: list[ActionCountItem] = Field(description="今日按 action 聚合 Top 6")


__all__ = [
    "ActionCountItem",
    "OperationLogFilter",
    "OperationLogListResponse",
    "OperationLogResponse",
    "OperationLogSummaryResponse",
]
