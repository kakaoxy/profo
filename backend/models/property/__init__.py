"""房源信息模块.

包含房源、小区和媒体资源管理.
"""

from .community import Community, CommunityAlias, CommunityCompetitor
from .community_image import CommunityImage, CommunityImageSource
from .media import PropertyMedia
from .property import PropertyCurrent, PropertyHistory

__all__ = [
    "Community",
    "CommunityAlias",
    "CommunityCompetitor",
    "CommunityImage",
    "CommunityImageSource",
    "PropertyCurrent",
    "PropertyHistory",
    "PropertyMedia",
]
