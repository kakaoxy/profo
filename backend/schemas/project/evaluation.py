"""
项目评估记录相关Schema
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class EvaluationBase(BaseModel):
    """评估记录基础字段"""
    evaluation_type: str = Field(description="评估类型")
    evaluation_price: Decimal = Field(description="评估价格(万)")
    remark: Optional[str] = Field(None, description="评估备注")
    evaluator_id: Optional[str] = Field(None, description="评估人ID")
    evaluation_at: datetime = Field(description="评估时间")

    model_config = ConfigDict(from_attributes=True)


class EvaluationCreate(EvaluationBase):
    """创建评估记录请求"""
    project_id: str = Field(description="项目ID")


class EvaluationUpdate(BaseModel):
    """更新评估记录请求"""
    evaluation_type: Optional[str] = None
    evaluation_price: Optional[Decimal] = None
    remark: Optional[str] = None
    evaluator_id: Optional[str] = None
    evaluation_at: Optional[datetime] = None


class EvaluationResponse(EvaluationBase):
    """评估记录响应"""
    id: str = Field(description="评估记录ID")
    project_id: str = Field(description="项目ID")
    created_at: datetime
    updated_at: datetime


class EvaluationListResponse(BaseModel):
    """评估记录列表响应"""
    items: List[EvaluationResponse]
    total: int