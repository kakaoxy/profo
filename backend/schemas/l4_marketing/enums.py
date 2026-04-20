"""
L4 市场营销层枚举和常量
"""
from enum import Enum


class PublishStatus(str, Enum):
    """发布状态枚举"""
    DRAFT = "草稿"
    PUBLISHED = "发布"


class MarketingProjectStatus(str, Enum):
    """营销项目状态枚举"""
    IN_PROGRESS = "在途"
    FOR_SALE = "在售"
    SOLD = "已售"


class MediaType(str, Enum):
    """媒体类型"""
    IMAGE = "image"
    VIDEO = "video"


class PhotoCategory(str, Enum):
    """照片分类"""
    MARKETING = "marketing"
    RENOVATION = "renovation"
