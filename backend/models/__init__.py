"""
数据库模型模块
按业务功能组织的SQLAlchemy模型
"""

# 基础模块
from .common import (
    Base,
    BaseModel,
    PropertyStatus,
    ChangeType,
    MediaType,
    ProjectStatus,
    RenovationStage,
    CashFlowType,
    CashFlowCategory,
    RecordType,
    LeadStatus,
    FollowUpMethod,
)

# 房源信息模块
from .property import (
    Community,
    CommunityAlias,
    CommunityCompetitor,
    PropertyCurrent,
    PropertyHistory,
    PropertyMedia,
)

# 系统模块
from .system import FailedRecord, PropertyImportTask, ImportTaskStatus

# 项目管理模块
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

# 用户权限模块
from .user import User, Role, ApiKey

# 线索管理模块
from .lead import Lead, LeadFollowUp, LeadPriceHistory

# L4 市场营销模块
from .marketing import (
    L4MarketingProject,
    L4MarketingMedia,
    PublishStatus,
    MarketingProjectStatus,
)

__all__ = [
    # 基础
    'Base',
    'BaseModel',
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
    # 房源
    'Community',
    'CommunityAlias',
    'CommunityCompetitor',
    'PropertyCurrent',
    'PropertyHistory',
    'PropertyMedia',
    # 系统
    'FailedRecord',
    'PropertyImportTask',
    'ImportTaskStatus',
    # 项目
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
    # 用户
    'User',
    'Role',
    'ApiKey',
    # 线索
    'Lead',
    'LeadFollowUp',
    'LeadPriceHistory',
    # L4 市场营销
    'L4MarketingProject',
    'L4MarketingMedia',
    'PublishStatus',
    'MarketingProjectStatus',
]
