"""
项目管理相关Pydantic模式
"""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic import ConfigDict

from models.base import ProjectStatus, RenovationStage, CashFlowType, CashFlowCategory, RecordType


# ========== 基础响应模型 ==========

class BaseResponse(BaseModel):
    """基础响应模型"""
    code: int = Field(default=200, description="响应码")
    msg: str = Field(default="success", description="响应消息")
    data: Optional[Any] = Field(default=None, description="响应数据")

    model_config = ConfigDict(from_attributes=True)


class GenericBaseResponse(BaseModel):
    """通用基础响应模型"""
    code: int = Field(default=200, description="响应码")
    msg: str = Field(default="success", description="响应消息")
    data: Optional[Any] = Field(default=None, description="响应数据")

    model_config = ConfigDict(from_attributes=True)


# ========== 项目相关模型 ==========

class ProjectCreate(BaseModel):
    """创建项目请求模型"""
    name: str = Field(..., min_length=1, max_length=200, description="项目名称")
    community_name: Optional[str] = Field(None, max_length=200, description="小区名称")
    address: Optional[str] = Field(None, max_length=500, description="物业地址")
    manager: Optional[str] = Field(None, max_length=100, description="负责人")
    signing_price: Optional[Decimal] = Field(None, description="签约价格")
    signing_date: Optional[datetime] = Field(None, description="签约日期")
    signing_period: Optional[int] = Field(None, description="签约周期")
    planned_handover_date: Optional[datetime] = Field(None, description="计划交房时间")
    signing_materials: Optional[Dict[str, Any]] = Field(None, description="签约材料")
    owner_name: Optional[str] = Field(None, max_length=100, description="业主姓名")
    owner_phone: Optional[str] = Field(None, max_length=20, description="业主电话")
    owner_id_card: Optional[str] = Field(None, max_length=18, description="业主身份证号")
    owner_info: Optional[Dict[str, Any]] = Field(None, description="业主其他信息")
    notes: Optional[str] = Field(None, description="备注")
    tags: Optional[List[str]] = Field(None, description="标签")
    
    # 新增字段
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    extensionPeriod: Optional[int] = Field(None, description="顺延期(月)")
    extensionRent: Optional[Decimal] = Field(None, description="顺延期租金(元/月)")
    costAssumption: Optional[str] = Field(None, max_length=50, description="税费及佣金承担")
    otherAgreements: Optional[str] = Field(None, description="其他约定")
    remarks: Optional[str] = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class ProjectUpdate(BaseModel):
    """更新项目请求模型"""
    name: Optional[str] = Field(None, min_length=1, max_length=200, description="项目名称")
    community_name: Optional[str] = Field(None, min_length=1, max_length=200, description="小区名称")
    address: Optional[str] = Field(None, min_length=1, max_length=500, description="物业地址")
    manager: Optional[str] = Field(None, max_length=100, description="负责人")
    signing_price: Optional[Decimal] = Field(None, description="签约价格")
    signing_date: Optional[datetime] = Field(None, description="签约日期")
    signing_period: Optional[int] = Field(None, description="签约周期")
    planned_handover_date: Optional[datetime] = Field(None, description="计划交房时间")
    signing_materials: Optional[Dict[str, Any]] = Field(None, description="签约材料")
    owner_name: Optional[str] = Field(None, max_length=100, description="业主姓名")
    owner_phone: Optional[str] = Field(None, max_length=20, description="业主电话")
    owner_id_card: Optional[str] = Field(None, max_length=18, description="业主身份证号")
    owner_info: Optional[Dict[str, Any]] = Field(None, description="业主其他信息")
    notes: Optional[str] = Field(None, description="备注")
    tags: Optional[List[str]] = Field(None, description="标签")
    
    # 新增字段
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    extensionPeriod: Optional[int] = Field(None, description="顺延期(月)")
    extensionRent: Optional[Decimal] = Field(None, description="顺延期租金(元/月)")
    costAssumption: Optional[str] = Field(None, max_length=50, description="税费及佣金承担")
    otherAgreements: Optional[str] = Field(None, description="其他约定")
    remarks: Optional[str] = Field(None, description="备注")
    
    # 新增销售角色字段
    channelManager: Optional[str] = Field(None, max_length=100, description="渠道负责人")
    presenter: Optional[str] = Field(None, max_length=100, description="讲房师")
    negotiator: Optional[str] = Field(None, max_length=100, description="联卖谈判")
    
    # 新增销售记录字段
    viewingRecords: Optional[List[Dict[str, Any]]] = Field(None, description="带看记录")
    offerRecords: Optional[List[Dict[str, Any]]] = Field(None, description="出价记录")
    negotiationRecords: Optional[List[Dict[str, Any]]] = Field(None, description="面谈记录")
    
    # 新增已售相关字段
    soldPrice: Optional[Decimal] = Field(None, description="成交价格")
    soldDate: Optional[datetime] = Field(None, description="成交日期")
    
    # 新增销售相关字段
    property_agent: Optional[str] = Field(None, max_length=100, description="房源维护人")
    client_agent: Optional[str] = Field(None, max_length=100, description="客源维护人")
    first_viewer: Optional[str] = Field(None, max_length=100, description="首看人")
    list_price: Optional[Decimal] = Field(None, description="挂牌价")
    
    # 新增改造阶段完成时间字段
    renovationStageDates: Optional[Dict[str, str]] = Field(None, description="改造阶段完成时间")

    model_config = ConfigDict(from_attributes=True)


