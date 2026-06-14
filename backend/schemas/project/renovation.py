"""项目装修相关Schema

包含：
1. 装修阶段更新 (ProjectRenovationUpdate)
2. 装修照片上传/响应 (RenovationPhotoUpload, RenovationPhotoResponse)
3. 装修合同信息 (RenovationContractUpdate, RenovationContractResponse)
4. 规范化装修表 (RenovationCreate, RenovationUpdate, RenovationResponse).
"""  # noqa: D400, D415

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from models.common import RenovationStage

# ========== 装修阶段更新 (来自 project_renovation.py) ==========


class RenovationUpdate(BaseModel):
    """更新改造阶段请求模型."""

    renovation_stage: RenovationStage = Field(description="改造子阶段")
    stage_completed_at: datetime | None = Field(None, description="阶段完成时间")
    model_config = ConfigDict(from_attributes=True)


class RenovationPhotoUpload(BaseModel):
    """上传照片请求."""

    url: str = Field(min_length=1, max_length=500)
    filename: str | None = None
    description: str | None = None


class RenovationPhotoResponse(BaseModel):
    """照片响应."""

    id: str
    project_id: str
    renovation_id: str | None = None
    stage: str
    url: str
    filename: str | None = None
    description: str | None = None
    created_at: datetime
    updated_at: datetime | None = None
    model_config = ConfigDict(from_attributes=True)


class RenovationPhotoListResponse(BaseModel):
    """照片列表响应."""

    items: list[RenovationPhotoResponse]
    total: int


# ========== 装修合同信息 (来自 project_renovation.py) ==========


class RenovationContractUpdate(BaseModel):
    """更新装修合同信息请求模型."""

    # 装修公司
    renovation_company: str | None = Field(None, max_length=200, description="合作装修公司")

    # 合同时间
    contract_start_date: datetime | None = Field(None, description="合同约定进场时间")
    contract_end_date: datetime | None = Field(None, description="合同约定竣工交房时间")

    # 实际时间
    actual_start_date: datetime | None = Field(None, description="实际开工时间")
    actual_end_date: datetime | None = Field(None, description="实际竣工时间")

    # 硬装费用
    hard_contract_amount: float | None = Field(None, description="硬装合同总金额")

    # 支付节点
    payment_node_1: str | None = Field(None, max_length=100, description="第一笔款项支付节点")
    payment_ratio_1: float | None = Field(None, ge=0, le=100, description="第一笔款项支付比例")
    payment_node_2: str | None = Field(None, max_length=100, description="第二笔款项支付节点")
    payment_ratio_2: float | None = Field(None, ge=0, le=100, description="第二笔款项支付比例")
    payment_node_3: str | None = Field(None, max_length=100, description="第三笔款项支付节点")
    payment_ratio_3: float | None = Field(None, ge=0, le=100, description="第三笔款项支付比例")
    payment_node_4: str | None = Field(None, max_length=100, description="第四笔款项支付节点")
    payment_ratio_4: float | None = Field(None, ge=0, le=100, description="第四笔款项支付比例")

    # 软装费用
    soft_budget: float | None = Field(None, description="软装预算金额")
    soft_actual_cost: float | None = Field(None, description="软装实际发生成本")
    soft_detail_attachment: str | None = Field(None, max_length=500, description="软装明细附件")

    # 其他费用
    design_fee: float | None = Field(None, description="设计费用")
    demolition_fee: float | None = Field(None, description="拆旧费用")
    garbage_fee: float | None = Field(None, description="垃圾清运费用")
    other_extra_fee: float | None = Field(None, description="其他额外费用")
    other_fee_reason: str | None = Field(None, description="其他费用原因")

    model_config = ConfigDict(from_attributes=True)


