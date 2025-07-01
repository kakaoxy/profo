"""
城市模型
"""
from typing import Optional
from sqlmodel import SQLModel, Field


class City(SQLModel, table=True):
    """城市表"""
    __tablename__ = "cities"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(max_length=100, unique=True, index=True)
