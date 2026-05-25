"""项目评估记录相关Schema."""

from __future__ import annotations

from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

if TYPE_CHECKING:
    from datetime import datetime
    from decimal import Decimal


class EvaluationBase(BaseModel):
    """评估记录基础字段."""

    evaluation_type: str = Field(description="评估类型")
    evaluation_price: Decimal = Field(description="评估价格(万)")
    remark: str | None = Field(None, description="评估备注")
    evaluator_id: str | None = Field(None, description="评估人ID")
    evaluation_at: datetime = Field(description="评估时间")

    model_config = ConfigDict(from_attributes=True)


class EvaluationCreate(EvaluationBase):
    """创建评估记录请求."""

    project_id: str = Field(description="项目ID")


class EvaluationUpdate(BaseModel):
    """更新评估记录请求."""

    evaluation_type: str | None = None
    evaluation_price: Decimal | None = None
    remark: str | None = None
    evaluator_id: str | None = None
    evaluation_at: datetime | None = None


class EvaluationResponse(EvaluationBase):
    """评估记录响应."""

    id: str = Field(description="评估记录ID")
    project_id: str = Field(description="项目ID")
    created_at: datetime
    updated_at: datetime


class EvaluationListResponse(BaseModel):
    """评估记录列表响应."""

    items: list[EvaluationResponse]
    total: int
