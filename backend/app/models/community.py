"""
小区模型
"""
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Community(SQLModel, table=True):
    """小区表"""
    __tablename__ = "communities"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    city_id: int = Field(foreign_key="cities.id", index=True)
    name: str = Field(max_length=255, index=True)
    district: Optional[str] = Field(default=None, max_length=100)
    business_circle: Optional[str] = Field(default=None, max_length=100)
    address: Optional[str] = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
