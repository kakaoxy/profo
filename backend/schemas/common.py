"""通用Schema

包含历史记录、失败记录、楼层解析等通用模型.
"""  # noqa: D400, D415

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from schemas.response import PaginatedResponse


class FloorInfo(BaseModel):
    """楼层解析结果."""

    floor_number: int | None = None
    total_floors: int | None = None
    floor_level: str | None = None


class PropertyHistoryResponse(BaseModel):
    """房源历史记录响应."""

    id: int
    change_type: str
    captured_at: datetime
    status: str
    listed_price_wan: float | None = None
    sold_price_wan: float | None = None
    build_area: float | None = None

    model_config = ConfigDict(from_attributes=True)


class FailedRecordResponse(BaseModel):
    """失败记录响应."""

    id: int
    data_source: str | None = None
    failure_type: str
    failure_reason: str
    occurred_at: datetime
    is_handled: bool

    model_config = ConfigDict(from_attributes=True)
