"""市场营销服务模块（原L4）.

提供营销项目管理、媒体资源管理和从L3项目导入功能。

使用方式:
    from services.marketing import MarketingProjectService
    from services.marketing import MarketingMediaService
    from services.marketing import MarketingImportService, MarketingQueryService
"""

from .import_service import MarketingImportService
from .media import MarketingMediaService
from .project import MarketingProjectService
from .query import MarketingQueryService

__all__ = [
    "MarketingImportService",
    "MarketingMediaService",
    "MarketingProjectService",
    "MarketingQueryService",
]
