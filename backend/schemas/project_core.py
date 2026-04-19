from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, ConfigDict, AliasChoices, field_validator
from models.base import ProjectStatus
from .project_sales import SalesRecordResponse
from .project_renovation import RenovationPhotoResponse
from .contract import SigningMaterial


def parse_date_string(value: Union[str, datetime, None]) -> Optional[datetime]:
    """解析日期字符串为 datetime 对象
    支持格式: YYYY-MM-DD, ISO 格式字符串, 或 datetime 对象
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # 尝试解析 YYYY-MM-DD 格式
        if len(value) == 10 and value.count('-') == 2:
            try:
                year, month, day = map(int, value.split('-'))
                return datetime(year, month, day)
            except ValueError:
                pass
        # 尝试解析 ISO 格式
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            pass
        # 尝试其他格式
        try:
            return datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ')
        except ValueError:
            pass
    return None

# ========== 基础项目模型 ==========

class ProjectBase(BaseModel):
    """项目基础字段 - 适配新的规范化表结构"""
    # 基础信息
    name: Optional[str] = Field(None, min_length=1, max_length=200, description="项目名称")
    community_name: Optional[str] = Field(None, max_length=200, description="小区名称")
    address: Optional[str] = Field(None, max_length=500, description="物业地址")
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    layout: Optional[str] = Field(None, max_length=50, description="户型")
    orientation: Optional[str] = Field(None, max_length=50, description="朝向")

    # 财务缓存字段
    total_income: Decimal = Field(default_factory=Decimal)
    total_expense: Decimal = Field(default_factory=Decimal)
    net_cash_flow: Decimal = Field(default_factory=Decimal)
    roi: float = Field(default=0.0)

    model_config = ConfigDict(from_attributes=True)


class ProjectCreate(BaseModel):
    """创建项目请求模型 - 已适配规范化表结构"""
    # 基础信息 (projects 表)
    community_name: str = Field(..., max_length=200, description="小区名称")
    address: str = Field(..., max_length=500, description="物业地址")
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    layout: Optional[str] = Field(None, max_length=50, description="户型")
    orientation: Optional[str] = Field(None, max_length=50, description="朝向")

    # 签约相关（会创建到 project_contracts 表）
    contract_no: str = Field(..., max_length=100, description="合同编号")
    signing_price: Optional[Decimal] = Field(None, description="签约价格(万)")
    signing_date: Optional[str] = Field(None, description="签约日期 (YYYY-MM-DD 格式)")
    signing_period: Optional[int] = Field(None, description="合同周期(天)")
    extension_period: Optional[int] = Field(None, description="顺延期(天)")
    extension_rent: Optional[Decimal] = Field(None, description="顺延期租金(元/月)")
    cost_assumption: Optional[str] = Field(None, max_length=50, description="税费及佣金承担")
    planned_handover_date: Optional[str] = Field(None, description="计划交房时间 (YYYY-MM-DD 格式)")
    other_agreements: Optional[str] = Field(None, description="其他约定")
    signing_materials: Optional[List[SigningMaterial]] = Field(None, description="签约材料列表")

    # 业主相关（会创建到 project_owners 表）
    owner_name: Optional[str] = Field(None, max_length=100, description="业主姓名")
    owner_phone: Optional[str] = Field(None, max_length=20, description="业主电话")
    owner_id_card: Optional[str] = Field(None, max_length=18, description="业主身份证号")
    owner_info: Optional[str] = Field(None, description="业主备注")
    notes: Optional[str] = Field(None, description="备注（映射到 owner_info）")

    # 销售相关（会创建到 project_sales 表）
    list_price: Optional[Decimal] = Field(None, description="挂牌价(万)")
    listing_date: Optional[str] = Field(None, description="上架日期 (YYYY-MM-DD 格式)")

    model_config = ConfigDict(from_attributes=True)


class ProjectUpdate(BaseModel):
    """更新项目请求模型 (所有字段可选) - 已适配规范化表结构"""
    # 基础信息
    community_name: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    area: Optional[Decimal] = Field(None)
    layout: Optional[str] = Field(None, max_length=50)
    orientation: Optional[str] = Field(None, max_length=50)

    # 签约相关（更新到 project_contracts 表）
    contract_no: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("contract_no", "contractNo"),
        max_length=100,
    )
    signing_price: Optional[Decimal] = Field(None)
    signing_date: Optional[str] = Field(None, description="签约日期 (YYYY-MM-DD 格式)")
    signing_period: Optional[int] = Field(None)
    extension_period: Optional[int] = Field(
        None,
        validation_alias=AliasChoices("extension_period", "extensionPeriod"),
    )
    extension_rent: Optional[Decimal] = Field(
        None,
        validation_alias=AliasChoices("extension_rent", "extensionRent"),
    )
    cost_assumption: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("cost_assumption", "costAssumption"),
        max_length=50,
    )
    planned_handover_date: Optional[str] = Field(None, description="计划交房时间 (YYYY-MM-DD 格式)")
    other_agreements: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("other_agreements", "otherAgreements"),
    )
    signing_materials: Optional[List[SigningMaterial]] = Field(None)

    # 业主相关（更新到 project_owners 表）
    owner_name: Optional[str] = Field(None, max_length=100)
    owner_phone: Optional[str] = Field(None, max_length=20)
    owner_id_card: Optional[str] = Field(None, max_length=18)
    owner_info: Optional[str] = Field(None)
    notes: Optional[str] = Field(None)  # 映射到 owner_info

    # 销售相关（更新到 project_sales 表）
    list_price: Optional[Decimal] = Field(None)
    listing_date: Optional[str] = Field(None, description="上架日期 (YYYY-MM-DD 格式)")

    model_config = ConfigDict(from_attributes=True)


class ProjectResponse(BaseModel):
    """
    项目完整响应模型 - 适配新的规范化表结构
    业务日期字段使用字符串类型 (YYYY-MM-DD) 避免时区问题
    """
    id: str = Field(..., description="项目ID")
    name: Optional[str] = Field(None, description="项目名称")
    status: str = Field(..., description="项目状态")
    created_at: datetime
    updated_at: datetime

    # 基础信息
    community_name: Optional[str] = None
    address: Optional[str] = None
    area: Optional[Decimal] = None
    layout: Optional[str] = None
    orientation: Optional[str] = None
    is_deleted: bool = False

    # 状态相关
    renovation_stage: Optional[str] = None

    # 合同信息（来自 project_contracts 表）
    contract_no: Optional[str] = Field(None, description="合同编号")
    signing_price: Optional[Decimal] = Field(None, description="签约价格(万)")
    signing_date: Optional[str] = None  # YYYY-MM-DD 格式
    signing_period: Optional[int] = None
    extension_period: Optional[int] = None
    extension_rent: Optional[Decimal] = None
    cost_assumption: Optional[str] = None
    planned_handover_date: Optional[str] = None  # YYYY-MM-DD 格式
    other_agreements: Optional[str] = None
    contract_status: Optional[str] = None

    # 业主信息（来自 project_owners 表）
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_id_card: Optional[str] = None
    owner_info: Optional[str] = None

    # 销售信息（来自 project_sales 表）
    list_price: Optional[Decimal] = Field(None, description="挂牌价(万)")
    listing_date: Optional[str] = None  # YYYY-MM-DD 格式
    sold_price: Optional[Decimal] = None
    sold_date: Optional[str] = None  # YYYY-MM-DD 格式
    transaction_status: Optional[str] = None

    # 销售角色ID（来自 project_sales 表）
    channel_manager_id: Optional[str] = Field(None, description="渠道负责人ID")
    property_agent_id: Optional[str] = Field(None, description="房源维护人ID(讲房人)")
    negotiator_id: Optional[str] = Field(None, description="联卖谈判人ID")

    # 财务缓存
    total_income: Optional[Decimal] = Field(default_factory=Decimal)
    total_expense: Optional[Decimal] = Field(default_factory=Decimal)
    net_cash_flow: Optional[Decimal] = Field(default_factory=Decimal)
    roi: Optional[float] = Field(default=0.0)

    # 签约材料附件
    signing_materials: Optional[List[SigningMaterial]] = Field(None, description="签约材料列表")

    # 销售记录（来自 project_interactions 表）
    sales_records: Optional[List[SalesRecordResponse]] = Field(None, description="销售活动记录列表")

    # 装修照片（来自 project_renovation_photos 表）
    renovation_photos: Optional[List[RenovationPhotoResponse]] = Field(None, description="装修阶段照片列表")

    # 阶段日期映射（用于蜕变影像展示）
    renovation_stage_dates: Optional[Dict[str, str]] = Field(
        None,
        description="各阶段日期映射",
        validation_alias=AliasChoices("renovation_stage_dates", "renovationStageDates"),
        serialization_alias="renovationStageDates"
    )

    model_config = ConfigDict(from_attributes=True)

class ProjectListResponse(BaseModel):
    items: List[ProjectResponse]
    total: int
    page: int
    page_size: int
    model_config = ConfigDict(from_attributes=True)

class ProjectStatsResponse(BaseModel):
    signing: int
    renovating: int
    selling: int
    sold: int
    model_config = ConfigDict(from_attributes=True)

class StatusUpdate(BaseModel):
    status: ProjectStatus
    listing_date: Optional[str] = Field(None, description="上架日期 (YYYY-MM-DD 格式)")
    list_price: Optional[Decimal] = Field(None, description="挂牌价(万元)")

    @field_validator('listing_date', mode='before')
    @classmethod
    def validate_listing_date(cls, v):
        if v is None:
            return None
        # 保持字符串格式，由服务层处理转换
        return v
