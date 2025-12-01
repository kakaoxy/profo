"""
项目管理相关模型
"""
from sqlalchemy import Column, String, Float, DateTime, Text, ForeignKey, Integer, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.sqlite import JSON
from datetime import datetime

from .base import BaseModel, ProjectStatus, RenovationStage, RecordType


class Project(BaseModel):
    """项目主表"""
    __tablename__ = "projects"

    # 基本信息
    name = Column(String(200), nullable=False, comment="项目名称")
    community_name = Column(String(200), nullable=True, comment="小区名称")
    address = Column(String(500), nullable=True, comment="物业地址")
    manager = Column(String(100), nullable=True, comment="负责人")

    # 签约信息
    signing_price = Column(Numeric(15, 2), nullable=True, comment="签约价格")
    signing_date = Column(DateTime, nullable=True, comment="签约日期")
    signing_period = Column(Integer, nullable=True, comment="签约周期(天)")
    planned_handover_date = Column(DateTime, nullable=True, comment="计划交房时间")
    signing_materials = Column(JSON, nullable=True, comment="签约材料(照片等)")

    # 业主信息
    owner_name = Column(String(100), comment="业主姓名")
    owner_phone = Column(String(20), comment="业主电话")
    owner_info = Column(JSON, comment="业主其他信息")

    # 项目状态
    status = Column(String(20), nullable=False, default=ProjectStatus.SIGNING.value, comment="项目状态")
    renovation_stage = Column(String(20), comment="改造子阶段")

    # 时间记录
    status_changed_at = Column(DateTime, comment="状态变更时间")
    stage_completed_at = Column(DateTime, comment="阶段完成时间")
    sold_at = Column(DateTime, comment="售出时间")

    # 销售信息（在售阶段）
    sale_price = Column(Numeric(15, 2), comment="售价")
    list_price = Column(Numeric(15, 2), comment="挂牌价")

    # 销售角色
    property_agent = Column(String(100), comment="房源维护人")
    client_agent = Column(String(100), comment="客源维护人")
    first_viewer = Column(String(100), comment="首看人")

    # 其他信息
    notes = Column(Text, comment="备注")
    tags = Column(JSON, comment="标签")

    # 关联关系
    cashflow_records = relationship("CashFlowRecord", back_populates="project", cascade="all, delete-orphan")
    renovation_photos = relationship("RenovationPhoto", back_populates="project", cascade="all, delete-orphan")
    sales_records = relationship("SalesRecord", back_populates="project", cascade="all, delete-orphan")


class CashFlowRecord(BaseModel):
    """现金流记录表"""
    __tablename__ = "cashflow_records"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 基本信息
    type = Column(String(20), nullable=False, comment="类型：income/expense")
    category = Column(String(50), nullable=False, comment="分类")
    amount = Column(Numeric(15, 2), nullable=False, comment="金额")
    date = Column(DateTime, nullable=False, comment="日期")
    description = Column(Text, comment="描述")

    # 关联信息
    related_stage = Column(String(50), comment="关联阶段")
    related_record_id = Column(String(36), comment="关联记录ID")

    # 关联关系
    project = relationship("Project", back_populates="cashflow_records")


class RenovationPhoto(BaseModel):
    """改造阶段照片表"""
    __tablename__ = "renovation_photos"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 基本信息
    stage = Column(String(20), nullable=False, comment="改造阶段")
    url = Column(String(500), nullable=False, comment="图片URL")
    filename = Column(String(200), comment="文件名")
    description = Column(Text, comment="描述")

    # 关联关系
    project = relationship("Project", back_populates="renovation_photos")


class SalesRecord(BaseModel):
    """销售记录表（带看、出价、面谈）"""
    __tablename__ = "sales_records"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 记录类型
    record_type = Column(String(20), nullable=False, comment="记录类型：viewing/offer/negotiation")

    # 基本信息
    customer_name = Column(String(100), comment="客户姓名")
    customer_phone = Column(String(20), comment="客户电话")
    customer_info = Column(JSON, comment="客户其他信息")

    # 时间信息
    record_date = Column(DateTime, nullable=False, comment="记录日期")
    record_time = Column(String(50), comment="记录时间")

    # 具体内容
    price = Column(Numeric(15, 2), comment="出价/售价")
    notes = Column(Text, comment="备注")
    feedback = Column(Text, comment="反馈")
    result = Column(String(50), comment="结果")

    # 关联信息
    related_agent = Column(String(100), comment="相关经纪人")

    # 关联关系
    project = relationship("Project", back_populates="sales_records")