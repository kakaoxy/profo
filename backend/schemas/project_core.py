from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, AliasChoices
from models.base import ProjectStatus
from .project_sales import SalesRecordResponse
from .project_renovation import RenovationPhotoResponse

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
    total_income: Decimal = Field(default=Decimal(0))
    total_expense: Decimal = Field(default=Decimal(0))
    net_cash_flow: Decimal = Field(default=Decimal(0))
    roi: float = Field(default=0.0)

    model_config = ConfigDict(from_attributes=True)


class ProjectCreate(BaseModel):
    """创建项目请求模型 - 包含所有可创建字段"""
    # 基础信息
    community_name: Optional[str] = Field(None, max_length=200, description="小区名称")
    address: Optional[str] = Field(None, max_length=500, description="物业地址")
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    layout: Optional[str] = Field(None, max_length=50, description="户型")
    orientation: Optional[str] = Field(None, max_length=50, description="朝向")

    # 签约相关（会创建到 project_contracts）
    signing_price: Optional[Decimal] = Field(None, description="签约价格(万)")
    signing_date: Optional[datetime] = Field(None, description="签约日期")
    signing_period: Optional[int] = Field(None, description="合同周期(天)")
    extension_period: Optional[int] = Field(None, description="顺延期(天)")
    extension_rent: Optional[Decimal] = Field(None, description="顺延期租金(元/月)")
    cost_assumption: Optional[str] = Field(None, max_length=50, description="税费及佣金承担")
    planned_handover_date: Optional[datetime] = Field(None, description="计划交房时间")
    other_agreements: Optional[str] = Field(None, description="其他约定")
    signing_materials: Optional[List[str]] = Field(None, description="签约材料URLs")

    # 业主相关（会创建到 project_owners）
    owner_name: Optional[str] = Field(None, max_length=100, description="业主姓名")
    owner_phone: Optional[str] = Field(None, max_length=20, description="业主电话")
    owner_id_card: Optional[str] = Field(None, max_length=18, description="业主身份证号")
    owner_info: Optional[str] = Field(None, description="业主备注")

    # 销售相关（会创建到 project_sales）
    list_price: Optional[Decimal] = Field(None, description="挂牌价(万)")
    listing_date: Optional[datetime] = Field(None, description="上架日期")

    # 扩展字段
    notes: Optional[str] = Field(None, description="备注")
    tags: Optional[List[str]] = Field(None, description="标签")

    model_config = ConfigDict(from_attributes=True)

class ProjectUpdate(BaseModel):
    """更新项目请求模型 (所有字段可选)"""
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    community_name: Optional[str] = Field(None, max_length=200)
    address: Optional[str] = Field(None, max_length=500)
    manager: Optional[str] = Field(None, max_length=100)
    signing_price: Optional[Decimal] = Field(None)
    signing_date: Optional[datetime] = Field(None)
    signing_period: Optional[int] = Field(None)
    planned_handover_date: Optional[datetime] = Field(None)
    signing_materials: Optional[Dict[str, Any]] = Field(None)
    owner_name: Optional[str] = Field(None, max_length=100)
    owner_phone: Optional[str] = Field(None, max_length=20)
    owner_id_card: Optional[str] = Field(None, max_length=18)
    owner_info: Optional[Dict[str, Any]] = Field(None)
    notes: Optional[str] = Field(None)
    tags: Optional[List[str]] = Field(None)
    area: Optional[Decimal] = Field(None)
    rooms: Optional[int] = Field(None)
    halls: Optional[int] = Field(None)
    baths: Optional[int] = Field(None)
    orientation: Optional[str] = Field(None, max_length=50)
    layout: Optional[str] = Field(None, max_length=50)
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
    other_agreements: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("other_agreements", "otherAgreements"),
    )
    remarks: Optional[str] = Field(None)
    
    # 销售角色
    channel_manager: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("channel_manager", "channelManager"),
        max_length=100,
    )
    presenter: Optional[str] = Field(None, max_length=100)
    negotiator: Optional[str] = Field(None, max_length=100)
    
    property_agent: Optional[str] = Field(None, max_length=100)
    client_agent: Optional[str] = Field(None, max_length=100)
    first_viewer: Optional[str] = Field(None, max_length=100)
    list_price: Optional[Decimal] = Field(None)
    listing_date: Optional[datetime] = Field(None, description="上架日期")

    model_config = ConfigDict(from_attributes=True)

class ProjectResponse(BaseModel):
    """
    项目完整响应模型 - 适配新的规范化表结构
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

    # 财务缓存
    total_income: Optional[Decimal] = Field(default=Decimal(0))
    total_expense: Optional[Decimal] = Field(default=Decimal(0))
    net_cash_flow: Optional[Decimal] = Field(default=Decimal(0))
    roi: Optional[float] = Field(default=0.0)

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
    listing_date: Optional[datetime] = Field(None, description="上架日期")
    list_price: Optional[Decimal] = Field(None, description="挂牌价(万元)")
