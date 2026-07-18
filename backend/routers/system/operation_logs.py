"""操作审计日志路由."""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query

from dependencies.auth import DbSessionDep, OperationLogReadPermDep
from dependencies.common import PaginationDep
from schemas.operation_log import OperationLogListResponse, OperationLogResponse
from services.system import operation_log_service

router = APIRouter(prefix="/operation-logs", tags=["operation-logs"])


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
    return OperationLogListResponse(
        items=[OperationLogResponse.model_validate(log) for log in logs],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )
