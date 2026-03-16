"""
项目业主相关Schema
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class OwnerBase(BaseModel):
    """业主基础字段"""
    owner_name: Optional[str] = Field(None, max_length=100, description="业主姓名")
    owner_phone: Optional[str] = Field(None, max_length=20, description="业主联系方式")
    owner_id_card: Optional[str] = Field(None, max_length=18, description="业主身份证号")
    relation_type: str = Field(default="业主", description="关系类型")
    owner_info: Optional[str] = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class OwnerCreate(OwnerBase):
    """创建业主请求"""
    project_id: str = Field(..., description="项目ID")


class OwnerUpdate(BaseModel):
    """更新业主请求"""
    owner_name: Optional[str] = None
    owner_phone: Optional[str] = None
    owner_id_card: Optional[str] = None
    relation_type: Optional[str] = None
    owner_info: Optional[str] = None


class OwnerResponse(OwnerBase):
    """业主响应"""
    id: str = Field(..., description="业主ID")
    project_id: str = Field(..., description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class OwnerListResponse(BaseModel):
    """业主列表响应"""
    items: List[OwnerResponse]
    total: int