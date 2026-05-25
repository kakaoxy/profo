"""项目合同相关Schema."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class SigningMaterial(BaseModel):
    """签约材料附件."""

    filename: str = Field(description="文件名")
    url: str = Field(description="文件URL")
    category: str = Field(description="附件分类")
    fileType: str = Field(description="文件类型")  # noqa: N815
    size: int = Field(default=0, description="文件大小(字节)")


class ContractBase(BaseModel):
    """合同基础字段."""

    contract_no: str = Field(max_length=100, description="合同编号")
    signing_price: Decimal | None = Field(None, description="签约价格(万)")
    signing_date: datetime | None = Field(None, description="签约日期")
    signing_period: int | None = Field(None, description="合同周期(天)")
    extension_period: int | None = Field(None, description="顺延期(天)")
    extension_rent: Decimal | None = Field(None, description="顺延期租金(元/月)")
    cost_assumption_type: str | None = Field(
        None,
        max_length=20,
        description="税费及佣金承担方: meifangbao/owner/respective/other",
    )
    cost_assumption_other: str | None = Field(None, max_length=50, description="税费及佣金承担方其他说明")
    planned_handover_date: datetime | None = Field(None, description="业主交房时间")
    other_agreements: str | None = Field(None, description="其他约定条款")
    signing_materials: list[SigningMaterial] | None = Field(None, description="合同附件列表")
    contract_status: str = Field(default="生效", description="合同状态")

    model_config = ConfigDict(from_attributes=True)


class ContractCreate(ContractBase):
    """创建合同请求."""

    project_id: str = Field(description="项目ID")


class ContractUpdate(BaseModel):
    """更新合同请求."""

    contract_no: str | None = None
    signing_price: Decimal | None = None
    signing_date: datetime | None = None
    signing_period: int | None = None
    extension_period: int | None = None
    extension_rent: Decimal | None = None
    cost_assumption_type: str | None = None
    cost_assumption_other: str | None = None
    planned_handover_date: datetime | None = None
    other_agreements: str | None = None
    signing_materials: list[SigningMaterial] | None = None
    contract_status: str | None = None


class ContractResponse(ContractBase):
    """合同响应."""

    id: str = Field(description="合同ID")
    project_id: str = Field(description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class ContractListResponse(BaseModel):
    """合同列表响应."""

    items: list[ContractResponse]
    total: int
