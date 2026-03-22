"""
数据验证模型 (Pydantic Schemas)
按功能模块拆分的Pydantic模型
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

from .property import (
    PropertyIngestionModel,
    PropertyResponse,
    PropertyDetailResponse,
    PaginatedPropertyResponse,
    PropertyHistoryResponse,
    FloorInfo,
)
from .community import (
    CommunityResponse,
    CommunityListResponse,
    CommunityMergeRequest,
    CommunityMergeResponse,
)
from .upload import UploadResult, PushResult, ImportResult, BatchImportResult

# 2. 导入 Project (从聚合文件导入，或直接从子模块导入)
# 这里保持从 .project 导入，因为我们在上一步已经把 .project 做成了聚合入口
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
]
