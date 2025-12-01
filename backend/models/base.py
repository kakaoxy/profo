"""
基础模型和枚举类型
"""
from sqlalchemy.orm import declarative_base
import enum


Base = declarative_base()


class PropertyStatus(str, enum.Enum):
    """房源状态枚举"""
    FOR_SALE = "在售"
    SOLD = "成交"


class ChangeType(str, enum.Enum):
    """变更类型枚举"""
    PRICE_CHANGE = "price_change"
    STATUS_CHANGE = "status_change"
    INFO_CHANGE = "info_change"


class MediaType(str, enum.Enum):
    """媒体类型枚举"""
    FLOOR_PLAN = "floor_plan"  # 户型图
    INTERIOR = "interior"  # 室内图
    EXTERIOR = "exterior"  # 外观图
    OTHER = "other"