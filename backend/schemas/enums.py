"""
枚举类型定义
"""
from enum import Enum


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