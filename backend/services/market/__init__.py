"""市场情报服务模块（原L1）.

提供房源查询、导入、小区合并和数据解析功能。

使用方式:
    from services.market import PropertyQueryService, PropertyImporter
    from services.market import CommunityMerger, FloorParser
"""

from .batch_importer import CSVBatchImporter
from .community_service import (
    CommunityQueryService,
    _find_existing_community_by_name,
    get_community_service,
)
from .csv_parser import CSVParser
from .failed_record_handler import FailedRecordHandler
from .filters import apply_filters
from .import_task_processor import (
    ImportTaskProcessor,
    get_task_processor,
    start_import_task,
)
from .import_task_service import ImportTaskService, get_import_task_service
from .importer import PropertyImporter
from .merger import CommunityMerger, MergeResult
from .parser import FloorInfo, FloorParser
from .property_service import PropertyService, get_property_service
from .query import PropertyQueryService, get_property_query_service
from .sorting import apply_sorting

__all__ = [
    "CSVBatchImporter",
    # CSV解析和失败记录处理
    "CSVParser",
    # 合并服务
    "CommunityMerger",
    # 小区服务
    "CommunityQueryService",
    "FailedRecordHandler",
    "FloorInfo",
    # 解析工具
    "FloorParser",
    "ImportTaskProcessor",
    # 异步导入任务服务
    "ImportTaskService",
    "MergeResult",
    # 导入服务
    "PropertyImporter",
    # 查询服务
    "PropertyQueryService",
    "PropertyService",
    "_find_existing_community_by_name",
    # 筛选排序工具
    "apply_filters",
    "apply_sorting",
    "get_community_service",
    "get_import_task_service",
    "get_property_query_service",
    "get_property_service",
    "get_task_processor",
    "start_import_task",
]
