"""
查询参数对象
用于封装复杂的查询参数，避免函数参数过多
"""
from typing import Optional, List
from dataclasses import dataclass


@dataclass
class PropertyQueryParams:
    """房源查询参数对象"""

    # 基础筛选条件
    status: Optional[str] = None
    community_name: Optional[str] = None

    # 地理位置筛选
    districts: Optional[List[str]] = None
    business_circles: Optional[List[str]] = None

    # 房屋属性筛选
    orientations: Optional[List[str]] = None
    floor_levels: Optional[List[str]] = None
    rooms: Optional[List[int]] = None
    rooms_gte: Optional[int] = None

    # 价格范围筛选
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_area: Optional[float] = None
    max_area: Optional[float] = None

    # 排序参数
    sort_by: str = "updated_at"
    sort_order: str = "desc"

    # 分页参数
    page: int = 1
    page_size: int = 50

    def has_price_filter(self) -> bool:
        """是否有价格筛选条件"""
        return self.min_price is not None or self.max_price is not None

    def has_area_filter(self) -> bool:
        """是否有面积筛选条件"""
        return self.min_area is not None or self.max_area is not None

    def has_location_filter(self) -> bool:
        """是否有位置筛选条件"""
        return bool(self.districts or self.business_circles)

    def has_room_filter(self) -> bool:
        """是否有户型筛选条件"""
        return bool(self.rooms or self.rooms_gte is not None)

    def has_orientation_filter(self) -> bool:
        """是否有朝向筛选条件"""
        return bool(self.orientations)

    def has_floor_level_filter(self) -> bool:
        """是否有楼层级别筛选条件"""
        return bool(self.floor_levels)



@dataclass
class PropertyExportParams:
    """房源导出参数对象"""

    # 基础筛选条件
    status: Optional[str] = None
    community_name: Optional[str] = None

    # 地理位置筛选
    districts: Optional[List[str]] = None
    business_circles: Optional[List[str]] = None

    # 房屋属性筛选
    orientations: Optional[List[str]] = None
    floor_levels: Optional[List[str]] = None
    rooms: Optional[List[int]] = None
    rooms_gte: Optional[int] = None

    # 价格范围筛选
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    min_area: Optional[float] = None
    max_area: Optional[float] = None

    # 排序参数（导出通常不需要分页）
    sort_by: str = "updated_at"
    sort_order: str = "desc"

    @classmethod
    def from_query_params(cls,
                         status: Optional[str] = None,
                         community_name: Optional[str] = None,
                         districts: Optional[List[str]] = None,
                         business_circles: Optional[List[str]] = None,
                         orientations: Optional[List[str]] = None,
                         floor_levels: Optional[List[str]] = None,
                         min_price: Optional[float] = None,
                         max_price: Optional[float] = None,
                         min_area: Optional[float] = None,
                         max_area: Optional[float] = None,
                         rooms: Optional[List[int]] = None,
                         rooms_gte: Optional[int] = None,
                         sort_by: str = "updated_at",
                         sort_order: str = "desc") -> 'PropertyExportParams':
        """从各个参数创建导出参数对象"""
        return cls(
            status=status,
            community_name=community_name,
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
            sort_order=sort_order
        )