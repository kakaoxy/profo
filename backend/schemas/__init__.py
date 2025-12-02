"""
数据验证模型 (Pydantic Schemas)
按功能模块拆分的Pydantic模型
"""

from .enums import IngestionStatus, MediaTypeEnum
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
from .common import FailedRecordResponse
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

    # Property schemas
    'PropertyIngestionModel',
    'PropertyResponse',
    'PropertyDetailResponse',
    'PaginatedPropertyResponse',
    'PropertyHistoryResponse',
    'FloorInfo',

    # Community schemas
    'CommunityResponse',
    'CommunityListResponse',
    'CommunityMergeRequest',
    'CommunityMergeResponse',

    # Upload schemas
    'UploadResult',
    'PushResult',
    'ImportResult',
    'BatchImportResult',

    # Common schemas
    'FailedRecordResponse',

    # Project schemas
    'BaseResponse',
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
    
    # User and auth schemas
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