class RenovationContractResponse(BaseModel):
    """装修合同信息响应模型."""

    id: str
    project_id: str
    renovation_company: str | None = None
    contract_start_date: datetime | None = None
    contract_end_date: datetime | None = None
    actual_start_date: datetime | None = None
    actual_end_date: datetime | None = None
    hard_contract_amount: float | None = None
    payment_node_1: str | None = None
    payment_ratio_1: float | None = None
    payment_node_2: str | None = None
    payment_ratio_2: float | None = None
    payment_node_3: str | None = None
    payment_ratio_3: float | None = None
    payment_node_4: str | None = None
    payment_ratio_4: float | None = None
    soft_budget: float | None = None
    soft_actual_cost: float | None = None
    soft_detail_attachment: str | None = None
    design_fee: float | None = None
    demolition_fee: float | None = None
    garbage_fee: float | None = None
    other_extra_fee: float | None = None
    other_fee_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


# ========== 规范化装修表 (来自 renovation.py) ==========


class RenovationBase(BaseModel):
    """装修基础字段."""

    renovation_company: str | None = Field(None, max_length=200, description="合作装修公司")
    contract_start_date: datetime | None = Field(None, description="合同约定进场时间")
    contract_end_date: datetime | None = Field(None, description="合同约定竣工交房时间")
    actual_start_date: datetime | None = Field(None, description="实际开工时间")
    actual_end_date: datetime | None = Field(None, description="实际竣工时间")
    hard_contract_amount: Decimal | None = Field(None, description="硬装合同总金额")

    # 支付节点
    payment_node_1: str | None = Field(None, max_length=100, description="第一笔款项支付节点")
    payment_ratio_1: Decimal | None = Field(None, description="第一笔款项支付比例")
    payment_node_2: str | None = Field(None, max_length=100, description="第二笔款项支付节点")
    payment_ratio_2: Decimal | None = Field(None, description="第二笔款项支付比例")
    payment_node_3: str | None = Field(None, max_length=100, description="第三笔款项支付节点")
    payment_ratio_3: Decimal | None = Field(None, description="第三笔款项支付比例")
    payment_node_4: str | None = Field(None, max_length=100, description="第四笔款项支付节点")
    payment_ratio_4: Decimal | None = Field(None, description="第四笔款项支付比例")

    # 软装费用
    soft_budget: Decimal | None = Field(None, description="软装预算金额")
    soft_actual_cost: Decimal | None = Field(None, description="软装实际发生成本")
    soft_detail_attachment: str | None = Field(None, max_length=500, description="软装明细附件")

    # 其他费用
    design_fee: Decimal | None = Field(None, description="设计费用")
    demolition_fee: Decimal | None = Field(None, description="拆旧费用")
    garbage_fee: Decimal | None = Field(None, description="垃圾清运费用")
    other_extra_fee: Decimal | None = Field(None, description="其他额外费用")
    other_fee_reason: str | None = Field(None, description="其他费用原因")

    model_config = ConfigDict(from_attributes=True)


class RenovationCreate(RenovationBase):
    """创建装修记录请求."""

    project_id: str = Field(description="项目ID")


class RenovationInfoUpdate(BaseModel):
    """更新装修记录请求（重命名以避免与 RenovationUpdate 冲突）."""

    renovation_company: str | None = None
    contract_start_date: datetime | None = None
    contract_end_date: datetime | None = None
    actual_start_date: datetime | None = None
    actual_end_date: datetime | None = None
    hard_contract_amount: Decimal | None = None
    payment_node_1: str | None = None
    payment_ratio_1: Decimal | None = None
    payment_node_2: str | None = None
    payment_ratio_2: Decimal | None = None
    payment_node_3: str | None = None
    payment_ratio_3: Decimal | None = None
    payment_node_4: str | None = None
    payment_ratio_4: Decimal | None = None
    soft_budget: Decimal | None = None
    soft_actual_cost: Decimal | None = None
    soft_detail_attachment: str | None = None
    design_fee: Decimal | None = None
    demolition_fee: Decimal | None = None
    garbage_fee: Decimal | None = None
    other_extra_fee: Decimal | None = None
    other_fee_reason: str | None = None


class RenovationResponse(RenovationBase):
    """装修记录响应."""

    id: str = Field(description="装修记录ID")
    project_id: str = Field(description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class RenovationListResponse(BaseModel):
    """装修记录列表响应."""

    items: list[RenovationResponse]
    total: int