class ProjectResponse(BaseModel):
    """项目响应模型"""
    id: str = Field(..., description="项目ID")
    name: str = Field(..., description="项目名称")
    community_name: str = Field(..., description="小区名称")
    address: str = Field(..., description="物业地址")
    manager: Optional[str] = Field(None, description="负责人")
    signing_price: Optional[Decimal] = Field(None, description="签约价格")
    signing_date: Optional[datetime] = Field(None, description="签约日期")
    signing_period: Optional[int] = Field(None, description="签约周期")
    planned_handover_date: Optional[datetime] = Field(None, description="计划交房时间")
    signing_materials: Optional[Dict[str, Any]] = Field(None, description="签约材料")
    owner_name: Optional[str] = Field(None, description="业主姓名")
    owner_phone: Optional[str] = Field(None, description="业主电话")
    owner_id_card: Optional[str] = Field(None, description="业主身份证号")
    owner_info: Optional[Dict[str, Any]] = Field(None, description="业主其他信息")
    status: str = Field(..., description="项目状态")
    renovation_stage: Optional[str] = Field(None, description="改造子阶段")
    status_changed_at: Optional[datetime] = Field(None, description="状态变更时间")
    stage_completed_at: Optional[datetime] = Field(None, description="阶段完成时间")
    sold_at: Optional[datetime] = Field(None, description="售出时间")
    sale_price: Optional[Decimal] = Field(None, description="售价")
    list_price: Optional[Decimal] = Field(None, description="挂牌价")
    property_agent: Optional[str] = Field(None, description="房源维护人")
    client_agent: Optional[str] = Field(None, description="客源维护人")
    first_viewer: Optional[str] = Field(None, description="首看人")
    notes: Optional[str] = Field(None, description="备注")
    tags: Optional[List[str]] = Field(None, description="标签")
    net_cash_flow: Optional[Decimal] = Field(None, description="净现金流")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    
    # 新增字段
    area: Optional[Decimal] = Field(None, description="产证面积(m²)")
    extensionPeriod: Optional[int] = Field(None, description="顺延期(月)")
    extensionRent: Optional[Decimal] = Field(None, description="顺延期租金(元/月)")
    costAssumption: Optional[str] = Field(None, description="税费及佣金承担")
    otherAgreements: Optional[str] = Field(None, description="其他约定")
    remarks: Optional[str] = Field(None, description="备注")
    
    # 销售相关字段
    channelManager: Optional[str] = Field(None, description="渠道负责人")
    presenter: Optional[str] = Field(None, description="讲房师")
    negotiator: Optional[str] = Field(None, description="联卖谈判")
    viewingRecords: Optional[List[Dict[str, Any]]] = Field(None, description="带看记录")
    offerRecords: Optional[List[Dict[str, Any]]] = Field(None, description="出价记录")
    negotiationRecords: Optional[List[Dict[str, Any]]] = Field(None, description="面谈记录")
    
    # 已售相关字段
    soldPrice: Optional[Decimal] = Field(None, description="成交价格")
    soldDate: Optional[datetime] = Field(None, description="成交日期")
    
    # 改造阶段完成时间字段
    renovationStageDates: Optional[Dict[str, str]] = Field(None, description="改造阶段完成时间")

    model_config = ConfigDict(from_attributes=True)


