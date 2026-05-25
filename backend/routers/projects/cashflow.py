"""
现金流相关API路由（简化版本）
直接返回 Pydantic 模型，不使用 ApiResponse 包装器
"""
from typing import Annotated
from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import CurrentInternalUserDep
from services import CashFlowService
from schemas.project import (
    CashFlowRecordCreate, CashFlowRecordResponse,
    CashFlowResponse
)
from common import limiter, RateLimits

router = APIRouter(tags=["cashflow"])


def get_cashflow_service(db: Session = Depends(get_db)) -> CashFlowService:
    return CashFlowService(db)


CashFlowServiceDep = Annotated[CashFlowService, Depends(get_cashflow_service)]


# ========== 现金流管理 ==========

@router.post("/projects/{project_id}/cashflow", response_model=CashFlowRecordResponse, status_code=201)
def create_cashflow_record(
    record_data: CashFlowRecordCreate,
    service: CashFlowServiceDep,
    current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> CashFlowRecordResponse:
    """创建现金流记录"""
    record = service.create_cashflow_record(project_id, record_data)
    return record


@router.get("/projects/{project_id}/cashflow", response_model=CashFlowResponse)
def get_project_cashflow(
    service: CashFlowServiceDep,
    current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> CashFlowResponse:
    """获取项目现金流明细和汇总"""
    records = service.get_cashflow_records(project_id)
    summary = service.get_cashflow_summary(project_id)

    response_data = CashFlowResponse(records=records, summary=summary)
    return response_data


@router.delete("/projects/{project_id}/cashflow/{record_id}", status_code=204)
@limiter.limit(RateLimits.CASHFLOW_DELETE)
def delete_cashflow_record(
    request: Request,
    service: CashFlowServiceDep,
    current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
    record_id: Annotated[str, Path(description="记录ID")],
) -> None:
    """删除现金流记录
    速率限制：20次/小时
    """
    service.delete_cashflow_record(record_id, project_id)
    return None
