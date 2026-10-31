"""门店地图与拜访轨迹 Schemas（V08）."""

from datetime import datetime

from pydantic import BaseModel, Field


class MerchantMapPoint(BaseModel):
    """地图门店点位."""

    id: str
    store_name: str
    company_name: str
    province: str
    city: str
    district: str
    business_circle: str
    address: str
    lng: float | None
    lat: float | None
    has_coordinate: bool
    cooperation_status: str
    cooperation_status_label: str
    review_status: str
    broker_count: int
    last_visit_at: datetime | None


class MerchantMapStats(BaseModel):
    """地图统计条."""

    store_count: int
    cooperated_count: int
    broker_count: int


class MerchantMapResponse(BaseModel):
    """地图点位与统计."""

    points: list[MerchantMapPoint]
    stats: MerchantMapStats


class MerchantTrackItem(BaseModel):
    """拜访轨迹点（时间线/地图共用）."""

    visit_id: str
    store_id: str
    store_name: str
    employee_id: str
    employee_name: str | None
    visited_at: datetime
    lng: float | None
    lat: float | None
    address: str | None
    contact_name: str
    result: str | None
    remark: str | None
    photos: list[dict] = Field(default_factory=list)
    has_coordinate: bool


class MerchantTrackStats(BaseModel):
    """轨迹统计."""

    visit_count: int
    store_count: int


class MerchantTrackResponse(BaseModel):
    """员工拜访轨迹响应."""

    items: list[MerchantTrackItem]
    stats: MerchantTrackStats


__all__ = [
    "MerchantMapPoint",
    "MerchantMapResponse",
    "MerchantMapStats",
    "MerchantTrackItem",
    "MerchantTrackResponse",
    "MerchantTrackStats",
]
