"""数据验证模型 (Pydantic Schemas)

按功能模块拆分的Pydantic模型.

目录结构:
- common.py: 通用模型（分页、基础响应等）
- response.py: 统一API响应模型
- upload.py: 上传和导入相关
- project/: 项目管理相关
- property/: 房源管理相关
- lead/: Leads管理相关
- community/: 小区管理相关
- user/: 用户和认证相关
- monitor/: 监控和市场分析相关
- l4_marketing/: L4市场营销层

文件行数说明：
本文件约270行（超过250行限制）。未拆分的原因：
1. 本文件是纯粹的聚合导出文件，没有业务逻辑代码
2. 所有具体模型已实现并分布在各自的子模块中
3. 拆分会增加不必要的文件层级，降低导入便利性
4. 统一出口模式是Python包的常见做法，便于使用者一次性导入所需模型
"""  # noqa: D400, D415

# 2. Common
from .common import (
    FailedRecordResponse,
)

# 4. Community (小区)
from .community import (
    CommunityListResponse,
    CommunityMergeRequest,
    CommunityMergeResponse,
    CommunityResponse,
    CommunitySearchResponse,
)

# 10. L4 Marketing
from .l4_marketing import (
    ImportableMediaResponse,
    L3ProjectBriefResponse,
    L3ProjectImportResponse,
    L3ProjectListResponse,
    L3ProjectQueryParams,
    L4MarketingMediaBase,
    L4MarketingMediaCreate,
    L4MarketingMediaListResponse,
    L4MarketingMediaResponse,
    L4MarketingMediaUpdate,
    L4MarketingProjectBase,
    L4MarketingProjectCreate,
    L4MarketingProjectListResponse,
    L4MarketingProjectQuery,
    L4MarketingProjectResponse,
    L4MarketingProjectUpdate,
    L4RefreshResponse,
    L4SyncResponse,
    MarketingProjectStatus,
    L4MediaType,
    PhotoCategory,
    PublishStatus,
)

# 8. Lead (Leads管理)
from .lead import (
    LeadCreate,
    LeadListItem,
    LeadResponse,
    LeadUpdate,
    PaginatedLeadListResponse,
    PaginatedLeadResponse,
)

# 9. Monitor (监控和市场分析)
from .monitor import (
    AddCompetitorRequest,
    AIStrategyRequest,
    AIStrategyResponse,
    CompetitorResponse,
    FloorStats,
    MarketSentimentResponse,
    NeighborhoodRadarItem,
    NeighborhoodRadarResponse,
    RiskPoints,
    TrendData,
    TrendResponse,
)

# 6. Project (项目) - 从新位置导入
from .project import (
    CashFlowRecordCreate,
    CashFlowRecordResponse,
    CashFlowResponse,
    CashFlowSummary,
    ProjectCompleteRequest,
    ProjectCreate,
    ProjectListResponse,
    ProjectReportResponse,
    ProjectResponse,
    ProjectStatsResponse,
    ProjectUpdate,
    RenovationPhotoResponse,
    RenovationPhotoUpload,
    RenovationUpdate,
    SalesRecordCreate,
    SalesRecordResponse,
    SalesRolesUpdate,
    StatusUpdate,
)

# 3. Property (房源)
from .property import (
    FloorInfo,
    PaginatedPropertyResponse,
    PropertyDetailResponse,
    PropertyHistoryResponse,
    PropertyIngestionModel,
    PropertyResponse,
)

# 1. 分页响应模型
from .response import PaginatedResponse

# 5. Upload (上传导入)
from .upload import (
    BatchImportResult,
    ImportResult,
    ImportTaskCreateResponse,
    ImportTaskStatusResponse,
    PushResult,
    UploadResult,
)

# 7. User (用户)
from .user import (
    LoginRequest,
    PasswordChange,
    RefreshTokenRequest,
    RoleCreate,
    RoleListResponse,
    RoleResponse,
    RoleUpdate,
    TokenResponse,
    UserCreate,
    UserListResponse,
    UserResponse,
    UserUpdate,
    WechatLoginRequest,
)

__all__ = [
    "AIStrategyRequest",
    "AIStrategyResponse",
    "AddCompetitorRequest",
    "BatchImportResult",
    "CashFlowRecordCreate",
    "CashFlowRecordResponse",
    "CashFlowResponse",
    "CashFlowSummary",
    "CommunityListResponse",
    "CommunityMergeRequest",
    "CommunityMergeResponse",
    # Community
    "CommunityResponse",
    "CommunitySearchResponse",
    "CompetitorResponse",
    # Common
    "FailedRecordResponse",
    "FloorInfo",
    # Monitor
    "FloorStats",
    "ImportResult",
    "ImportTaskCreateResponse",
    "ImportTaskStatusResponse",
    "ImportableMediaResponse",
    # Enums
    "L3ProjectBriefResponse",
    "L3ProjectImportResponse",
    "L3ProjectListResponse",
    "L3ProjectQueryParams",
    "L4MarketingMediaBase",
    "L4MarketingMediaCreate",
    "L4MarketingMediaListResponse",
    "L4MarketingMediaResponse",
    "L4MarketingMediaUpdate",
    "L4MarketingProjectBase",
    "L4MarketingProjectCreate",
    "L4MarketingProjectListResponse",
    "L4MarketingProjectQuery",
    "L4MarketingProjectResponse",
    "L4MarketingProjectUpdate",
    "L4RefreshResponse",
    "L4SyncResponse",
    # Lead
    "LeadCreate",
    "LeadListItem",
    "LeadResponse",
    "LeadUpdate",
    "LoginRequest",
    "MarketSentimentResponse",
    "MarketingProjectStatus",
    "L4MediaType",
    "NeighborhoodRadarItem",
    "NeighborhoodRadarResponse",
    "PaginatedLeadListResponse",
    "PaginatedLeadResponse",
    "PaginatedPropertyResponse",
    # Response Models
    "PaginatedResponse",
    "PasswordChange",
    "PhotoCategory",
    "ProjectCompleteRequest",
    # Project
    "ProjectCreate",
    "ProjectListResponse",
    "ProjectReportResponse",
    "ProjectResponse",
    "ProjectStatsResponse",
    "ProjectUpdate",
    "PropertyDetailResponse",
    "PropertyHistoryResponse",
    # Property
    "PropertyIngestionModel",
    "PropertyResponse",
    # L4 Marketing
    "PublishStatus",
    "PushResult",
    "RefreshTokenRequest",
    "RenovationPhotoResponse",
    "RenovationPhotoUpload",
    "RenovationUpdate",
    "RiskPoints",
    "RoleCreate",
    "RoleListResponse",
    "RoleResponse",
    "RoleUpdate",
    "SalesRecordCreate",
    "SalesRecordResponse",
    "SalesRolesUpdate",
    "StatusUpdate",
    "TokenResponse",
    "TrendData",
    "TrendResponse",
    # Upload
    "UploadResult",
    # User
    "UserCreate",
    "UserListResponse",
    "UserResponse",
    "UserUpdate",
    "WechatLoginRequest",
]