class ProjectListResponse(BaseModel):
    """项目列表响应模型"""
    items: List[ProjectResponse] = Field(..., description="项目列表")
    total: int = Field(..., description="总数量")
    page: int = Field(default=1, description="当前页码")
    page_size: int = Field(default=50, description="每页数量")

    model_config = ConfigDict(from_attributes=True)


class ProjectStatsResponse(BaseModel):
    """项目统计响应模型"""
    signing: int = Field(..., description="签约阶段数量")
    renovating: int = Field(..., description="改造阶段数量")
    selling: int = Field(..., description="在售阶段数量")
    sold: int = Field(..., description="已售阶段数量")

    model_config = ConfigDict(from_attributes=True)


# ========== 改造阶段相关模型 ==========

class RenovationUpdate(BaseModel):
    """更新改造阶段请求模型"""
    renovation_stage: RenovationStage = Field(..., description="改造子阶段")
    stage_completed_at: Optional[datetime] = Field(None, description="阶段完成时间")

    model_config = ConfigDict(from_attributes=True)


class RenovationPhotoUpload(BaseModel):
    """改造阶段照片上传请求模型"""
    url: str = Field(..., min_length=1, max_length=500, description="图片URL")
    filename: Optional[str] = Field(None, max_length=200, description="文件名")
    description: Optional[str] = Field(None, description="描述")

    model_config = ConfigDict(from_attributes=True)


class RenovationPhotoResponse(BaseModel):
    """改造阶段照片响应模型"""
    id: str = Field(..., description="照片ID")
    project_id: str = Field(..., description="项目ID")
    stage: str = Field(..., description="改造阶段")
    url: str = Field(..., description="图片URL")
    filename: Optional[str] = Field(None, description="文件名")
    description: Optional[str] = Field(None, description="描述")
    created_at: datetime = Field(..., description="创建时间")

    model_config = ConfigDict(from_attributes=True)


# ========== 项目状态流转相关模型 ==========

class StatusUpdate(BaseModel):
    """状态更新请求模型"""
    status: ProjectStatus = Field(..., description="目标状态")

    model_config = ConfigDict(from_attributes=True)


class ProjectCompleteRequest(BaseModel):
    """项目完成请求模型"""
    sold_price: Decimal = Field(..., gt=0, description="售价")
    sold_date: datetime = Field(..., description="售出日期")

    model_config = ConfigDict(from_attributes=True)


# ========== 现金流相关模型 ==========

class CashFlowRecordCreate(BaseModel):
    """创建现金流记录请求模型"""
    type: CashFlowType = Field(..., description="类型：income/expense")
    category: CashFlowCategory = Field(..., description="分类")
    amount: Decimal = Field(..., description="金额")
    date: datetime = Field(..., description="日期")
    description: Optional[str] = Field(None, description="描述")
    related_stage: Optional[str] = Field(None, description="关联阶段")

    model_config = ConfigDict(from_attributes=True)

    @model_validator(mode='after')
    def validate_category_match(self) -> 'CashFlowRecordCreate':
        """校验现金流类型和分类是否匹配"""
        expense_categories = {
            CashFlowCategory.PERFORMANCE_BOND,
            CashFlowCategory.AGENCY_COMMISSION,
            CashFlowCategory.RENOVATION_FEE,
            CashFlowCategory.MARKETING_FEE,
            CashFlowCategory.OTHER_EXPENSE,
            CashFlowCategory.TAX_FEE,
            CashFlowCategory.OPERATION_FEE,
        }

        income_categories = {
            CashFlowCategory.BOND_RETURN,
            CashFlowCategory.PREMIUM,
            CashFlowCategory.SERVICE_FEE,
            CashFlowCategory.OTHER_INCOME,
            CashFlowCategory.SALE_PRICE,
        }

        if self.type == CashFlowType.EXPENSE and self.category not in expense_categories:
            raise ValueError(f"支出类型不能使用分类: {self.category}")

        if self.type == CashFlowType.INCOME and self.category not in income_categories:
            raise ValueError(f"收入类型不能使用分类: {self.category}")

        return self


class CashFlowRecordResponse(BaseModel):
    """现金流记录响应模型"""
    id: str = Field(..., description="记录ID")
    project_id: str = Field(..., description="项目ID")
    type: str = Field(..., description="类型")
    category: str = Field(..., description="分类")
    amount: Decimal = Field(..., description="金额")
    date: datetime = Field(..., description="日期")
    description: Optional[str] = Field(None, description="描述")
    related_stage: Optional[str] = Field(None, description="关联阶段")
    created_at: datetime = Field(..., description="创建时间")

    model_config = ConfigDict(from_attributes=True)


