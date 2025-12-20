from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict


class PropertyResponse(BaseModel):
    """房源列表响应模型，包含计算字段"""
    
    id: int
    data_source: str
    source_property_id: str
    status: str
    
    # 小区信息
    community_id: int
    community_name: str
    district: Optional[str] = None
    business_circle: Optional[str] = None
    
    # 户型信息
    rooms: int
    halls: int
    baths: int
    layout_display: str
    orientation: str
    
    # 楼层信息
    floor_display: str
    floor_level: Optional[str] = None
    
    # 面积信息
    build_area: float
    inner_area: Optional[float] = None
    
    # 价格信息
    total_price: float  # 根据状态返回 listed_price_wan 或 sold_price_wan
    unit_price: float  # 计算字段: total_price / build_area
    
    # 时间信息
    listed_date: Optional[datetime] = None
    sold_date: Optional[datetime] = None
    transaction_duration_days: Optional[int] = None  # 成交周期(天)
    
    # 建筑信息
    property_type: Optional[str] = None
    build_year: Optional[int] = None
    decoration: Optional[str] = None
    elevator: Optional[bool] = None
    
    # 图片信息
    picture_links: Optional[List[str]] = None
    
    # 元数据
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    }
    
    @staticmethod
    def _has_complete_layout(property_obj) -> bool:
        """检查是否有完整的户型信息（室、厅、卫）"""
        return (
            property_obj.halls is not None and property_obj.halls > 0 and
            property_obj.baths is not None and property_obj.baths > 0
        )

    @staticmethod
    def _has_valid_floor_info(property_obj) -> bool:
        """检查是否有有效的楼层信息"""
        return (
            property_obj.floor_number and property_obj.total_floors and
            property_obj.floor_number > 0 and property_obj.total_floors > 0
        )

    @staticmethod
    def _calculate_unit_price(total_price: float, build_area: float) -> float:
        """计算单价（元/平米）"""
        return (total_price * 10000 / build_area) if build_area > 0 else 0

    @staticmethod
    def _get_picture_links(property_obj, preloaded_media=None):
        """
        获取图片链接
        """
        # 定义图片类型的枚举值
        IMAGE_TYPES = {"interior", "exterior", "floor_plan", "other"}
        
        # 从预加载数据获取图片链接
        if preloaded_media:
            return [media.url for media in preloaded_media
                   if media.media_type.value in IMAGE_TYPES]
        
        # 如果没有预加载数据，尝试从关系属性获取
        if hasattr(property_obj, 'property_media') and property_obj.property_media:
            return [media.url for media in property_obj.property_media
                   if media.media_type.value in IMAGE_TYPES]
        
        return []

    @classmethod
    def from_orm_with_calculations(cls, property_obj, community, preloaded_media=None):
        # 确定总价
        if property_obj.status.value == "在售":
            total_price = property_obj.listed_price_wan or 0
        else:
            total_price = property_obj.sold_price_wan or 0
        
        # 计算单价
        unit_price = cls._calculate_unit_price(total_price, property_obj.build_area)
        
        # 计算成交周期
        transaction_duration_days = None
        if property_obj.status.value == "成交" and property_obj.listed_date and property_obj.sold_date:
            duration = property_obj.sold_date - property_obj.listed_date
            transaction_duration_days = duration.days
        
        # 户型展示
        layout_display = f"{property_obj.rooms}室"
        if cls._has_complete_layout(property_obj):
            layout_display = f"{property_obj.rooms}室{property_obj.halls}厅{property_obj.baths}卫"

        # 楼层展示
        floor_display = property_obj.floor_original or "暂无数据"
        if cls._has_valid_floor_info(property_obj):
            floor_display = f"{property_obj.floor_number}/{property_obj.total_floors}层"
        
        return cls(
            id=property_obj.id,
            data_source=property_obj.data_source,
            source_property_id=property_obj.source_property_id,
            status=property_obj.status.value,
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
            picture_links=cls._get_picture_links(property_obj, preloaded_media)
        )


