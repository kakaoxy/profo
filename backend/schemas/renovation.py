"""
项目装修相关Schema
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class RenovationBase(BaseModel):
    """装修基础字段"""
    renovation_company: Optional[str] = Field(None, max_length=200, description="合作装修公司")
    contract_start_date: Optional[datetime] = Field(None, description="合同约定进场时间")
    contract_end_date: Optional[datetime] = Field(None, description="合同约定竣工交房时间")
    actual_start_date: Optional[datetime] = Field(None, description="实际开工时间")
    actual_end_date: Optional[datetime] = Field(None, description="实际竣工时间")
    hard_contract_amount: Optional[Decimal] = Field(None, description="硬装合同总金额")

    # 支付节点
    payment_node_1: Optional[str] = Field(None, max_length=100, description="第一笔款项支付节点")
    payment_ratio_1: Optional[Decimal] = Field(None, description="第一笔款项支付比例")
    payment_node_2: Optional[str] = Field(None, max_length=100, description="第二笔款项支付节点")
    payment_ratio_2: Optional[Decimal] = Field(None, description="第二笔款项支付比例")
    payment_node_3: Optional[str] = Field(None, max_length=100, description="第三笔款项支付节点")
    payment_ratio_3: Optional[Decimal] = Field(None, description="第三笔款项支付比例")
    payment_node_4: Optional[str] = Field(None, max_length=100, description="第四笔款项支付节点")
    payment_ratio_4: Optional[Decimal] = Field(None, description="第四笔款项支付比例")

    # 软装费用
    soft_budget: Optional[Decimal] = Field(None, description="软装预算金额")
    soft_actual_cost: Optional[Decimal] = Field(None, description="软装实际发生成本")
    soft_detail_attachment: Optional[str] = Field(None, max_length=500, description="软装明细附件")

    # 其他费用
    design_fee: Optional[Decimal] = Field(None, description="设计费用")
    demolition_fee: Optional[Decimal] = Field(None, description="拆旧费用")
    garbage_fee: Optional[Decimal] = Field(None, description="垃圾清运费用")
    other_extra_fee: Optional[Decimal] = Field(None, description="其他额外费用")
    other_fee_reason: Optional[str] = Field(None, description="其他费用原因")

    model_config = ConfigDict(from_attributes=True)


class RenovationCreate(RenovationBase):
    """创建装修记录请求"""
    project_id: str = Field(..., description="项目ID")


class RenovationUpdate(BaseModel):
    """更新装修记录请求"""
    renovation_company: Optional[str] = None
    contract_start_date: Optional[datetime] = None
    contract_end_date: Optional[datetime] = None
    actual_start_date: Optional[datetime] = None
    actual_end_date: Optional[datetime] = None
    hard_contract_amount: Optional[Decimal] = None
    payment_node_1: Optional[str] = None
    payment_ratio_1: Optional[Decimal] = None
    payment_node_2: Optional[str] = None
    payment_ratio_2: Optional[Decimal] = None
    payment_node_3: Optional[str] = None
    payment_ratio_3: Optional[Decimal] = None
    payment_node_4: Optional[str] = None
    payment_ratio_4: Optional[Decimal] = None
    soft_budget: Optional[Decimal] = None
    soft_actual_cost: Optional[Decimal] = None
    soft_detail_attachment: Optional[str] = None
    design_fee: Optional[Decimal] = None
    demolition_fee: Optional[Decimal] = None
    garbage_fee: Optional[Decimal] = None
    other_extra_fee: Optional[Decimal] = None
    other_fee_reason: Optional[str] = None


class RenovationResponse(RenovationBase):
    """装修记录响应"""
    id: str = Field(..., description="装修记录ID")
    project_id: str = Field(..., description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class RenovationListResponse(BaseModel):
    """装修记录列表响应"""
    items: List[RenovationResponse]
    total: int