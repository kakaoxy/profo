"""
经纪人模型
"""
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class Agent(SQLModel, table=True):
    """经纪人表"""
    __tablename__ = "agents"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    agency_id: int = Field(foreign_key="agencies.id", index=True)
    name: str = Field(max_length=100)
    phone: Optional[str] = Field(default=None, max_length=50)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
