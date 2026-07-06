"""资金账本（财务管理）路由层.

按 AGENTS.md 规范：
- Router 禁 SQLAlchemy 查询，全部通过 FinanceService 编排
- 直接返回 Pydantic 模型，不包装 code/msg/data
- 写端点统一 RateLimits 限流；写操作统一 CurrentInternalUserDep（admin/operator）
- 404 由 ResourceNotFoundError 统一异常处理器返回
"""

import urllib.parse
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.responses import StreamingResponse

from dependencies.auth import CurrentInternalUserDep, DbSessionDep, require_roles
from models.common import ProjectStatus
from schemas.project import (
    CashFlowRecordResponse,
    CashFlowResponse,
    FinanceLogResponse,
    LedgerListResponse,
    LedgerProjectListItem,
    LedgerRecordCreate,
    LedgerStatsResponse,
)
from services import FinanceService
from utils.common import RateLimits, limiter

router = APIRouter(
    prefix="/admin/ledger",
    tags=["finance-ledger"],
    dependencies=[Depends(require_roles(["admin", "operator"]))],
)


def get_finance_service(db: DbSessionDep) -> FinanceService:
    """创建财务服务实例."""
    return FinanceService(db)


_FinanceServiceDep = Annotated[FinanceService, Depends(get_finance_service)]


# ==================== 列表 / 统计 / 导出 ====================


@router.get(
    "",
    summary="获取资金账本项目列表",
)
def list_ledger_projects(
    service: _FinanceServiceDep,
    search: Annotated[str | None, Query(description="模糊搜索: 项目编号/小区/地址")] = None,
    project_status: Annotated[ProjectStatus | None, Query(description="项目状态筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=1000, description="每页数量")] = 50,
) -> LedgerListResponse:
    """分页查询有流水记录的项目列表（含收入/支出/净现金流/ROI 聚合统计）."""
    items, total = service.list_projects_with_stats(
        search=search,
        project_status=project_status.value if project_status else None,
        page=page,
        page_size=page_size,
    )
    return LedgerListResponse(
        items=[LedgerProjectListItem(**it) for it in items],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/stats",
    summary="获取资金账本全局汇总",
)
def get_ledger_stats(
    service: _FinanceServiceDep,
) -> LedgerStatsResponse:
    """全局汇总：有流水记录的项目数、总收入、总支出、净现金流、记录数."""
    return LedgerStatsResponse(**service.get_overall_stats())


@router.get(
    "/export",
    summary="导出资金账本 Excel",
)
@limiter.limit(RateLimits.INVESTMENT_EXPORT)
def export_ledger(
    request: Request,
    service: _FinanceServiceDep,
    search: Annotated[str | None, Query(description="模糊搜索")] = None,
    project_status: Annotated[ProjectStatus | None, Query(description="项目状态筛选")] = None,
) -> StreamingResponse:
    """导出全量资金账本为 .xlsx（openpyxl）。文件名 资金账本_YYYYMMDD.xlsx.

    速率限制：10次/小时.
    """
    content = service.export_ledger_excel(
        search=search,
        project_status=project_status.value if project_status else None,
    )
    filename = f"资金账本_{datetime.now().strftime('%Y%m%d')}.xlsx"
    # 中文文件名需 RFC5987 编码
    filename_encoded = urllib.parse.quote(filename)
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (
                f"attachment; filename*=UTF-8''{filename_encoded}"
            ),
        },
    )


# ==================== 项目详情 ====================


@router.get(
    "/{project_id}",
    summary="获取项目资金账本详情",
)
def get_ledger_detail(
    project_id: Annotated[str, Path(description="项目ID")],
    service: _FinanceServiceDep,
) -> CashFlowResponse:
    """获取项目资金账本详情（含流水记录列表 + 汇总）."""
    records = service.get_records(project_id)
    summary = service.get_summary(project_id)
    return CashFlowResponse(records=records, summary=summary)


@router.get(
    "/{project_id}/logs",
    summary="获取项目资金账本操作日志",
)
def list_project_logs(
    project_id: Annotated[str, Path(description="项目ID")],
    service: _FinanceServiceDep,
    _current_user: CurrentInternalUserDep,
) -> list[FinanceLogResponse]:
    """获取指定项目的资金账本操作日志（按时间降序）."""
    return service.list_logs(project_id)


# ==================== 流水 CRUD ====================


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="创建资金账本流水",
)
@limiter.limit(RateLimits.PROJECT_CREATE)
def create_ledger_record(
    request: Request,
    data: LedgerRecordCreate,
    service: _FinanceServiceDep,
    _current_user: CurrentInternalUserDep,
) -> CashFlowRecordResponse:
    """创建资金账本流水记录（body 含 project_id）.

    速率限制：100次/小时.
    """
    record = service.create_record(data.project_id, data, _current_user.id)
    return CashFlowRecordResponse.model_validate(record)


@router.delete(
    "/{record_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除资金账本流水",
)
@limiter.limit(RateLimits.CASHFLOW_DELETE)
def delete_ledger_record(
    request: Request,
    record_id: Annotated[str, Path(description="流水记录ID")],
    service: _FinanceServiceDep,
    _current_user: CurrentInternalUserDep,
) -> None:
    """软删除资金账本流水记录.

    速率限制：20次/小时.
    """
    service.delete_record_by_id(record_id, _current_user.id)
