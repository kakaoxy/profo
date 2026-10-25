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
    FundAccountStatus,
    FundAccountType,
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

# 财务管理（资金账户）模块
from .finance import FundAccount, FundAccountAdjustment

# 获客中心（小程序「我的客户」跨模块聚合）模块
from .growth_center import CustomerFollowUp

# 投资管理（跟投管理）模块
from .investment import (
    Investment,
    InvestmentLog,
    Investor,
    ReturnAdjustment,
)

# 钥匙管理模块
from .key import (
    KeyActorType,
    KeyAuditLog,
    KeyShare,
    KeyShareStatus,
    KeyShareView,
    KeyStatus,
    ProjectKey,
    ProjectNormalKey,
)

# 线索管理模块
from .lead import Lead, LeadFollowUp, LeadPriceHistory, ValuationShareEvent, ValuationVisit

# L4 市场营销模块
from .marketing import (
    L4MarketingMedia,
    L4MarketingNotifyLog,
    L4MarketingPriceChange,
    L4MarketingProject,
    L4MarketingProjectSubscription,
    L4MarketingSubscription,
    MarketingProjectStatus,
    NotifyType,
    PhotoCategory,
    ProjectBooking,
    ProjectShareEvent,
    ProjectVisit,
    PublishStatus,
    SendStatus,
)

# 系统模块
# 通知中心模块（迭代二：统一消息中心）
from .notification import (
    DELIVERY_CHANNELS,
    DELIVERY_STATUSES,
    NOTIFICATION_PRIORITIES,
    Notification,
    NotificationDeliveryLog,
    NotificationRecipient,
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
    BdBuilding,
    BdEntryKind,
    BdEntryStatus,
    BdImportTask,
    BdPendingEntry,
    BdPendingReference,
    BdReferenceStatus,
    BdRoom,
    Community,
    CommunityAlias,
    CommunityCompetitor,
    CommunityImage,
    CommunityImageSource,
    PropertyCurrent,
    PropertyHistory,
    PropertyMedia,
)

# 区域伙伴招募计划模块
from .recruit import (
    RecruitCampaign,
    RecruitCampaignStatus,
    RecruitLead,
    RecruitLeadSource,
    RecruitLeadStatus,
    RecruitShareEvent,
    RecruitShareType,
    RecruitVisit,
)
from .system import (
    BizDictItem,
    FailedRecord,
    OperationLog,
    PropertyImportTask,
    SystemConfig,
    WeChatOAuthState,
    WeChatTempCode,
)

# 用户权限模块
from .user import (
    NAMESPACE_NOTIFICATION_PREFS,
    NAMESPACE_WORKBENCH_LAYOUT,
    ApiKey,
    Permission,
    PermissionCategory,
    RefreshToken,
    Role,
    User,
    UserPreference,
    UserRole,
    role_permissions,
    user_roles,
)

__all__ = [
    "DELIVERY_CHANNELS",
    "DELIVERY_STATUSES",
    "NAMESPACE_NOTIFICATION_PREFS",
    "NAMESPACE_WORKBENCH_LAYOUT",
    "NOTIFICATION_PRIORITIES",
    "ApiKey",
    # 基础
    "Base",
    "BaseModel",
    "BdBuilding",
    "BdEntryKind",
    "BdEntryStatus",
    "BdImportTask",
    "BdPendingEntry",
    "BdPendingReference",
    "BdReferenceStatus",
    "BdRoom",
    "BizDictItem",
    "BusinessForm",
    "CashFlowCategory",
    "CashFlowType",
    "ChangeType",
    # 房源
    "Community",
    "CommunityAlias",
    "CommunityCompetitor",
    "CommunityImage",
    "CommunityImageSource",
    # 获客中心
    "CustomerFollowUp",
    # 系统
    "FailedRecord",
    "FinanceActionType",
    "FinanceRecord",
    "FinanceRecordLog",
    "FinanceSubject",
    "FollowUpMethod",
    "FundAccount",
    "FundAccountAdjustment",
    "FundAccountStatus",
    "FundAccountType",
    "ImportTaskStatus",
    "Investment",
    "InvestmentActionType",
    "InvestmentLog",
    "Investor",
    "InvestorType",
    "KeyActorType",
    # 钥匙管理
    "KeyAuditLog",
    "KeyShare",
    "KeyShareStatus",
    "KeyShareView",
    "KeyStatus",
    "L4MarketingMedia",
    # L4 市场营销
    "L4MarketingNotifyLog",
    "L4MarketingPriceChange",
    "L4MarketingProject",
    "L4MarketingProjectSubscription",
    "L4MarketingSubscription",
    # 线索
    "Lead",
    "LeadFollowUp",
    "LeadPriceHistory",
    "LeadStatus",
    "MarketingProjectStatus",
    "MediaType",
    "MigrationCompensation",
    "Notification",
    "NotificationDeliveryLog",
    "NotificationRecipient",
    "NotifyType",
    "OperationLog",
    "Permission",
    "PermissionCategory",
    "PhotoCategory",
    # 项目
    "Project",
    "ProjectBooking",
    "ProjectContract",
    "ProjectDocument",
    "ProjectEvaluation",
    "ProjectFollowUp",
    "ProjectInteraction",
    # 钥匙管理
    "ProjectKey",
    "ProjectNormalKey",
    "ProjectOwner",
    "ProjectRenovation",
    "ProjectSale",
    "ProjectShareEvent",
    "ProjectStatus",
    "ProjectStatusLog",
    "ProjectVisit",
    "PropertyCurrent",
    "PropertyHistory",
    "PropertyImportTask",
    "PropertyMedia",
    "PropertyStatus",
    "PublishStatus",
    "RecordType",
    # 区域伙伴招募计划
    "RecruitCampaign",
    "RecruitCampaignStatus",
    "RecruitLead",
    "RecruitLeadSource",
    "RecruitLeadStatus",
    "RecruitShareEvent",
    "RecruitShareType",
    "RecruitVisit",
    # 用户
    "RefreshToken",
    "RenovationPhoto",
    "RenovationStage",
    "ReturnAdjustment",
    "Role",
    "SchemaMigration",
    "SendStatus",
    "SettlementStatus",
    "SubjectLevel",
    "SubjectStage",
    "SystemConfig",
    "User",
    "UserPreference",
    "UserRole",
    # 估价页分享埋点
    "ValuationShareEvent",
    "ValuationVisit",
    # 微信 OAuth
    "WeChatOAuthState",
    "WeChatTempCode",
    "role_permissions",
    "user_roles",
]
