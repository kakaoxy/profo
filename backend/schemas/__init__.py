"""
数据验证模型 (Pydantic Schemas)
按功能模块拆分的Pydantic模型

目录结构:
- common.py: 通用模型（分页、基础响应等）
- response.py: 统一API响应模型
- enums.py: 枚举类型定义
- upload.py: 上传和导入相关
- project/: 项目管理相关
- property/: 房源管理相关
- lead/: Leads管理相关
- community/: 小区管理相关
- user/: 用户和认证相关
- monitor/: 监控和市场分析相关
- l4_marketing/: L4市场营销层
"""

from .enums import IngestionStatus, MediaTypeEnum

# 1. 分页响应模型
from .response import PaginatedResponse

# 2. Common
from .common import (
    BaseResponse,          # 保留兼容，但标记为弃用
    GenericBaseResponse,   # 保留兼容，但标记为弃用
    FailedRecordResponse,
    PropertyHistoryResponse,
    FloorInfo
)

# 3. Property (房源)
from .property import (
    PropertyIngestionModel,
    PropertyResponse,
    PropertyDetailResponse,
    PaginatedPropertyResponse,
    PropertyHistoryResponse,
    FloorInfo,
)

# 4. Community (小区)
from .community import (
    CommunityResponse,
    CommunityListResponse,
    CommunityMergeRequest,
    CommunityMergeResponse,
)

# 5. Upload (上传导入)
from .upload import UploadResult, PushResult, ImportResult, BatchImportResult

# 6. Project (项目) - 从新位置导入
from .project import (
    BaseResponse,
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    ProjectStatsResponse,
    RenovationUpdate,
    RenovationPhotoUpload,
    RenovationPhotoResponse,
    StatusUpdate,
    ProjectCompleteRequest,
    CashFlowRecordCreate,
    CashFlowRecordResponse,
    CashFlowSummary,
    CashFlowResponse,
    SalesRecordCreate,
    SalesRecordResponse,
    SalesRolesUpdate,
    ProjectReportResponse,
)

# 7. User (用户)
from .user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    PasswordChange,
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleListResponse,
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    WechatLoginRequest,
)

# 8. Lead (Leads管理)
from .lead import (
    LeadCreate,
    LeadUpdate,
    LeadResponse,
    PaginatedLeadResponse,
    LeadListItem,
    PaginatedLeadListResponse,
)

# 9. Monitor (监控和市场分析)
from .monitor import (
    FloorStats,
    MarketSentimentResponse,
    TrendData,
    TrendResponse,
    CompetitorResponse,
    AddCompetitorRequest,
    AIStrategyRequest,
    RiskPoints,
    AIStrategyResponse,
    NeighborhoodRadarItem,
    NeighborhoodRadarResponse,
)

# 10. L4 Marketing
from .l4_marketing import (
    PublishStatus,
    MarketingProjectStatus,
    MediaType,
    PhotoCategory,
    L4MarketingMediaBase,
    L4MarketingMediaCreate,
    L4MarketingMediaUpdate,
    L4MarketingMediaResponse,
    L4MarketingProjectBase,
    L4MarketingProjectCreate,
    L4MarketingProjectUpdate,
    L4MarketingProjectResponse,
    L4MarketingProjectQuery,
    L4SyncResponse,
    L4RefreshResponse,
    L4MarketingProjectListResponse,
    L4MarketingMediaListResponse,
)


__all__ = [
    # Enums
    'IngestionStatus',
    'MediaTypeEnum',

    # Response Models
    'PaginatedResponse',

    # Common
    'BaseResponse',        # 兼容保留
    'GenericBaseResponse', # 兼容保留
    'FailedRecordResponse',
    'PropertyHistoryResponse',
    'FloorInfo',

    # Property
    'PropertyIngestionModel',
    'PropertyResponse',
    'PropertyDetailResponse',
    'PaginatedPropertyResponse',
    'PropertyHistoryResponse',
    'FloorInfo',

    # Community
    'CommunityResponse',
    'CommunityListResponse',
    'CommunityMergeRequest',
    'CommunityMergeResponse',

    # Upload
    'UploadResult',
    'PushResult',
    'ImportResult',
    'BatchImportResult',

    # Project
    'ProjectCreate',
    'ProjectUpdate',
    'ProjectResponse',
    'ProjectListResponse',
    'ProjectStatsResponse',
    'RenovationUpdate',
    'RenovationPhotoUpload',
    'RenovationPhotoResponse',
    'StatusUpdate',
    'ProjectCompleteRequest',
    'CashFlowRecordCreate',
    'CashFlowRecordResponse',
    'CashFlowSummary',
    'CashFlowResponse',
    'SalesRecordCreate',
    'SalesRecordResponse',
    'SalesRolesUpdate',
    'ProjectReportResponse',
    
    # User
    'UserCreate',
    'UserUpdate',
    'UserResponse',
    'UserListResponse',
    'PasswordChange',
    'RoleCreate',
    'RoleUpdate',
    'RoleResponse',
    'RoleListResponse',
    'LoginRequest',
    'TokenResponse',
    'RefreshTokenRequest',
    'WechatLoginRequest',

    # Lead
    'LeadCreate',
    'LeadUpdate',
    'LeadResponse',
    'PaginatedLeadResponse',
    'LeadListItem',
    'PaginatedLeadListResponse',

    # Monitor
    'FloorStats',
    'MarketSentimentResponse',
    'TrendData',
    'TrendResponse',
    'CompetitorResponse',
    'AddCompetitorRequest',
    'AIStrategyRequest',
    'RiskPoints',
    'AIStrategyResponse',
    'NeighborhoodRadarItem',
    'NeighborhoodRadarResponse',

    # L4 Marketing
    'PublishStatus',
    'MarketingProjectStatus',
    'MediaType',
    'PhotoCategory',
    'L4MarketingMediaBase',
    'L4MarketingMediaCreate',
    'L4MarketingMediaUpdate',
    'L4MarketingMediaResponse',
    'L4MarketingProjectBase',
    'L4MarketingProjectCreate',
    'L4MarketingProjectUpdate',
    'L4MarketingProjectResponse',
    'L4MarketingProjectQuery',
    'L4SyncResponse',
    'L4RefreshResponse',
    'L4MarketingProjectListResponse',
    'L4MarketingMediaListResponse',
]