class PropertyDetailResponse(BaseModel):
    """房源详情响应模型，包含所有字段"""
    
    id: int
    data_source: str
    source_property_id: str
    status: str
    
    # 小区信息
    community_id: int
    community_name: str
    district: Optional[str] = None
    business_circle: Optional[str] = None
    
    # 户型信息
    rooms: int
    halls: int
    baths: int
    layout_display: str
    orientation: str
    
    # 楼层信息
    floor_original: str
    floor_display: str
    floor_number: Optional[int] = None
    total_floors: Optional[int] = None
    floor_level: Optional[str] = None
    
    # 面积信息
    build_area: float
    inner_area: Optional[float] = None
    
    # 价格信息
    listed_price_wan: Optional[float] = None
    sold_price_wan: Optional[float] = None
    unit_price: float
    transaction_duration_display: Optional[str] = None
    discount_rate_display: Optional[str] = None
    
    # 时间信息
    listed_date: Optional[datetime] = None
    sold_date: Optional[datetime] = None
    transaction_duration_days: Optional[int] = None
    
    # 建筑信息
    property_type: Optional[str] = None
    build_year: Optional[int] = None
    building_structure: Optional[str] = None
    decoration: Optional[str] = None
    elevator: Optional[bool] = None
    
    # 产权信息
    ownership_type: Optional[str] = None
    ownership_years: Optional[int] = None
    last_transaction: Optional[str] = None
    
    # 其他信息
    heating_method: Optional[str] = None
    listing_remarks: Optional[str] = None
    
    # 图片信息
    picture_links: Optional[List[str]] = None
    
    # 元数据
    created_at: datetime
    updated_at: datetime
    
    model_config = {
        "from_attributes": True
    }

    @staticmethod
    def _has_valid_discount_data(property_obj) -> bool:
        """检查是否有有效的议价数据来计算折扣率"""
        return (
            property_obj.listed_price_wan and property_obj.listed_price_wan > 0 and
            property_obj.sold_price_wan and property_obj.sold_price_wan >= 0
        )

    @classmethod
    def from_orm_with_calculations(cls, property_obj, community):
        total_price = property_obj.listed_price_wan or 0 if property_obj.status.value == "在售" else property_obj.sold_price_wan or 0
        unit_price = (total_price * 10000 / property_obj.build_area) if property_obj.build_area and property_obj.build_area > 0 else 0

        transaction_duration_days = None
        transaction_duration_display = None
        if property_obj.status.value == "成交" and property_obj.listed_date and property_obj.sold_date:
            duration = property_obj.sold_date - property_obj.listed_date
            transaction_duration_days = duration.days
            transaction_duration_display = f"{duration.days}天"

        layout_display = f"{property_obj.rooms}室"
        if PropertyResponse._has_complete_layout(property_obj):
            layout_display = f"{property_obj.rooms}室{property_obj.halls}厅{property_obj.baths}卫"

        floor_display = property_obj.floor_original or "暂无数据"
        if PropertyResponse._has_valid_floor_info(property_obj):
            floor_display = f"{property_obj.floor_number}/{property_obj.total_floors}层"

        discount_rate_display = None
        if cls._has_valid_discount_data(property_obj):
            rate = (property_obj.listed_price_wan - property_obj.sold_price_wan) / property_obj.listed_price_wan
            discount_rate_display = f"{round(rate * 100, 2)}%"

        return cls(
            id=property_obj.id,
            data_source=property_obj.data_source,
            source_property_id=property_obj.source_property_id,
            status=property_obj.status.value,
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
            updated_at=property_obj.updated_at
        )


class PaginatedPropertyResponse(BaseModel):
    """分页房源列表响应"""
    total: int
    page: int
    page_size: int
    items: List[PropertyResponse]
