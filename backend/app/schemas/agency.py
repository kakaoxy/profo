"""
中介公司相关的Pydantic模式
"""
from pydantic import BaseModel


class AgencyBase(BaseModel):
    """中介公司基础模式"""
    name: str


class AgencyCreate(AgencyBase):
    """创建中介公司模式"""
    pass


class AgencyUpdate(AgencyBase):
    """更新中介公司模式"""
    pass


class AgencyResponse(AgencyBase):
    """中介公司响应模式"""
    id: int
    
    class Config:
        from_attributes = True
