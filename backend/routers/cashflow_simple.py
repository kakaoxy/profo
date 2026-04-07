"""
现金流相关API路由（简化版本）
直接返回 Pydantic 模型，不使用 ApiResponse 包装器
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Path, Query, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import get_current_internal_user
from models.user import User
from services import CashFlowService
from schemas.project import (
    CashFlowRecordCreate, CashFlowRecordResponse,
    CashFlowResponse, CashFlowSummary
)

router = APIRouter(tags=["cashflow"])


def get_cashflow_service(db: Session = Depends(get_db)):
    return CashFlowService(db)


# ========== 现金流管理 ==========

@router.post("/projects/{project_id}/cashflow", response_model=CashFlowRecordResponse, status_code=201)
def create_cashflow_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: CashFlowRecordCreate = ...,
    service: CashFlowService = Depends(get_cashflow_service),
    current_user: User = Depends(get_current_internal_user)
):
    """创建现金流记录"""
    record = service.create_cashflow_record(project_id, record_data)
    return record


@router.get("/projects/{project_id}/cashflow", response_model=CashFlowResponse)
def get_project_cashflow(
    project_id: str = Path(..., description="项目ID"),
    service: CashFlowService = Depends(get_cashflow_service),
    current_user: User = Depends(get_current_internal_user)
):
    """获取项目现金流明细和汇总"""
    records = service.get_cashflow_records(project_id)
    summary = service.get_cashflow_summary(project_id)

    response_data = CashFlowResponse(records=records, summary=summary)
    return response_data


@router.delete("/projects/{project_id}/cashflow/{record_id}", status_code=204)
def delete_cashflow_record(
    project_id: str = Path(..., description="项目ID"),
    record_id: str = Path(..., description="记录ID"),
    service: CashFlowService = Depends(get_cashflow_service),
    current_user: User = Depends(get_current_internal_user)
):
    """删除现金流记录"""
    service.delete_cashflow_record(record_id, project_id)
    return None
