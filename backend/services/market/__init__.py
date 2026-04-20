"""
市场情报服务模块（原L1）

提供房源查询、导入、小区合并和数据解析功能。

使用方式:
    from services.market import PropertyQueryService, PropertyImporter
    from services.market import CommunityMerger, FloorParser
"""

from .query import PropertyQueryService, get_property_query_service
from .importer import PropertyImporter
from .merger import CommunityMerger, MergeResult
from .parser import FloorParser, FloorInfo
from .batch_importer import CSVBatchImporter
from .filters import apply_filters
from .sorting import apply_sorting

__all__ = [
    # 查询服务
    "PropertyQueryService",
    "get_property_query_service",
    # 导入服务
    "PropertyImporter",
    "CSVBatchImporter",
    # 合并服务
    "CommunityMerger",
    "MergeResult",
    # 解析工具
    "FloorParser",
    "FloorInfo",
    # 筛选排序工具
    "apply_filters",
    "apply_sorting",
]
