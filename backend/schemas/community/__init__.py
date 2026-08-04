"""小区相关Schema

包含小区响应、列表、合并等模型.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator
from typing_extensions import Self


class CommunityAliasResponse(BaseModel):
    """小区别名响应模型(合并历史)."""

    id: str
    alias_name: str
    data_source: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CommunityResponse(BaseModel):
    """小区响应模型."""

    id: str
    name: str
    city_id: int | None = None
    district: str | None = None
    business_circle: str | None = None
    avg_price_wan: float | None = None
    total_properties: int
    is_active: bool = Field(default=True, description="是否激活(软删除)")
    created_at: datetime
    aliases: list[CommunityAliasResponse] = Field(default_factory=list, description="关联别名列表(合并历史)")

    model_config = ConfigDict(from_attributes=True)


class CommunityListResponse(BaseModel):
    """小区列表响应."""

    total: int
    items: list[CommunityResponse]


class CommunityMergeRequest(BaseModel):
    """小区合并请求."""

    primary_id: str = Field(description="主小区ID（UUID字符串）")
    merge_ids: list[str] = Field(min_length=1, description="要合并的小区ID列表（UUID字符串）")

    @model_validator(mode="after")
    def validate_merge_ids(self) -> Self:
        """验证合并ID列表."""
        if self.primary_id in self.merge_ids:
            msg = "主小区ID不能出现在合并列表中"
            raise ValueError(msg)
        if len(self.merge_ids) != len(set(self.merge_ids)):
            msg = "合并列表中存在重复的小区ID"
            raise ValueError(msg)
        return self


class CommunityMergeResponse(BaseModel):
    """小区合并响应."""

    success: bool
    affected_properties: int
    message: str


class DictionaryResponse(BaseModel):
    """字典响应模型."""

    type: str
    items: list[str]


class CommunityCreateRequest(BaseModel):
    """创建小区请求."""

    name: str = Field(min_length=1, max_length=200, description="小区名称")
    district: str | None = Field(default=None, max_length=100, description="行政区")
    business_circle: str | None = Field(default=None, max_length=100, description="商圈")


class CommunityUpdateRequest(BaseModel):
    """更新小区请求.

    所有字段可选，仅更新请求体中显式提供的字段（PATCH 语义）.
    """

    name: str | None = Field(default=None, min_length=1, max_length=200, description="小区名称")
    district: str | None = Field(default=None, max_length=100, description="行政区")
    business_circle: str | None = Field(default=None, max_length=100, description="商圈")
    avg_price_wan: float | None = Field(default=None, ge=0, description="小区均价(万)")
    total_properties: int | None = Field(default=None, ge=0, description="房源总数")
    is_active: bool | None = Field(default=None, description="是否激活(软删除)")


class CommunitySearchResponse(BaseModel):
    """小区搜索响应模型 - 精简字段用于搜索建议."""

    id: str
    name: str
    district: str | None = None
    business_circle: str | None = None

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "CommunityAliasResponse",
    "CommunityCreateRequest",
    "CommunityListResponse",
    "CommunityMergeRequest",
    "CommunityMergeResponse",
    "CommunityResponse",
    "CommunitySearchResponse",
    "CommunityUpdateRequest",
    "DictionaryResponse",
]
