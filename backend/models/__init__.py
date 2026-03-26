"""
数据库模型模块
按功能拆分的SQLAlchemy模型
"""

from .base import (
    Base, PropertyStatus, ChangeType, MediaType,
    ProjectStatus, RenovationStage, CashFlowType, CashFlowCategory, RecordType,
    LeadStatus, FollowUpMethod
)
from .community import Community, CommunityAlias, CommunityCompetitor
from .property import PropertyCurrent, PropertyHistory
from .media import PropertyMedia
from .error import FailedRecord
from .project import (
    Project,
    ProjectContract,
    ProjectOwner,
    ProjectSale,
    ProjectFollowUp,
    ProjectEvaluation,
    ProjectInteraction,
    FinanceRecord,
    ProjectStatusLog,
    ProjectRenovation,
    RenovationPhoto,
)
from .user import User, Role
from .lead import Lead, LeadFollowUp, LeadPriceHistory

# L4 市场营销层模型
from .l4_marketing import (
    L4MarketingProject,
    L4MarketingMedia,
    PublishStatus,
    MarketingProjectStatus,
)

__all__ = [
    'Base',
    'PropertyStatus',
    'ChangeType',
    'MediaType',
    'ProjectStatus',
    'RenovationStage',
    'CashFlowType',
    'CashFlowCategory',
    'RecordType',
    'LeadStatus',
    'FollowUpMethod',
    'Community',
    'CommunityAlias',
    'CommunityCompetitor',
    'PropertyCurrent',
    'PropertyHistory',
    'PropertyMedia',
    'FailedRecord',
    'Project',
    'ProjectContract',
    'ProjectOwner',
    'ProjectSale',
    'ProjectFollowUp',
    'ProjectEvaluation',
    'ProjectInteraction',
    'FinanceRecord',
    'ProjectStatusLog',
    'ProjectRenovation',
    'RenovationPhoto',
    'User',
    'Role',
    'Lead',
    'LeadFollowUp',
    'LeadPriceHistory',
    # L4 市场营销模型
    'L4MarketingProject',
    'L4MarketingMedia',
    'PublishStatus',
    'MarketingProjectStatus',
]
