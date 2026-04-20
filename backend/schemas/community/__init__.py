"""
小区相关Schema
包含小区响应、列表、合并等模型
"""
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class CommunityResponse(BaseModel):
    """小区响应模型"""
    id: str
    name: str
    city_id: int | None = None
    district: str | None = None
    business_circle: str | None = None
    avg_price_wan: float | None = None
    total_properties: int
    created_at: datetime

    model_config = {
        "from_attributes": True
    }


class CommunityListResponse(BaseModel):
    """小区列表响应"""
    total: int
    items: list[CommunityResponse]


class CommunityMergeRequest(BaseModel):
    """小区合并请求"""
    primary_id: str = Field(description="主小区ID（UUID字符串）")
    merge_ids: list[str] = Field(min_length=1, description="要合并的小区ID列表（UUID字符串）")

    @model_validator(mode='after')
    def validate_merge_ids(self):
        """验证合并ID列表"""
        if self.primary_id in self.merge_ids:
            raise ValueError("主小区ID不能出现在合并列表中")
        if len(self.merge_ids) != len(set(self.merge_ids)):
            raise ValueError("合并列表中存在重复的小区ID")
        return self


class CommunityMergeResponse(BaseModel):
    """小区合并响应"""
    success: bool
    affected_properties: int
    message: str


class DictionaryResponse(BaseModel):
    """字典响应模型"""
    type: str
    items: list[str]


__all__ = [
    "CommunityResponse",
    "CommunityListResponse",
    "CommunityMergeRequest",
    "CommunityMergeResponse",
    "DictionaryResponse",
]