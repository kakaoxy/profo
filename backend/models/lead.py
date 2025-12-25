"""
Leads Management Models
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import Column, String, Float, DateTime, Text, Integer, ForeignKey, Enum as SQLEnum, Index, Numeric
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.sqlite import JSON

from .base import Base, LeadStatus, FollowUpMethod

class Lead(Base):
    """线索主表"""
    __tablename__ = "leads"

    id = Column(String(36), primary_key=True, comment="UUID")
    
    # Core Info
    community_name = Column(String(200), nullable=False, comment="小区名称")
    is_hot = Column(Integer, default=0, comment="是否热门/关注(0/1)")
    
    # Property Physical Attributes
    layout = Column(String(50), comment="户型(e.g. 2室1厅)")
    orientation = Column(String(50), comment="朝向")
    floor_info = Column(String(50), comment="楼层信息")
    area = Column(Float, comment="面积(㎡)")
    
    # Price Info
    total_price = Column(Numeric(15, 2), comment="当前授权总价(万)")
    unit_price = Column(Numeric(15, 2), comment="单价(万/㎡)")
    eval_price = Column(Numeric(15, 2), comment="评估价格(万)")
    
    # Status & Workflow
    status = Column(SQLEnum(LeadStatus), default=LeadStatus.PENDING_ASSESSMENT, nullable=False, comment="状态")
    audit_reason = Column(Text, comment="审核/驳回理由")
    auditor_id = Column(String(36), ForeignKey("users.id"), nullable=True, comment="审核人ID")
    audit_time = Column(DateTime, nullable=True, comment="审核时间")
    
    # Metadata
    images = Column(JSON, default=list, comment="图片列表")
    district = Column(String(50), comment="行政区")
    business_area = Column(String(50), comment="商圈")
    remarks = Column(Text, comment="备注")
    
    # Linkage
    creator_id = Column(String(36), ForeignKey("users.id"), nullable=True, comment="创建人ID")
    source_property_id = Column(Integer, ForeignKey("property_current.id"), nullable=True, comment="关联房源ID(如有)")
    
    # Timestamps
    last_follow_up_at = Column(DateTime, nullable=True, comment="最后跟进时间")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")

    # Relationships
    creator = relationship("User", foreign_keys=[creator_id])
    auditor = relationship("User", foreign_keys=[auditor_id])
    property = relationship("PropertyCurrent")
    follow_ups = relationship("LeadFollowUp", back_populates="lead", cascade="all, delete-orphan")
    price_history = relationship("LeadPriceHistory", back_populates="lead", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_lead_status", "status"),
        Index("idx_lead_community", "community_name"),
        Index("idx_lead_creator", "creator_id"),
    )

class LeadFollowUp(Base):
    """线索跟进记录"""
    __tablename__ = "lead_followups"

    id = Column(String(36), primary_key=True, comment="UUID")
    lead_id = Column(String(36), ForeignKey("leads.id"), nullable=False, comment="线索ID")
    
    method = Column(SQLEnum(FollowUpMethod), nullable=False, comment="跟进方式")
    content = Column(Text, nullable=False, comment="跟进内容")
    followed_at = Column(DateTime, default=datetime.now, comment="跟进时间")
    
    created_by_id = Column(String(36), ForeignKey("users.id"), nullable=False, comment="跟进人ID")
    
    # Relationships
    lead = relationship("Lead", back_populates="follow_ups")
    created_by = relationship("User")

class LeadPriceHistory(Base):
    """线索价格历史记录"""
    __tablename__ = "lead_price_history"

    id = Column(String(36), primary_key=True, comment="UUID")
    lead_id = Column(String(36), ForeignKey("leads.id"), nullable=False, comment="线索ID")
    
    price = Column(Numeric(15, 2), nullable=False, comment="授权价格(万)")
    remark = Column(Text, comment="调整备注/原因")
    recorded_at = Column(DateTime, default=datetime.now, comment="记录时间")
    
    created_by_id = Column(String(36), ForeignKey("users.id"), nullable=False, comment="记录人ID")
    
    # Relationships
    lead = relationship("Lead", back_populates="price_history")
    created_by = relationship("User")
