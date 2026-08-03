"""数据库模型模块.

按业务功能组织的SQLAlchemy模型.
"""

# 基础模块
from .common import (
    Base,
    BaseModel,
    BusinessForm,
    CashFlowCategory,
    CashFlowType,
    ChangeType,
    FinanceActionType,
    FollowUpMethod,
    ImportTaskStatus,
    InvestmentActionType,
    InvestorType,
    LeadStatus,
    MediaType,
    ProjectStatus,
    PropertyStatus,
    RecordType,
    RenovationStage,
    SettlementStatus,
    SubjectLevel,
    SubjectStage,
)

# 投资管理（跟投管理）模块
from .investment import (
    Investment,
    InvestmentLog,
    Investor,
    ReturnAdjustment,
)

# 线索管理模块
from .lead import Lead, LeadFollowUp, LeadPriceHistory

# L4 市场营销模块
from .marketing import (
    L4MarketingMedia,
    L4MarketingProject,
    MarketingProjectStatus,
    PhotoCategory,
    PublishStatus,
)

# 项目管理模块
from .project import (
    FinanceRecord,
    FinanceRecordLog,
    FinanceSubject,
    Project,
    ProjectContract,
    ProjectDocument,
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
from .system import FailedRecord, OperationLog, PropertyImportTask, WeChatOAuthState, WeChatTempCode

# 用户权限模块
from .user import (
    ApiKey,
    Permission,
    PermissionCategory,
    RefreshToken,
    Role,
    User,
    UserRole,
    role_permissions,
    user_roles,
)

__all__ = [
    "ApiKey",
    # 基础
    "Base",
    "BaseModel",
    "BusinessForm",
    "CashFlowCategory",
    "CashFlowType",
    "ChangeType",
    # 房源
    "Community",
    "CommunityAlias",
    "CommunityCompetitor",
    # 系统
    "FailedRecord",
    "FinanceActionType",
    "FinanceRecord",
    "FinanceRecordLog",
    "FinanceSubject",
    "FollowUpMethod",
    "ImportTaskStatus",
    "Investment",
    "InvestmentActionType",
    "InvestmentLog",
    "Investor",
    "InvestorType",
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
    "OperationLog",
    "Permission",
    "PermissionCategory",
    "PhotoCategory",
    # 项目
    "Project",
    "ProjectContract",
    "ProjectDocument",
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
    # 用户
    "RefreshToken",
    "RenovationPhoto",
    "RenovationStage",
    "ReturnAdjustment",
    "Role",
    "SettlementStatus",
    "SubjectLevel",
    "SubjectStage",
    "User",
    "UserRole",
    # 微信 OAuth
    "WeChatOAuthState",
    "WeChatTempCode",
    "role_permissions",
    "user_roles",
]