class CashFlowSummary(BaseModel):
    """现金流汇总响应模型"""
    total_income: Decimal = Field(..., description="总收入")
    total_expense: Decimal = Field(..., description="总支出")
    net_cash_flow: Decimal = Field(..., description="净现金流")
    roi: float = Field(..., description="投资回报率 (收入-支出)/支出")

    model_config = ConfigDict(from_attributes=True)


class CashFlowResponse(BaseModel):
    """现金流响应模型"""
    records: List[CashFlowRecordResponse] = Field(..., description="收支明细列表")
    summary: CashFlowSummary = Field(..., description="汇总信息")

    model_config = ConfigDict(from_attributes=True)


# ========== 销售记录相关模型 ==========

class SalesRecordCreate(BaseModel):
    """创建销售记录请求模型"""
    record_type: RecordType = Field(..., description="记录类型")
    customer_name: Optional[str] = Field(None, max_length=100, description="客户姓名")
    customer_phone: Optional[str] = Field(None, max_length=20, description="客户电话")
    customer_info: Optional[Dict[str, Any]] = Field(None, description="客户其他信息")
    record_date: datetime = Field(..., description="记录日期")
    record_time: Optional[str] = Field(None, max_length=50, description="记录时间")
    price: Optional[Decimal] = Field(None, description="出价/售价")
    notes: Optional[str] = Field(None, description="备注")
    feedback: Optional[str] = Field(None, description="反馈")
    result: Optional[str] = Field(None, max_length=50, description="结果")
    related_agent: Optional[str] = Field(None, max_length=100, description="相关经纪人")

    model_config = ConfigDict(from_attributes=True)


class SalesRecordResponse(BaseModel):
    """销售记录响应模型"""
    id: str = Field(..., description="记录ID")
    project_id: str = Field(..., description="项目ID")
    record_type: str = Field(..., description="记录类型")
    customer_name: Optional[str] = Field(None, description="客户姓名")
    customer_phone: Optional[str] = Field(None, description="客户电话")
    customer_info: Optional[Dict[str, Any]] = Field(None, description="客户其他信息")
    record_date: datetime = Field(..., description="记录日期")
    record_time: Optional[str] = Field(None, description="记录时间")
    price: Optional[Decimal] = Field(None, description="出价/售价")
    notes: Optional[str] = Field(None, description="备注")
    feedback: Optional[str] = Field(None, description="反馈")
    result: Optional[str] = Field(None, description="结果")
    related_agent: Optional[str] = Field(None, description="相关经纪人")
    created_at: datetime = Field(..., description="创建时间")

    model_config = ConfigDict(from_attributes=True)


class SalesRolesUpdate(BaseModel):
    """更新销售角色请求模型"""
    property_agent: Optional[str] = Field(None, max_length=100, description="房源维护人")
    client_agent: Optional[str] = Field(None, max_length=100, description="客源维护人")
    first_viewer: Optional[str] = Field(None, max_length=100, description="首看人")

    model_config = ConfigDict(from_attributes=True)


# ========== 项目报告相关模型 ==========

class ProjectReportResponse(BaseModel):
    """项目报告响应模型"""
    project_id: str = Field(..., description="项目ID")
    project_name: str = Field(..., description="项目名称")
    status: str = Field(..., description="项目状态")

    # 关键节点时间
    signing_date: Optional[datetime] = Field(None, description="签约日期")
    renovation_start_date: Optional[datetime] = Field(None, description="改造开始日期")
    renovation_end_date: Optional[datetime] = Field(None, description="改造结束日期")
    listing_date: Optional[datetime] = Field(None, description="挂牌日期")
    sold_date: Optional[datetime] = Field(None, description="售出日期")

    # 财务信息
    total_investment: Decimal = Field(..., description="总投入")
    total_income: Decimal = Field(..., description="总收入")
    net_profit: Decimal = Field(..., description="净利润")
    roi: float = Field(..., description="投资回报率")

    # 项目信息
    address: str = Field(..., description="物业地址")
    sale_price: Optional[Decimal] = Field(None, description="售价")
    list_price: Optional[Decimal] = Field(None, description="挂牌价")

    model_config = ConfigDict(from_attributes=True)