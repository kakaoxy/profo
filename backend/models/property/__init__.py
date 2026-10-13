"""房源信息模块.

包含房源、小区、媒体资源与楼盘字典管理.
"""

from .bd_import_task import BdImportTask
from .building_dict import (
    BdBuilding,
    BdEntryKind,
    BdEntryStatus,
    BdPendingEntry,
    BdPendingReference,
    BdReferenceStatus,
    BdRoom,
)
from .community import Community, CommunityAlias, CommunityCompetitor
from .community_image import CommunityImage, CommunityImageSource
from .media import PropertyMedia
from .property import PropertyCurrent, PropertyHistory

__all__ = [
    "BdBuilding",
    "BdEntryKind",
    "BdEntryStatus",
    "BdImportTask",
    "BdPendingEntry",
    "BdPendingReference",
    "BdReferenceStatus",
    "BdRoom",
    "Community",
    "CommunityAlias",
    "CommunityCompetitor",
    "CommunityImage",
    "CommunityImageSource",
    "PropertyCurrent",
    "PropertyHistory",
    "PropertyMedia",
]
