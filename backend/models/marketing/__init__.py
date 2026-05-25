"""L4市场营销模块.

包含营销项目和媒体资源管理.
"""

from .l4_marketing import (
    L4MarketingMedia,
    L4MarketingProject,
    MarketingProjectStatus,
    PhotoCategory,
    PublishStatus,
)

__all__ = [
    "L4MarketingMedia",
    "L4MarketingProject",
    "MarketingProjectStatus",
    "PhotoCategory",
    "PublishStatus",
]
