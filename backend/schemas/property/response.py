"""房源响应模型."""

import logging
from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING

from pydantic import BaseModel

from schemas.response import PaginatedResponse

if TYPE_CHECKING:
    from models.property.community import Community
    from models.property.property import PropertyCurrent

logger = logging.getLogger(__name__)

PROPERTY_EXPIRATION_DAYS = 30


def _compute_display_status(property_obj: "PropertyCurrent") -> str:
    """计算房源显示状态.

    对"在售"状态的房源，检查更新时间是否超过30天，若超过则显示为"过期".
    """
    raw_status = property_obj.status.value
    if raw_status != "在售":
        return raw_status
    if property_obj.updated_at is None:
        logger.warning("房源 %s 的 updated_at 为空，跳过过期判断", property_obj.source_property_id)
        return raw_status
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=PROPERTY_EXPIRATION_DAYS)
    updated_at = property_obj.updated_at
    if updated_at.tzinfo is None:
        updated_at = updated_at.replace(tzinfo=timezone.utc)
    days_since = (now - updated_at).days
    is_expired = updated_at < cutoff
    logger.debug(
        "过期判断 | 房源=%s | updated_at=%s | days_since=%s天 | cutoff=%s | is_expired=%s",
        property_obj.source_property_id,
        updated_at,
        days_since,
        cutoff,
        is_expired,
    )
    if is_expired:
        return "过期"
    return "在售"


def _has_complete_layout(property_obj: "PropertyCurrent") -> bool:
    """检查是否有完整的户型信息（室、厅、卫）."""
    return (
        property_obj.halls is not None
        and property_obj.halls > 0
        and property_obj.baths is not None
        and property_obj.baths > 0
    )


def _has_valid_floor_info(property_obj: "PropertyCurrent") -> bool:
    """检查是否有有效的楼层信息."""
    return (
        property_obj.floor_number
        and property_obj.total_floors
        and property_obj.floor_number > 0
        and property_obj.total_floors > 0
    )


def _calculate_unit_price(total_price: float, build_area: float) -> float:
    """计算单价（元/平米）."""
    return (total_price * 10000 / build_area) if build_area > 0 else 0


def _get_picture_links(
    property_obj: "PropertyCurrent",
    preloaded_media: list | None = None,
) -> list[str]:
    """获取图片链接."""
    image_types = {"interior", "exterior", "floor_plan", "other"}

    if preloaded_media:
        return [media.url for media in preloaded_media if media.media_type.value in image_types]

    if hasattr(property_obj, "property_media") and property_obj.property_media:
        return [media.url for media in property_obj.property_media if media.media_type.value in image_types]

    return []


class PropertyResponse(BaseModel):
    """房源列表响应模型，包含计算字段."""

    id: int
    data_source: str
    source_property_id: str
    status: str

    community_id: str
    community_name: str
    district: str | None = None
    business_circle: str | None = None

    rooms: int
    halls: int
    baths: int
    layout_display: str
    orientation: str

    floor_display: str
    floor_level: str | None = None

    build_area: float
    inner_area: float | None = None

    total_price: float
    unit_price: float

    listed_date: datetime | None = None
    sold_date: datetime | None = None
    transaction_duration_days: int | None = None

    property_type: str | None = None
    build_year: int | None = None
    decoration: str | None = None
    elevator: bool | None = None

    picture_links: list[str] | None = None

    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }

    @classmethod
    def from_orm_with_calculations(
        cls,
        property_obj: "PropertyCurrent",
        community: "Community",
        preloaded_media: list | None = None,
    ) -> "PropertyResponse":
        """从ORM对象创建响应模型，包含计算字段."""
        if property_obj.status.value == "在售":
            total_price = property_obj.listed_price_wan or 0
        else:
            total_price = property_obj.sold_price_wan or 0

        unit_price = _calculate_unit_price(total_price, property_obj.build_area)

        transaction_duration_days = None
        if property_obj.status.value == "成交" and property_obj.listed_date and property_obj.sold_date:
            duration = property_obj.sold_date - property_obj.listed_date
            transaction_duration_days = duration.days

        layout_display = f"{property_obj.rooms}室"
        if _has_complete_layout(property_obj):
            layout_display = f"{property_obj.rooms}室{property_obj.halls}厅{property_obj.baths}卫"

        floor_display = property_obj.floor_original or "暂无数据"
        if _has_valid_floor_info(property_obj):
            floor_display = f"{property_obj.floor_number}/{property_obj.total_floors}层"

        return cls(
            id=property_obj.id,
            data_source=property_obj.data_source,
            source_property_id=property_obj.source_property_id,
            status=_compute_display_status(property_obj),
            community_id=property_obj.community_id,
            community_name=community.name,
            district=community.district,
            business_circle=community.business_circle,
            rooms=property_obj.rooms,
            halls=property_obj.halls,
            baths=property_obj.baths,
            layout_display=layout_display,
            orientation=property_obj.orientation,
            floor_display=floor_display,
            floor_level=property_obj.floor_level,
            build_area=property_obj.build_area,
            inner_area=property_obj.inner_area,
            total_price=total_price,
            unit_price=round(unit_price, 2),
            listed_date=property_obj.listed_date,
            sold_date=property_obj.sold_date,
            transaction_duration_days=transaction_duration_days,
            property_type=property_obj.property_type,
            build_year=property_obj.build_year,
            decoration=property_obj.decoration,
            elevator=property_obj.elevator,
            created_at=property_obj.created_at,
            updated_at=property_obj.updated_at,
            picture_links=_get_picture_links(property_obj, preloaded_media),
        )


