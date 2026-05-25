"""项目相关 Pydantic Schema."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from schemas.response import PaginatedResponse
from models.common import ProjectStatus

_DATE_LEN = 10
_DATE_DASH_COUNT = 2


def parse_date_string(value: str | datetime | None) -> datetime | None:
    """解析日期字符串为 datetime 对象.

    支持格式: YYYY-MM-DD, ISO 格式字符串, 或 datetime 对象.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        if len(value) == _DATE_LEN and value.count("-") == _DATE_DASH_COUNT:
            try:
                year, month, day = map(int, value.split("-"))
                return datetime(year, month, day, tzinfo=timezone.utc)
            except ValueError:
                pass
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            pass
        try:
            return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%fZ").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    return None


class ProjectBase(BaseModel):
    """项目基础字段 - 适配新的规范化表结构."""

    name: str | None = Field(None, min_length=1, max_length=200, description="项目名称")
    community_name: str | None = Field(None, max_length=200, description="小区名称")
    address: str | None = Field(None, max_length=500, description="物业地址")
    area: Decimal | None = Field(None, description="产证面积(m²)")
    layout: str | None = Field(None, max_length=50, description="户型")
    orientation: str | None = Field(None, max_length=50, description="朝向")

    total_income: Decimal = Field(default_factory=Decimal)
    total_expense: Decimal = Field(default_factory=Decimal)
    net_cash_flow: Decimal = Field(default_factory=Decimal)
    roi: float = Field(default=0.0)

    model_config = ConfigDict(from_attributes=True)


class UserBrief(BaseModel):
    """用户简要信息 - 用于关联对象展示."""

    id: str = Field(..., description="用户ID")
    nickname: str | None = Field(None, description="昵称")
    avatar: str | None = Field(None, description="头像")
    username: str | None = Field(None, description="用户名")

    model_config = ConfigDict(from_attributes=True)


class ProjectCreate(BaseModel):
    """创建项目请求模型 - 已适配规范化表结构."""

    community_id: str | None = Field(None, max_length=36, description="小区ID")
    community_name: str = Field(..., max_length=200, description="小区名称")
    address: str = Field(..., max_length=500, description="物业地址")
    area: Decimal | None = Field(None, description="产证面积(m²)")
    layout: str | None = Field(None, max_length=50, description="户型")
    orientation: str | None = Field(None, max_length=50, description="朝向")
    project_manager_id: str | None = Field(None, description="项目负责人ID")

    contract_no: str = Field(..., max_length=100, description="合同编号")
    signing_price: Decimal | None = Field(None, description="签约价格(万)")
    signing_date: str | None = Field(None, description="签约日期 (YYYY-MM-DD 格式)")
    signing_period: int | None = Field(None, description="合同周期(天)")
    extension_period: int | None = Field(None, description="顺延期(天)")
    extension_rent: Decimal | None = Field(None, description="顺延期租金(元/月)")
    cost_assumption_type: str | None = Field(
        None,
        max_length=20,
        description="税费及佣金承担方类型: meifangbao/owner/respective/other",
    )
    cost_assumption_other: str | None = Field(None, max_length=50, description="税费及佣金承担方其他说明")
    planned_handover_date: str | None = Field(None, description="计划交房时间 (YYYY-MM-DD 格式)")
    other_agreements: str | None = Field(None, description="其他约定")
    signing_materials: list[Any] | None = Field(None, description="签约材料列表")

    owner_name: str | None = Field(None, max_length=100, description="业主姓名")
    owner_phone: str | None = Field(None, max_length=20, description="业主电话")
    owner_id_card: str | None = Field(None, max_length=18, description="业主身份证号")
    owner_info: str | None = Field(None, description="业主备注")
    notes: str | None = Field(None, description="备注（映射到 owner_info）")

    list_price: Decimal | None = Field(None, description="挂牌价(万)")
    listing_date: str | None = Field(None, description="上架日期 (YYYY-MM-DD 格式)")

    model_config = ConfigDict(from_attributes=True)


