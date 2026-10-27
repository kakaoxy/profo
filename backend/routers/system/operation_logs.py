"""操作审计日志路由."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from dependencies.auth import DbSessionDep, OperationLogReadPermDep
from dependencies.common import PaginationDep
from schemas.operation_log import (
    OperationLogListResponse,
    OperationLogResponse,
    OperationLogSummaryResponse,
)
from services.system import operation_log_service
from services.system.operation_log import resolve_operator_names, resolve_resource_names

router = APIRouter(prefix="/operation-logs", tags=["operation-logs"])


@router.get("/summary")
def get_operation_log_summary(
    db: DbSessionDep,
    _current_user: OperationLogReadPermDep,
) -> OperationLogSummaryResponse:
    """审计概览（工作台 audit_summary：今日操作数 / 登录失败 / 动作分布）.

    ⚠️ 不含「高风险」与「查询类」指标——审计表无风险等级列，且读操作不落库
    （见 ``OperationLogService.get_summary`` docstring 与 SPEC D-03/D-10）。
    """
    return OperationLogSummaryResponse(**operation_log_service.get_summary(db))


@router.get("")
def list_operation_logs(
    db: DbSessionDep,
    _current_user: OperationLogReadPermDep,
    pagination: PaginationDep,
    user_id: Annotated[str | None, Query(max_length=36, description="按操作者用户ID过滤")] = None,
    action: Annotated[str | None, Query(max_length=50, description="按操作类型过滤: create/update/delete等")] = None,
    resource_type: Annotated[
        str | None,
        Query(max_length=50, description="按资源类型过滤: user/role/permission/project等"),
    ] = None,
    start_time: Annotated[datetime | None, Query(description="起始时间过滤(>=, ISO 8601)")] = None,
    end_time: Annotated[datetime | None, Query(description="结束时间过滤(<=, ISO 8601)")] = None,
) -> OperationLogListResponse:
    """分页查询操作审计日志.

    支持按 user_id/action/resource_type/时间范围筛选，按 created_at 倒序排列。
    每条日志附带 operator_name / resource_name 两个可读名称字段（批量解析，无 N+1）。
    需要 ``operation_log:read`` 权限。
    """
    total, logs = operation_log_service.list_operation_logs(
        db,
        user_id=user_id,
        action=action,
        resource_type=resource_type,
        start_time=start_time,
        end_time=end_time,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    operator_names = resolve_operator_names(db, logs)
    resource_names = resolve_resource_names(db, logs)
    items = [
        OperationLogResponse.model_validate(log).model_copy(
            update={
                "operator_name": operator_names.get(log.user_id) if log.user_id else None,
                "resource_name": resource_names.get(log.resource_type, {}).get(log.resource_id or ""),
            },
        )
        for log in logs
    ]
    return OperationLogListResponse(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )
