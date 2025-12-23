"""
现金流相关API路由（简化版本）
"""
from typing import Optional
from fastapi import APIRouter, Depends, Path, Query, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from services import CashFlowService
from schemas.project import (
    CashFlowRecordCreate, CashFlowRecordResponse,
    CashFlowResponse, CashFlowSummary
)

router = APIRouter(prefix="/api/v1", tags=["cashflow"])


def get_cashflow_service(db: Session = Depends(get_db)):
    return CashFlowService(db)


# ========== 现金流管理 ==========

@router.post("/projects/{project_id}/cashflow")
def create_cashflow_record(
    project_id: str = Path(..., description="项目ID"),
    record_data: CashFlowRecordCreate = ...,
    service: CashFlowService = Depends(get_cashflow_service)
):
    """创建现金流记录"""
    record = service.create_cashflow_record(project_id, record_data)
    return {"code": 200, "msg": "success", "data": record}


@router.get("/projects/{project_id}/cashflow")
def get_project_cashflow(
    project_id: str = Path(..., description="项目ID"),
    service: CashFlowService = Depends(get_cashflow_service)
):
    """获取项目现金流明细和汇总"""
    records = service.get_cashflow_records(project_id)
    summary = service.get_cashflow_summary(project_id)

    response_data = {
        "records": records,
        "summary": summary
    }
    return {"code": 200, "msg": "success", "data": response_data}


@router.delete("/projects/{project_id}/cashflow/{record_id}")
def delete_cashflow_record(
    project_id: str = Path(..., description="项目ID"),
    record_id: str = Path(..., description="记录ID"),
    service: CashFlowService = Depends(get_cashflow_service)
):
    """删除现金流记录"""
    service.delete_cashflow_record(record_id, project_id)
    return {"code": 200, "msg": "success", "data": None}