"""数据库模型模块.

按业务功能组织的SQLAlchemy模型.
"""

# 基础模块
from .common import (
    Base,
    BaseModel,
    CashFlowCategory,
    CashFlowType,
    ChangeType,
    FollowUpMethod,
    LeadStatus,
    MediaType,
    ProjectStatus,
    PropertyStatus,
    RecordType,
    RenovationStage,
)

# 线索管理模块
from .lead import Lead, LeadFollowUp, LeadPriceHistory

# L4 市场营销模块
from .marketing import (
    L4MarketingMedia,
    L4MarketingProject,
    MarketingProjectStatus,
    PublishStatus,
)

# 项目管理模块
from .project import (
    FinanceRecord,
    Project,
    ProjectContract,
    ProjectEvaluation,
    ProjectFollowUp,
    ProjectInteraction,
    ProjectOwner,
    ProjectRenovation,
    ProjectSale,
    ProjectStatusLog,
    RenovationPhoto,
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
from .system import FailedRecord, ImportTaskStatus, PropertyImportTask

# 用户权限模块
from .user import ApiKey, Role, User

__all__ = [
    "ApiKey",
    # 基础
    "Base",
    "BaseModel",
    "CashFlowCategory",
    "CashFlowType",
    "ChangeType",
    # 房源
    "Community",
    "CommunityAlias",
    "CommunityCompetitor",
    # 系统
    "FailedRecord",
    "FinanceRecord",
    "FollowUpMethod",
    "ImportTaskStatus",
    "L4MarketingMedia",
    # L4 市场营销
    "L4MarketingProject",
    # 线索
    "Lead",
    "LeadFollowUp",
    "LeadPriceHistory",
    "LeadStatus",
    "MarketingProjectStatus",
    "MediaType",
    # 项目
    "Project",
    "ProjectContract",
    "ProjectEvaluation",
    "ProjectFollowUp",
    "ProjectInteraction",
    "ProjectOwner",
    "ProjectRenovation",
    "ProjectSale",
    "ProjectStatus",
    "ProjectStatusLog",
    "PropertyCurrent",
    "PropertyHistory",
    "PropertyImportTask",
    "PropertyMedia",
    "PropertyStatus",
    "PublishStatus",
    "RecordType",
    "RenovationPhoto",
    "RenovationStage",
    "Role",
    # 用户
    "User",
]
