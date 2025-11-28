"""
数据验证模型 (Pydantic Schemas)
包含数据接收、验证和响应的所有模型
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, model_validator
from enum import Enum
try:
    from .models import Community
except Exception:
    from models import Community


# ==================== 枚举类型 ====================
class IngestionStatus(str, Enum):
    """房源状态枚举 - 用于数据接收"""
    FOR_SALE = "在售"
    SOLD = "成交"


class MediaTypeEnum(str, Enum):
    """媒体类型枚举"""
    FLOOR_PLAN = "floor_plan"
    INTERIOR = "interior"
    EXTERIOR = "exterior"
    OTHER = "other"


# ==================== 数据接收模型 ====================
class PropertyIngestionModel(BaseModel):
    """
    统一的数据接收模型，支持 CSV 和 JSON
    使用 Field 的 alias 参数支持中文字段名
    """
    
    # 核心唯一标识
    data_source: str = Field(..., alias="数据源", description="数据来源平台")
    source_property_id: str = Field(..., alias="房源ID", description="来源平台的房源ID")
    
    # 核心业务字段
    status: IngestionStatus = Field(..., alias="状态", description="房源状态")
    community_name: str = Field(..., alias="小区名", min_length=1, description="小区名称")
    
    # 户型信息
    rooms: int = Field(..., ge=0, alias="室", description="室数量")
    halls: int = Field(default=0, ge=0, alias="厅", description="厅数量")
    baths: int = Field(default=0, ge=0, alias="卫", description="卫生间数量")
    orientation: str = Field(..., alias="朝向", description="房屋朝向")
    
    # 楼层信息
    floor_original: str = Field(..., alias="楼层", description="原始楼层字符串")
    
    # 面积信息
    build_area: float = Field(..., gt=0, alias="面积", description="建筑面积(㎡)")
    inner_area: Optional[float] = Field(None, gt=0, alias="套内面积", description="套内面积(㎡)")
    
    # 动态必填字段 - 在售
    listed_price_wan: Optional[float] = Field(None, gt=0, alias="挂牌价", description="挂牌价(万)")
    listed_date: Optional[datetime] = Field(None, alias="上架时间", description="上架时间")
    
    # 动态必填字段 - 成交
    sold_price_wan: Optional[float] = Field(None, gt=0, alias="成交价", description="成交价(万)")
    sold_date: Optional[datetime] = Field(None, alias="成交时间", description="成交时间")
    
    # 其他可选字段
    property_type: Optional[str] = Field(None, alias="物业类型", description="物业类型")
    build_year: Optional[int] = Field(None, ge=1900, le=2100, alias="建筑年代", description="建筑年代")
    building_structure: Optional[str] = Field(None, alias="建筑结构", description="建筑结构")
    decoration: Optional[str] = Field(None, alias="装修情况", description="装修情况")
    elevator: Optional[bool] = Field(None, alias="电梯", description="是否有电梯")
    
    # 产权信息
    ownership_type: Optional[str] = Field(None, alias="产权性质", description="产权性质")
    ownership_years: Optional[int] = Field(None, gt=0, alias="产权年限", description="产权年限")
    last_transaction: Optional[str] = Field(None, alias="上次交易", description="上次交易信息")
    
    # 其他信息
    heating_method: Optional[str] = Field(None, alias="供暖方式", description="供暖方式")
    listing_remarks: Optional[str] = Field(None, alias="房源描述", description="房源描述")
    
    # 图片信息
    image_urls: Optional[List[str]] = Field(None, alias="图片链接", description="房源图片URL列表")
    
    # 区域信息
    city_id: Optional[int] = Field(None, alias="城市ID", description="城市ID")
    district: Optional[str] = Field(None, alias="行政区", description="行政区")
    business_circle: Optional[str] = Field(None, alias="商圈", description="商圈")
    
    @field_validator('community_name', 'data_source', 'source_property_id', 'orientation', 'floor_original', mode='before')
    @classmethod
    def strip_whitespace(cls, v):
        """自动去除字符串字段的首尾空格"""
        if isinstance(v, str):
            return v.strip()
        return v
    
    @field_validator('image_urls', mode='before')
    @classmethod
    def validate_image_urls(cls, v):
        """验证图片URL列表"""
        if v is None:
            return v
        if isinstance(v, str):
            # 如果是字符串，按逗号分割
            return [url.strip() for url in v.split(',') if url.strip()]
        if isinstance(v, list):
            # 如果是列表，过滤空值
            return [url.strip() for url in v if url and url.strip()]
        return v
    
    @model_validator(mode='after')
    def validate_fields_based_on_status(self):
        """根据状态动态验证必填字段"""
        if self.status == IngestionStatus.FOR_SALE:
            if self.listed_price_wan is None or self.listed_price_wan <= 0:
                raise ValueError("在售房源必须提供有效的挂牌价(万)")
            if self.listed_date is None:
                raise ValueError("在售房源必须提供上架时间")
        elif self.status == IngestionStatus.SOLD:
            if self.sold_price_wan is None or self.sold_price_wan <= 0:
                raise ValueError("成交房源必须提供有效的成交价(万)")
            if self.sold_date is None:
                raise ValueError("成交房源必须提供成交时间")
        return self
    
    model_config = {
        "populate_by_name": True,  # 允许使用字段名或别名
        "str_strip_whitespace": True,  # 自动去除空格
    }


# ==================== 响应模型 ====================
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

    @classmethod
    def from_orm_with_calculations(cls, property_obj, community: Community):
        """
        从 ORM 模型转换并计算附加字段

        Args:
            property_obj: PropertyCurrent ORM 对象
            community: Community ORM 对象

        Returns:
            PropertyResponse 实例
        """
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
            updated_at=property_obj.updated_at
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
    def from_orm_with_calculations(cls, property_obj, community: Community):
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


# ==================== 小区相关模型 ====================
class CommunityResponse(BaseModel):
    """小区响应模型"""
    id: int
    name: str
    city_id: Optional[int] = None
    district: Optional[str] = None
    business_circle: Optional[str] = None
    avg_price_wan: Optional[float] = None
    total_properties: int
    created_at: datetime
    
    model_config = {
        "from_attributes": True
    }


class CommunityListResponse(BaseModel):
    """小区列表响应"""
    total: int
    items: List[CommunityResponse]


class CommunityMergeRequest(BaseModel):
    """小区合并请求"""
    primary_id: int = Field(..., description="主小区ID")
    merge_ids: List[int] = Field(..., min_length=1, description="要合并的小区ID列表")
    
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


# ==================== 上传相关模型 ====================
class UploadResult(BaseModel):
    """CSV上传结果"""
    total: int = Field(..., description="总记录数")
    success: int = Field(..., description="成功导入数")
    failed: int = Field(..., description="失败记录数")
    failed_file_url: Optional[str] = Field(None, description="失败记录CSV下载链接")


class PushResult(BaseModel):
    """JSON推送结果"""
    total: int = Field(..., description="总记录数")
    success: int = Field(..., description="成功导入数")
    failed: int = Field(..., description="失败记录数")
    errors: List[dict] = Field(default_factory=list, description="错误详情列表")


# ==================== 导入结果模型 ====================
class ImportResult(BaseModel):
    """单条数据导入结果"""
    success: bool
    property_id: Optional[int] = None
    error: Optional[str] = None


class BatchImportResult(BaseModel):
    """批量导入结果"""
    total: int
    success: int
    failed: int
    failed_records: List[dict] = Field(default_factory=list)


# ==================== 楼层解析结果 ====================
class FloorInfo(BaseModel):
    """楼层解析结果"""
    floor_number: Optional[int] = None
    total_floors: Optional[int] = None
    floor_level: Optional[str] = None


# ==================== 历史记录模型 ====================
class PropertyHistoryResponse(BaseModel):
    """房源历史记录响应"""
    id: int
    change_type: str
    captured_at: datetime
    status: str
    listed_price_wan: Optional[float] = None
    sold_price_wan: Optional[float] = None
    build_area: Optional[float] = None
    
    model_config = {
        "from_attributes": True
    }


# ==================== 失败记录模型 ====================
class FailedRecordResponse(BaseModel):
    """失败记录响应"""
    id: int
    data_source: Optional[str] = None
    failure_type: str
    failure_reason: str
    occurred_at: datetime
    is_handled: bool
    
    model_config = {
        "from_attributes": True
    }
