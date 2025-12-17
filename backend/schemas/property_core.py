from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, model_validator
from .enums import IngestionStatus


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
