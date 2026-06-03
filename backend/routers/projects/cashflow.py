"""项目现金流管理路由."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.orm import Session

from utils.common import RateLimits, limiter
from db import get_db
from dependencies.auth import CurrentInternalUserDep
from schemas.project import (
    CashFlowRecordCreate,
    CashFlowRecordResponse,
    CashFlowResponse,
)
from services import CashFlowService

router = APIRouter()


_get_db_dep = Depends(get_db)


def get_cashflow_service(db: Session = _get_db_dep) -> CashFlowService:
    """获取现金流服务实例."""
    return CashFlowService(db)


CashFlowServiceDep = Annotated[CashFlowService, Depends(get_cashflow_service)]


@router.post("/{project_id}/cashflow", status_code=201)
def create_cashflow_record(
    record_data: CashFlowRecordCreate,
    service: CashFlowServiceDep,
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> CashFlowRecordResponse:
    """创建现金流记录."""
    return service.create_cashflow_record(project_id, record_data)


@router.get("/{project_id}/cashflow")
def get_project_cashflow(
    service: CashFlowServiceDep,
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> CashFlowResponse:
    """获取项目现金流明细和汇总."""
    records = service.get_cashflow_records(project_id)
    summary = service.get_cashflow_summary(project_id)

    return CashFlowResponse(records=records, summary=summary)


@router.delete("/{project_id}/cashflow/{record_id}", status_code=204)
@limiter.limit(RateLimits.CASHFLOW_DELETE)
def delete_cashflow_record(
    request: Request,
    service: CashFlowServiceDep,
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
    record_id: Annotated[str, Path(description="记录ID")],
) -> None:
    """删除现金流记录.

    速率限制：20次/小时.
    """
    service.delete_cashflow_record(record_id, project_id)
