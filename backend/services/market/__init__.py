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
from .import_task_service import ImportTaskService, get_import_task_service
from .import_task_processor import ImportTaskProcessor, get_task_processor, start_import_task
from .csv_parser import CSVParser
from .failed_record_handler import FailedRecordHandler

__all__ = [
    # 查询服务
    "PropertyQueryService",
    "get_property_query_service",
    # 导入服务
    "PropertyImporter",
    "CSVBatchImporter",
    # 异步导入任务服务
    "ImportTaskService",
    "get_import_task_service",
    "ImportTaskProcessor",
    "get_task_processor",
    "start_import_task",
    # CSV解析和失败记录处理
    "CSVParser",
    "FailedRecordHandler",
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
