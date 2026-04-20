"""
项目管理相关Schema (聚合入口)
此模块包含所有与项目功能相关的Pydantic模型
"""

# 1. 从 common 导入通用响应（向后兼容）
from ..common import BaseResponse, GenericBaseResponse

# 2. 导入 Core (基础 CRUD)
from .core import (
    ProjectBase,
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    ProjectStatsResponse,
    StatusUpdate,
)

# 3. 导入 Renovation (装修)
from .renovation import (
    RenovationUpdate,
    RenovationPhotoUpload,
    RenovationPhotoResponse,
    RenovationContractUpdate,
    RenovationContractResponse,
    RenovationBase,
    RenovationCreate,
    RenovationInfoUpdate,
    RenovationResponse,
    RenovationListResponse,
)

# 4. 导入 Sales (销售)
from .sales import (
    SalesRolesUpdate,
    SalesRecordCreate,
    SalesRecordResponse,
    ProjectCompleteRequest,
    SaleBase,
    SaleCreate,
    SaleUpdate,
    SaleResponse,
    SaleListResponse,
    InteractionBase,
    InteractionCreate,
    InteractionUpdate,
    InteractionResponse,
    InteractionListResponse,
)

# 5. 导入 Finance (财务)
from .finance import (
    CashFlowRecordCreate,
    CashFlowRecordResponse,
    CashFlowSummary,
    CashFlowResponse,
    ProjectReportResponse,
    FinanceBase,
    FinanceCreate,
    FinanceUpdate,
    FinanceResponse,
    FinanceListResponse,
)

# 6. 导入规范化表 Schema
from .contract import (
    SigningMaterial,
    ContractBase,
    ContractCreate,
    ContractUpdate,
    ContractResponse,
    ContractListResponse,
)
from .owner import (
    OwnerBase,
    OwnerCreate,
    OwnerUpdate,
    OwnerResponse,
    OwnerListResponse,
)
from .followup import (
    FollowUpBase,
    FollowUpCreate,
    FollowUpUpdate,
    FollowUpResponse,
    FollowUpListResponse,
)
from .evaluation import (
    EvaluationBase,
    EvaluationCreate,
    EvaluationUpdate,
    EvaluationResponse,
    EvaluationListResponse,
)
from .status_log import (
    StatusLogBase,
    StatusLogCreate,
    StatusLogUpdate,
    StatusLogResponse,
    StatusLogListResponse,
)

__all__ = [
    # Common (向后兼容)
    "BaseResponse",
    "GenericBaseResponse",
    # Core
    "ProjectBase",
    "ProjectCreate",
    "ProjectUpdate",
    "ProjectResponse",
    "ProjectListResponse",
    "ProjectStatsResponse",
    "StatusUpdate",
    # Renovation
    "RenovationUpdate",
    "RenovationPhotoUpload",
    "RenovationPhotoResponse",
    "RenovationContractUpdate",
    "RenovationContractResponse",
    "RenovationBase",
    "RenovationCreate",
    "RenovationInfoUpdate",
    "RenovationResponse",
    "RenovationListResponse",
    # Sales
    "SalesRolesUpdate",
    "SalesRecordCreate",
    "SalesRecordResponse",
    "ProjectCompleteRequest",
    "SaleBase",
    "SaleCreate",
    "SaleUpdate",
    "SaleResponse",
    "SaleListResponse",
    "InteractionBase",
    "InteractionCreate",
    "InteractionUpdate",
    "InteractionResponse",
    "InteractionListResponse",
    # Finance
    "CashFlowRecordCreate",
    "CashFlowRecordResponse",
    "CashFlowSummary",
    "CashFlowResponse",
    "ProjectReportResponse",
    "FinanceBase",
    "FinanceCreate",
    "FinanceUpdate",
    "FinanceResponse",
    "FinanceListResponse",
    # Contract
    "SigningMaterial",
    "ContractBase",
    "ContractCreate",
    "ContractUpdate",
    "ContractResponse",
    "ContractListResponse",
    # Owner
    "OwnerBase",
    "OwnerCreate",
    "OwnerUpdate",
    "OwnerResponse",
    "OwnerListResponse",
    # FollowUp
    "FollowUpBase",
    "FollowUpCreate",
    "FollowUpUpdate",
    "FollowUpResponse",
    "FollowUpListResponse",
    # Evaluation
    "EvaluationBase",
    "EvaluationCreate",
    "EvaluationUpdate",
    "EvaluationResponse",
    "EvaluationListResponse",
    # StatusLog
    "StatusLogBase",
    "StatusLogCreate",
    "StatusLogUpdate",
    "StatusLogResponse",
    "StatusLogListResponse",
]