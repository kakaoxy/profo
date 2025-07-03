"""
个人看房笔记模型
"""
from datetime import datetime, date
from typing import Optional
from decimal import Decimal
from sqlmodel import SQLModel, Field


class MyViewing(SQLModel, table=True):
    """我的看房笔记表"""
    __tablename__ = "my_viewings"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    property_id: int = Field(foreign_key="properties.id", index=True)
    agent_id: Optional[int] = Field(default=None, foreign_key="agents.id")
    viewing_date: date
    expected_purchase_price_wan: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    rating: Optional[int] = Field(default=None, ge=1, le=5)
    notes_general: Optional[str] = Field(default=None)
    notes_pros: Optional[str] = Field(default=None)
    notes_cons: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
