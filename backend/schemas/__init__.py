"""
数据验证模型 (Pydantic Schemas)
按功能模块拆分的Pydantic模型
"""

from .enums import IngestionStatus, MediaTypeEnum

# 1. 优先导入 Common (包含 BaseResponse)
from .common import (
    BaseResponse,          # <--- 现在从 common 导入
    GenericBaseResponse,   # <--- 现在从 common 导入
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

    # Common
    'BaseResponse',
    'GenericBaseResponse',
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