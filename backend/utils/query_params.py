"""查询参数对象.

用于封装复杂的查询参数，避免函数参数过多.
"""

from collections.abc import Collection

from pydantic import BaseModel, ConfigDict

from settings import settings


def validate_sort_field(sort_by: str, allowed_fields: Collection[str], default: str) -> str:
    """验证排序字段是否在白名单内，防止 SQL 注入.

    传入非白名单字段时返回默认排序字段，确保排序字段始终受控.

    Args:
        sort_by: 待验证的排序字段
        allowed_fields: 允许的排序字段集合
        default: 默认排序字段（不在白名单时使用）

    Returns:
        str: 验证后的排序字段

    """
    return sort_by if sort_by in allowed_fields else default


class PropertyQueryParams(BaseModel):
    """房源查询参数对象."""

    model_config = ConfigDict(from_attributes=True)

    # 基础筛选条件
    status: str | None = None
    community_name: str | None = None
    community_ids: list[str] | None = None

    # 地理位置筛选
    districts: list[str] | None = None
    business_circles: list[str] | None = None

    # 房屋属性筛选
    orientations: list[str] | None = None
    floor_levels: list[str] | None = None
    rooms: list[int] | None = None
    rooms_gte: int | None = None

    # 价格范围筛选
    min_price: float | None = None
    max_price: float | None = None
    min_area: float | None = None
    max_area: float | None = None

    # 排序参数
    sort_by: str = "updated_at"
    sort_order: str = "desc"

    # 分页参数
    page: int = 1
    page_size: int = settings.default_page_size

    def has_price_filter(self) -> bool:
        """是否有价格筛选条件."""
        return self.min_price is not None or self.max_price is not None

    def has_area_filter(self) -> bool:
        """是否有面积筛选条件."""
        return self.min_area is not None or self.max_area is not None

    def has_location_filter(self) -> bool:
        """是否有位置筛选条件."""
        return bool(self.districts or self.business_circles)

    def has_room_filter(self) -> bool:
        """是否有户型筛选条件."""
        return bool(self.rooms or self.rooms_gte is not None)

    def has_orientation_filter(self) -> bool:
        """是否有朝向筛选条件."""
        return bool(self.orientations)

    def has_floor_level_filter(self) -> bool:
        """是否有楼层级别筛选条件."""
        return bool(self.floor_levels)


class PropertyExportParams(BaseModel):
    """房源导出参数对象."""

    model_config = ConfigDict(from_attributes=True)

    # 基础筛选条件
    status: str | None = None
    community_name: str | None = None
    community_ids: list[str] | None = None

    # 地理位置筛选
    districts: list[str] | None = None
    business_circles: list[str] | None = None

    # 房屋属性筛选
    orientations: list[str] | None = None
    floor_levels: list[str] | None = None
    rooms: list[int] | None = None
    rooms_gte: int | None = None

    # 价格范围筛选
    min_price: float | None = None
    max_price: float | None = None
    min_area: float | None = None
    max_area: float | None = None

    # 排序参数（导出通常不需要分页）
    sort_by: str = "updated_at"
    sort_order: str = "desc"

    @classmethod
    def from_query_params(  # noqa: PLR0913
        cls,
        status: str | None = None,
        community_name: str | None = None,
        community_ids: list[str] | None = None,
        districts: list[str] | None = None,
        business_circles: list[str] | None = None,
        orientations: list[str] | None = None,
        floor_levels: list[str] | None = None,
        min_price: float | None = None,
        max_price: float | None = None,
        min_area: float | None = None,
        max_area: float | None = None,
        rooms: list[int] | None = None,
        rooms_gte: int | None = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
    ) -> "PropertyExportParams":
        """从各个参数创建导出参数对象."""
        return cls(
            status=status,
            community_name=community_name,
            community_ids=community_ids,
            districts=districts,
            business_circles=business_circles,
            orientations=orientations,
            floor_levels=floor_levels,
            min_price=min_price,
            max_price=max_price,
            min_area=min_area,
            max_area=max_area,
            rooms=rooms,
            rooms_gte=rooms_gte,
            sort_by=sort_by,
            sort_order=sort_order,
        )
