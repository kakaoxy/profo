"""
Leads Management Pydantic Schemas
"""
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

from models.base import LeadStatus, FollowUpMethod


# ----------------------
# Follow Up Schemas
# ----------------------
class FollowUpBase(BaseModel):
    method: FollowUpMethod
    content: str


class FollowUpCreate(FollowUpBase):
    pass


class FollowUpResponse(FollowUpBase):
    id: str
    lead_id: str
    followed_at: datetime
    created_by_id: str
    created_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# Price History Schemas
# ----------------------
class PriceHistoryBase(BaseModel):
    price: float
    remark: str | None = None


class PriceHistoryCreate(PriceHistoryBase):
    pass


class PriceHistoryResponse(PriceHistoryBase):
    id: str
    lead_id: str
    recorded_at: datetime
    created_by_id: str
    created_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# Lead Schemas
# ----------------------
class LeadBase(BaseModel):
    community_name: str
    is_hot: int = 0
    layout: str | None = None
    orientation: str | None = None
    floor_info: str | None = None
    area: float | None = None
    total_price: float | None = None
    unit_price: float | None = None
    eval_price: float | None = None
    
    district: str | None = None
    business_area: str | None = None
    remarks: str | None = None
    
    source_property_id: int | None = None


class LeadCreate(LeadBase):
    status: LeadStatus | None = LeadStatus.PENDING_ASSESSMENT
    images: list[str] = []


class LeadUpdate(BaseModel):
    community_name: str | None = None
    is_hot: int | None = None
    layout: str | None = None
    orientation: str | None = None
    floor_info: str | None = None
    area: float | None = None
    total_price: float | None = None
    unit_price: float | None = None
    eval_price: float | None = None
    
    status: LeadStatus | None = None
    audit_reason: str | None = None
    
    images: list[str] | None = None
    district: str | None = None
    business_area: str | None = None
    remarks: str | None = None

    last_follow_up_at: datetime | None = None


class LeadResponse(LeadBase):
    id: str
    status: LeadStatus
    audit_reason: str | None = None
    auditor_id: str | None = None
    audit_time: datetime | None = None
    
    images: list[str] = []
    
    creator_id: str | None = None
    creator_name: str | None = None
    
    last_follow_up_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedLeadResponse(BaseModel):
    items: list[LeadResponse]
    total: int
    page: int
    page_size: int


# ----------------------
# 列表展示专用 Schema (性能优化)
# ----------------------
class LeadListItem(BaseModel):
    """
    列表展示专用 Schema
    不使用 from_attributes，手动构造以避免 ORM 关系遍历导致的性能问题
    """
    id: str
    community_name: str
    is_hot: int = 0
    layout: str | None = None
    orientation: str | None = None
    floor_info: str | None = None
    area: float | None = None
    total_price: float | None = None
    unit_price: float | None = None
    eval_price: float | None = None
    status: LeadStatus
    audit_reason: str | None = None
    auditor_id: str | None = None
    audit_time: datetime | None = None
    images: list[str] = []
    district: str | None = None
    business_area: str | None = None
    remarks: str | None = None
    creator_id: str | None = None
    creator_name: str | None = None
    source_property_id: int | None = None
    last_follow_up_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PaginatedLeadListResponse(BaseModel):
    """列表分页响应 - 使用 LeadListItem 避免性能问题"""
    items: list[LeadListItem]
    total: int
    page: int
    page_size: int


__all__ = [
    # Follow Up
    "FollowUpBase",
    "FollowUpCreate",
    "FollowUpResponse",
    # Price History
    "PriceHistoryBase",
    "PriceHistoryCreate",
    "PriceHistoryResponse",
    # Lead
    "LeadBase",
    "LeadCreate",
    "LeadUpdate",
    "LeadResponse",
    "PaginatedLeadResponse",
    "LeadListItem",
    "PaginatedLeadListResponse",
]