class ProjectUpdate(BaseModel):
    """更新项目请求模型 (所有字段可选) - 已适配规范化表结构."""

    community_id: str | None = Field(None, max_length=36, description="小区ID")
    community_name: str | None = Field(None, max_length=200)
    address: str | None = Field(None, max_length=500)
    area: Decimal | None = Field(None)
    layout: str | None = Field(None, max_length=50)
    orientation: str | None = Field(None, max_length=50)
    project_manager_id: str | None = Field(None, description="项目负责人ID")

    contract_no: str | None = Field(
        None,
        validation_alias=AliasChoices("contract_no", "contractNo"),
        max_length=100,
    )
    signing_price: Decimal | None = Field(None)
    signing_date: str | None = Field(None, description="签约日期 (YYYY-MM-DD 格式)")
    signing_period: int | None = Field(None)
    extension_period: int | None = Field(
        None,
        validation_alias=AliasChoices("extension_period", "extensionPeriod"),
    )
    extension_rent: Decimal | None = Field(
        None,
        validation_alias=AliasChoices("extension_rent", "extensionRent"),
    )
    cost_assumption_type: str | None = Field(
        None,
        validation_alias=AliasChoices("cost_assumption_type", "costAssumptionType"),
        max_length=20,
    )
    cost_assumption_other: str | None = Field(
        None,
        validation_alias=AliasChoices("cost_assumption_other", "costAssumptionOther"),
        max_length=50,
    )
    planned_handover_date: str | None = Field(None, description="计划交房时间 (YYYY-MM-DD 格式)")
    other_agreements: str | None = Field(
        None,
        validation_alias=AliasChoices("other_agreements", "otherAgreements"),
    )
    signing_materials: list[Any] | None = Field(None)

    owner_name: str | None = Field(None, max_length=100)
    owner_phone: str | None = Field(None, max_length=20)
    owner_id_card: str | None = Field(None, max_length=18)
    owner_info: str | None = Field(None)
    notes: str | None = Field(None)

    list_price: Decimal | None = Field(None)
    listing_date: str | None = Field(None, description="上架日期 (YYYY-MM-DD 格式)")

    model_config = ConfigDict(from_attributes=True)


class ProjectResponse(BaseModel):
    """项目完整响应模型 - 适配新的规范化表结构.

    业务日期字段使用字符串类型 (YYYY-MM-DD) 避免时区问题.
    """

    id: str = Field(..., description="项目ID")
    name: str | None = Field(None, description="项目名称")
    status: str = Field(..., description="项目状态")
    created_at: datetime
    updated_at: datetime

    community_id: str | None = Field(None, description="小区ID")
    community_name: str | None = None
    address: str | None = None
    area: Decimal | None = None
    layout: str | None = None
    orientation: str | None = None
    is_deleted: bool = False

    renovation_stage: str | None = None

    contract_no: str | None = Field(None, description="合同编号")
    signing_price: Decimal | None = Field(None, description="签约价格(万)")
    signing_date: str | None = None
    signing_period: int | None = None
    extension_period: int | None = None
    extension_rent: Decimal | None = None
    cost_assumption_type: str | None = None
    cost_assumption_other: str | None = None
    planned_handover_date: str | None = None
    other_agreements: str | None = None
    contract_status: str | None = None

    owner_name: str | None = None
    owner_phone: str | None = None
    owner_id_card: str | None = None
    owner_info: str | None = None

    list_price: Decimal | None = Field(None, description="挂牌价(万)")
    listing_date: str | None = None
    sold_price: Decimal | None = None
    sold_date: str | None = None
    transaction_status: str | None = None

    channel_manager_id: str | None = Field(None, description="渠道负责人ID")
    property_agent_id: str | None = Field(None, description="房源维护人ID(讲房人)")
    negotiator_id: str | None = Field(None, description="联卖谈判人ID")

    total_income: Decimal | None = Field(default_factory=Decimal)
    total_expense: Decimal | None = Field(default_factory=Decimal)
    net_cash_flow: Decimal | None = Field(default_factory=Decimal)
    roi: float | None = Field(default=0.0)

    signing_materials: list[Any] | None = Field(None, description="签约材料列表")
    sales_records: list[Any] | None = Field(None, description="销售活动记录列表")
    renovation_photos: list[Any] | None = Field(None, description="装修阶段照片列表")

    renovation_stage_dates: dict[str, str] | None = Field(
        None,
        description="各阶段日期映射",
        validation_alias=AliasChoices("renovation_stage_dates", "renovationStageDates"),
        serialization_alias="renovationStageDates",
    )

    project_manager: UserBrief | None = Field(None, description="项目负责人")

    model_config = ConfigDict(from_attributes=True)


class ProjectListResponse(PaginatedResponse[ProjectResponse]):
    """项目列表响应 - 统一分页格式."""


class ProjectStatsResponse(BaseModel):
    """项目统计响应."""

    signing: int
    renovating: int
    selling: int
    sold: int
    model_config = ConfigDict(from_attributes=True)


class StatusUpdate(BaseModel):
    """项目状态更新请求."""

    status: ProjectStatus
    listing_date: str | None = Field(None, description="上架日期 (YYYY-MM-DD 格式)")
    list_price: Decimal | None = Field(None, description="挂牌价(万元)")

    @field_validator("listing_date", mode="before")
    @classmethod
    def validate_listing_date(cls, v: str | None) -> str | None:
        """验证上架日期."""
        if v is None:
            return None
        return v
