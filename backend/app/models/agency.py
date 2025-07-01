"""
中介公司模型
"""
from typing import Optional
from sqlmodel import SQLModel, Field


class Agency(SQLModel, table=True):
    """中介公司表"""
    __tablename__ = "agencies"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=255, unique=True, index=True)
