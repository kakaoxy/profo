"""
房源相关Schema (聚合入口)
"""

# 1. 导入通用模型 (从 common 导入，重新导出以向后兼容)
from ..common import FloorInfo, PropertyHistoryResponse

# 2. 导入核心接收模型
from .core import PropertyIngestionModel

# 3. 导入响应模型
from .response import (
    PropertyResponse,
    PropertyDetailResponse,
    PaginatedPropertyResponse,
)

__all__ = [
    # Common
    "FloorInfo",
    "PropertyHistoryResponse",
    # Core
    "PropertyIngestionModel",
    # Response
    "PropertyResponse",
    "PropertyDetailResponse",
    "PaginatedPropertyResponse",
]