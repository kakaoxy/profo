"""
Leads Management Pydantic Schemas
"""
from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, Field

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
    created_by_name: Optional[str] = None # Helper field, might need extra logic to populate

    class Config:
        from_attributes = True

# ----------------------
# Price History Schemas
# ----------------------
class PriceHistoryBase(BaseModel):
    price: float
    remark: Optional[str] = None

class PriceHistoryCreate(PriceHistoryBase):
    pass

class PriceHistoryResponse(PriceHistoryBase):
    id: str
    lead_id: str
    recorded_at: datetime
    created_by_id: str
    created_by_name: Optional[str] = None

    class Config:
        from_attributes = True

# ----------------------
# Lead Schemas
# ----------------------
class LeadBase(BaseModel):
    community_name: str
    is_hot: int = 0
    layout: Optional[str] = None
    orientation: Optional[str] = None
    floor_info: Optional[str] = None
    area: Optional[float] = None
    total_price: Optional[float] = None
    unit_price: Optional[float] = None
    eval_price: Optional[float] = None
    
    district: Optional[str] = None
    business_area: Optional[str] = None
    remarks: Optional[str] = None
    
    source_property_id: Optional[int] = None

class LeadCreate(LeadBase):
    # status defaults to PENDING_ASSESSMENT in model, but can be set on create
    status: Optional[LeadStatus] = LeadStatus.PENDING_ASSESSMENT
    images: List[str] = []

class LeadUpdate(BaseModel):
    # Allow partial updates
    community_name: Optional[str] = None
    is_hot: Optional[int] = None
    layout: Optional[str] = None
    orientation: Optional[str] = None
    floor_info: Optional[str] = None
    area: Optional[float] = None
    total_price: Optional[float] = None
    unit_price: Optional[float] = None
    eval_price: Optional[float] = None
    
    status: Optional[LeadStatus] = None
    audit_reason: Optional[str] = None
    
    images: Optional[List[str]] = None
    district: Optional[str] = None
    business_area: Optional[str] = None
    remarks: Optional[str] = None

    last_follow_up_at: Optional[datetime] = None

class LeadResponse(LeadBase):
    id: str
    status: LeadStatus
    audit_reason: Optional[str] = None
    auditor_id: Optional[str] = None
    audit_time: Optional[datetime] = None
    
    images: List[str] = []
    
    creator_id: Optional[str] = None
    creator_name: Optional[str] = None # Helper to avoid extra fetching
    
    last_follow_up_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    # Optional nested data, avoid deep nesting by default to keep list lightweight
    # follow_ups: List[FollowUpResponse] = [] 

    class Config:
        from_attributes = True

class PaginatedLeadResponse(BaseModel):
    items: List[LeadResponse]
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
    layout: Optional[str] = None
    orientation: Optional[str] = None
    floor_info: Optional[str] = None
    area: Optional[float] = None
    total_price: Optional[float] = None
    unit_price: Optional[float] = None
    eval_price: Optional[float] = None
    status: LeadStatus
    audit_reason: Optional[str] = None
    auditor_id: Optional[str] = None
    audit_time: Optional[datetime] = None
    images: List[str] = []
    district: Optional[str] = None
    business_area: Optional[str] = None
    remarks: Optional[str] = None
    creator_id: Optional[str] = None
    creator_name: Optional[str] = None
    source_property_id: Optional[int] = None
    last_follow_up_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class PaginatedLeadListResponse(BaseModel):
    """列表分页响应 - 使用 LeadListItem 避免性能问题"""
    items: List[LeadListItem]
    total: int
    page: int
    page_size: int

