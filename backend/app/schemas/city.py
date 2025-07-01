"""
城市相关的Pydantic模式
"""
from pydantic import BaseModel


class CityBase(BaseModel):
    """城市基础模式"""
    name: str


class CityCreate(CityBase):
    """创建城市模式"""
    pass


class CityUpdate(CityBase):
    """更新城市模式"""
    pass


class CityResponse(CityBase):
    """城市响应模式"""
    id: int
    
    class Config:
        from_attributes = True
