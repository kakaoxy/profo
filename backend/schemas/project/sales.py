"""项目销售相关Schema

包含：
1. 销售角色更新 (SalesRolesUpdate)
2. 销售记录 (SalesRecordCreate, SalesRecordResponse)
3. 成交确认 (ProjectCompleteRequest)
4. 规范化销售表 (SaleCreate, SaleUpdate, SaleResponse)
5. 互动记录 (InteractionCreate, InteractionUpdate, InteractionResponse).
"""

from datetime import datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

from pydantic import UUID4, AliasChoices, BaseModel, ConfigDict, Field, field_validator

from models.common import RecordType
from schemas.user import UserBriefResponse

# 无时区输入统一按东八区解析（否则 PG timestamptz 按 UTC 解释，客户端 +8 渲染会偏移）
_CST = ZoneInfo("Asia/Shanghai")

# ========== 销售角色更新 (来自 project_sales.py) ==========


class SalesRolesUpdate(BaseModel):
    """更新销售角色 - 使用用户ID而非文本."""

    channel_manager_id: str | None = Field(
        None,
        validation_alias=AliasChoices("channel_manager_id", "channelManagerId", "channel_manager", "channelManager"),
        max_length=36,
        description="渠道负责人用户ID",
    )
    property_agent_id: str | None = Field(
        None,
        validation_alias=AliasChoices("property_agent_id", "propertyAgentId", "presenter"),
        max_length=36,
        description="讲房人用户ID(房源维护人)",
    )
    negotiator_id: str | None = Field(
        None,
        validation_alias=AliasChoices("negotiator_id", "negotiatorId", "negotiator"),
        max_length=36,
        description="谈判人用户ID(联卖谈判人)",
    )

    model_config = ConfigDict(from_attributes=True)


class SalesRecordCreate(BaseModel):
    """创建销售记录."""

    record_type: RecordType
    customer_name: str | None = Field(None, max_length=100)
    customer_phone: str | None = Field(None, max_length=20)
    customer_info: dict[str, str] | None = None
    record_date: datetime
    record_time: str | None = None
    price: Decimal | None = None
    notes: str | None = None
    feedback: str | None = None
    result: str | None = None
    related_agent: str | None = None
    model_config = ConfigDict(from_attributes=True)

    @field_validator("record_date", mode="after")
    @classmethod
    def _attach_record_date_tz(cls, v: datetime) -> datetime:
        """无时区输入按东八区解析（显式带时区的输入原样保留）."""
        if v.tzinfo is None:
            return v.replace(tzinfo=_CST)
        return v


class SalesRecordResponse(BaseModel):
    """销售记录响应 - 兼容 ProjectInteraction 模型字段映射."""

    id: UUID4
    project_id: UUID4
    record_type: RecordType
    customer_name: str | None = Field(None, validation_alias=AliasChoices("customer_name", "interaction_target"))
    customer_phone: str | None = None
    customer_info: dict[str, str] | None = None
    record_date: datetime = Field(validation_alias=AliasChoices("record_date", "interaction_at"))
    record_time: str | None = None
    price: Decimal | None = None
    notes: str | None = Field(None, validation_alias=AliasChoices("notes", "content"))
    feedback: str | None = None
    result: str | None = None
    related_agent: str | None = None
    created_at: datetime
    operator: UserBriefResponse | None = Field(
        None,
        description="操作人嵌套对象（id/nickname/avatar），历史记录可能为 null",
    )
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SalesRecordListResponse(BaseModel):
    """销售记录列表响应."""

    items: list[SalesRecordResponse]
    total: int


class ProjectCompleteRequest(BaseModel):
    """确认成交请求."""

    sold_price: Decimal = Field(
        validation_alias=AliasChoices("sold_price", "soldPrice"),
    )
    sold_date: datetime = Field(
        validation_alias=AliasChoices("sold_date", "soldDate"),
    )

    model_config = ConfigDict(
        populate_by_name=True,  # 允许 Python 代码里用 sold_price 赋值
        from_attributes=True,
    )


# ========== 规范化销售表 (来自 sale.py) ==========


class SaleBase(BaseModel):
    """销售基础字段."""

    listing_date: datetime | None = Field(None, description="上架日期")
    list_price: Decimal | None = Field(None, description="挂牌价(万)")
    sold_date: datetime | None = Field(None, description="成交时间")
    sold_price: Decimal | None = Field(None, description="成交价(万)")
    channel_manager_id: str | None = Field(None, description="渠道负责人ID")
    property_agent_id: str | None = Field(None, description="房源维护人ID")
    negotiator_id: str | None = Field(None, description="联卖谈判人ID")
    transaction_status: str = Field(default="在售", description="交易状态")

    model_config = ConfigDict(from_attributes=True)


class SaleCreate(SaleBase):
    """创建销售记录请求."""

    project_id: UUID4 = Field(description="项目ID")


class SaleUpdate(BaseModel):
    """更新销售记录请求."""

    listing_date: datetime | None = None
    list_price: Decimal | None = None
    sold_date: datetime | None = None
    sold_price: Decimal | None = None
    channel_manager_id: str | None = None
    property_agent_id: str | None = None
    negotiator_id: str | None = None
    transaction_status: str | None = None


class SaleResponse(SaleBase):
    """销售记录响应."""

    id: UUID4 = Field(description="销售ID")
    project_id: UUID4 = Field(description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class SaleListResponse(BaseModel):
    """销售记录列表响应."""

    items: list[SaleResponse]
    total: int


# ========== 项目详情 - 销售业务身份标志 ==========


class SaleInfoResponse(BaseModel):
    """项目详情中销售业务身份标志响应.

    附带在项目详情响应的 `sale` 字段下，用于前端按钮显隐判断：
    - admin/operator 持 `project:sales:add_record` 权限 → can_edit_sales=True
    - user 角色：当前用户为销售团队成员（3 角色字段任一匹配）→ can_edit_sales=True
    - 其他 → can_edit_sales=False
    """

    can_edit_sales: bool = Field(
        default=False,
        description="当前用户是否有销售写权限（admin/operator 持权限码 或 user 为销售团队成员）",
    )
    channel_manager_id: str | None = Field(None, description="渠道负责人ID")
    property_agent_id: str | None = Field(None, description="房源维护人ID(讲房人)")
    negotiator_id: str | None = Field(None, description="联卖谈判人ID")

    model_config = ConfigDict(from_attributes=True)


# ========== 互动记录 (来自 interaction.py) ==========


class InteractionBase(BaseModel):
    """互动记录基础字段."""

    record_type: RecordType = Field(description="互动类型")
    interaction_target: str | None = Field(None, max_length=100, description="互动对象")
    content: str | None = Field(None, description="互动详情")
    interaction_at: datetime = Field(description="互动时间")
    operator_id: str | None = Field(None, description="操作人ID")

    model_config = ConfigDict(from_attributes=True)


class InteractionCreate(InteractionBase):
    """创建互动记录请求."""

    project_id: UUID4 = Field(description="项目ID")


class InteractionUpdate(BaseModel):
    """更新互动记录请求."""

    record_type: RecordType | None = None
    interaction_target: str | None = None
    content: str | None = None
    interaction_at: datetime | None = None
    operator_id: str | None = None


class InteractionResponse(InteractionBase):
    """互动记录响应."""

    id: UUID4 = Field(description="互动记录ID")
    project_id: UUID4 = Field(description="项目ID")
    price: Decimal | None = Field(None, description="出价金额(万)")
    created_at: datetime
    updated_at: datetime


class InteractionListResponse(BaseModel):
    """互动记录列表响应."""

    items: list[InteractionResponse]
    total: int
