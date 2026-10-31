"""高德地图 Key 配置（system_configs 单键存储）."""

from datetime import datetime

from pydantic import BaseModel, Field


class AmapConfigResponse(BaseModel):
    """高德地图配置响应."""

    js_key: str = Field(default="", description="高德 Web 端（JS API）Key")
    configured: bool = Field(default=False, description="是否已配置")
    updated_at: datetime | None = Field(default=None, description="最后更新时间")
    updated_by_name: str | None = Field(default=None, description="最后修改人")


class AmapConfigUpdateRequest(BaseModel):
    """高德地图配置保存请求（空串 = 清除配置）."""

    js_key: str = Field(default="", max_length=128, description="高德 Web 端（JS API）Key")