class PropertyDetailResponse(BaseModel):
    """房源详情响应模型，包含所有字段."""

    id: int
    data_source: str
    source_property_id: str
    status: str

    community_id: str
    community_name: str
    district: str | None = None
    business_circle: str | None = None

    rooms: int
    halls: int
    baths: int
    layout_display: str
    orientation: str

    floor_original: str
    floor_display: str
    floor_number: int | None = None
    total_floors: int | None = None
    floor_level: str | None = None

    build_area: float
    inner_area: float | None = None

    listed_price_wan: float | None = None
    sold_price_wan: float | None = None
    unit_price: float
    transaction_duration_display: str | None = None
    discount_rate_display: str | None = None

    listed_date: datetime | None = None
    sold_date: datetime | None = None
    transaction_duration_days: int | None = None

    property_type: str | None = None
    build_year: int | None = None
    building_structure: str | None = None
    decoration: str | None = None
    elevator: bool | None = None

    ownership_type: str | None = None
    ownership_years: int | None = None
    last_transaction: str | None = None

    heating_method: str | None = None
    listing_remarks: str | None = None

    picture_links: list[str] | None = None

    created_at: datetime
    updated_at: datetime

    model_config = {
        "from_attributes": True,
    }

    @staticmethod
    def _has_valid_discount_data(property_obj: "PropertyCurrent") -> bool:
        """检查是否有有效的议价数据来计算折扣率."""
        return (
            property_obj.listed_price_wan
            and property_obj.listed_price_wan > 0
            and property_obj.sold_price_wan
            and property_obj.sold_price_wan >= 0
        )

    @classmethod
    def from_orm_with_calculations(
        cls,
        property_obj: "PropertyCurrent",
        community: "Community",
    ) -> "PropertyDetailResponse":
        """从ORM对象创建详情响应模型，包含计算字段."""
        total_price = (
            property_obj.listed_price_wan or 0
            if property_obj.status.value == "在售"
            else property_obj.sold_price_wan or 0
        )
        unit_price = (
            (total_price * 10000 / property_obj.build_area)
            if property_obj.build_area and property_obj.build_area > 0
            else 0
        )

        transaction_duration_days = None
        transaction_duration_display = None
        if property_obj.status.value == "成交" and property_obj.listed_date and property_obj.sold_date:
            duration = property_obj.sold_date - property_obj.listed_date
            transaction_duration_days = duration.days
            transaction_duration_display = f"{duration.days}天"

        layout_display = f"{property_obj.rooms}室"
        if _has_complete_layout(property_obj):
            layout_display = f"{property_obj.rooms}室{property_obj.halls}厅{property_obj.baths}卫"

        floor_display = property_obj.floor_original or "暂无数据"
        if _has_valid_floor_info(property_obj):
            floor_display = f"{property_obj.floor_number}/{property_obj.total_floors}层"

        discount_rate_display = None
        if cls._has_valid_discount_data(property_obj):
            rate = (property_obj.listed_price_wan - property_obj.sold_price_wan) / property_obj.listed_price_wan
            discount_rate_display = f"{round(rate * 100, 2)}%"

        return cls(
            id=property_obj.id,
            data_source=property_obj.data_source,
            source_property_id=property_obj.source_property_id,
            status=_compute_display_status(property_obj),
            community_id=property_obj.community_id,
            community_name=community.name,
            district=community.district,
            business_circle=community.business_circle,
            rooms=property_obj.rooms,
            halls=property_obj.halls,
            baths=property_obj.baths,
            layout_display=layout_display,
            orientation=property_obj.orientation,
            floor_original=property_obj.floor_original,
            floor_display=floor_display,
            floor_number=property_obj.floor_number,
            total_floors=property_obj.total_floors,
            floor_level=property_obj.floor_level,
            build_area=property_obj.build_area,
            inner_area=property_obj.inner_area,
            listed_price_wan=property_obj.listed_price_wan,
            sold_price_wan=property_obj.sold_price_wan,
            unit_price=round(unit_price, 2),
            listed_date=property_obj.listed_date,
            sold_date=property_obj.sold_date,
            transaction_duration_days=transaction_duration_days,
            transaction_duration_display=transaction_duration_display,
            discount_rate_display=discount_rate_display,
            property_type=property_obj.property_type,
            build_year=property_obj.build_year,
            building_structure=property_obj.building_structure,
            decoration=property_obj.decoration,
            elevator=property_obj.elevator,
            ownership_type=property_obj.ownership_type,
            ownership_years=property_obj.ownership_years,
            last_transaction=property_obj.last_transaction,
            heating_method=property_obj.heating_method,
            listing_remarks=property_obj.listing_remarks,
            created_at=property_obj.created_at,
            updated_at=property_obj.updated_at,
        )


class PaginatedPropertyResponse(PaginatedResponse[PropertyResponse]):
    """分页房源列表响应 - 统一分页格式."""
