"""
项目合同相关Schema
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict, AliasChoices


class ContractBase(BaseModel):
    """合同基础字段"""
    contract_no: Optional[str] = Field(None, max_length=100, description="合同编号")
    signing_price: Optional[Decimal] = Field(None, description="签约价格(万)")
    signing_date: Optional[datetime] = Field(None, description="签约日期")
    signing_period: Optional[int] = Field(None, description="合同周期(天)")
    extension_period: Optional[int] = Field(None, description="顺延期(天)")
    extension_rent: Optional[Decimal] = Field(None, description="顺延期租金(元/月)")
    cost_assumption: Optional[str] = Field(None, max_length=50, description="税费及佣金承担方")
    planned_handover_date: Optional[datetime] = Field(None, description="业主交房时间")
    other_agreements: Optional[str] = Field(None, description="其他约定条款")
    signing_materials: Optional[List[str]] = Field(None, description="合同附件URLs")
    contract_status: str = Field(default="生效", description="合同状态")

    model_config = ConfigDict(from_attributes=True)


class ContractCreate(ContractBase):
    """创建合同请求"""
    project_id: str = Field(..., description="项目ID")


class ContractUpdate(BaseModel):
    """更新合同请求"""
    contract_no: Optional[str] = None
    signing_price: Optional[Decimal] = None
    signing_date: Optional[datetime] = None
    signing_period: Optional[int] = None
    extension_period: Optional[int] = None
    extension_rent: Optional[Decimal] = None
    cost_assumption: Optional[str] = None
    planned_handover_date: Optional[datetime] = None
    other_agreements: Optional[str] = None
    signing_materials: Optional[List[str]] = None
    contract_status: Optional[str] = None


class ContractResponse(ContractBase):
    """合同响应"""
    id: str = Field(..., description="合同ID")
    project_id: str = Field(..., description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class ContractListResponse(BaseModel):
    """合同列表响应"""
    items: List[ContractResponse]
    total: int