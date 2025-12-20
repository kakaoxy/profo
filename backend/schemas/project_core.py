from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from models.base import ProjectStatus
from .project_sales import SalesRecordResponse

# ========== 基础项目模型 ==========

class ProjectBase(BaseModel):
    """项目基础字段"""
    name: str = Field(..., min_length=1, max_length=200, description="项目名称")
    community_name: Optional[str] = Field(None, max_length=200, description="小区名称")
    address: Optional[str] = Field(None, max_length=500, description="物业地址")
    manager: Optional[str] = Field(None, max_length=100, description="负责人")
    
    # 签约相关
    signing_price: Optional[Decimal] = Field(None, description="签约价格")
    signing_date: Optional[datetime] = Field(None, description="签约日期")
    signing_period: Optional[int] = Field(None, description="签约周期")
    planned_handover_date: Optional[datetime] = Field(None, description="计划交房时间")
    signing_materials: Optional[Dict[str, Any]] = Field(None, description="签约材料")
    
    # 业主信息
    owner_name: Optional[str] = Field(None, max_length=100, description="业主姓名")
    owner_phone: Optional[str] = Field(None, max_length=20, description="业主电话")
    owner_id_card: Optional[str] = Field(None, max_length=18, description="业主身份证号")
    owner_info: Optional[Dict[str, Any]] = Field(None, description="业主其他信息")
    
    # 其他信息
    notes: Optional[str] = Field(None, description="备注")
    tags: Optional[List[str]] = Field(None, description="标签")
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    
    # 扩展字段
    extensionPeriod: Optional[int] = Field(None, description="顺延期(月)")
    extensionRent: Optional[Decimal] = Field(None, description="顺延期租金(元/月)")
    costAssumption: Optional[str] = Field(None, max_length=50, description="税费及佣金承担")
    otherAgreements: Optional[str] = Field(None, description="其他约定")
    remarks: Optional[str] = Field(None, description="备注")

    # [关键] 财务缓存字段 (继承给 Response 用)
    total_income: Decimal = Field(default=Decimal(0))
    total_expense: Decimal = Field(default=Decimal(0))
    net_cash_flow: Decimal = Field(default=Decimal(0))
    roi: float = Field(default=0.0)

    model_config = ConfigDict(from_attributes=True)

class ProjectCreate(ProjectBase):
    """创建项目请求模型"""
    pass

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
    extensionPeriod: Optional[int] = Field(None)
    extensionRent: Optional[Decimal] = Field(None)
    costAssumption: Optional[str] = Field(None, max_length=50)
    otherAgreements: Optional[str] = Field(None)
    remarks: Optional[str] = Field(None)
    
    # 销售角色
    channelManager: Optional[str] = Field(None, max_length=100)
    presenter: Optional[str] = Field(None, max_length=100)
    negotiator: Optional[str] = Field(None, max_length=100)
    
    property_agent: Optional[str] = Field(None, max_length=100)
    client_agent: Optional[str] = Field(None, max_length=100)
    first_viewer: Optional[str] = Field(None, max_length=100)
    list_price: Optional[Decimal] = Field(None)

    model_config = ConfigDict(from_attributes=True)

class ProjectResponse(ProjectBase):
    """
    项目完整响应模型
    继承自 ProjectBase，所以包含了 total_income, roi 等字段
    """
    id: str = Field(..., description="项目ID")
    status: str = Field(..., description="项目状态")
    created_at: datetime
    updated_at: datetime
    
    # 状态相关
    renovation_stage: Optional[str] = None
    status_changed_at: Optional[datetime] = None
    stage_completed_at: Optional[datetime] = None
    sold_at: Optional[datetime] = None
    
    # [冗余声明] 确保净现金流一定存在，虽然父类有，这里覆盖也没问题
    net_cash_flow: Optional[Decimal] = Field(default=Decimal(0), description="净现金流")
    
    # 销售相关
    sale_price: Optional[Decimal] = None # 在售价格
    list_price: Optional[Decimal] = None # 挂牌价
    
    # [关键修复] 显式定义成交价字段，对应数据库模型的 soldPrice
    soldPrice: Optional[Decimal] = None 
    # [关键修复] 显式定义成交日期，对应数据库模型的 soldDate
    soldDate: Optional[datetime] = None 

    # 销售角色
    property_agent: Optional[str] = None
    client_agent: Optional[str] = None
    first_viewer: Optional[str] = None
    channelManager: Optional[str] = None
    presenter: Optional[str] = None
    negotiator: Optional[str] = None
    
    sales_records: Optional[List[SalesRecordResponse]] = Field(default=[], description="销售记录")

    viewingRecords: Optional[List[Dict[str, Any]]] = None 
    offerRecords: Optional[List[Dict[str, Any]]] = None
    negotiationRecords: Optional[List[Dict[str, Any]]] = None

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