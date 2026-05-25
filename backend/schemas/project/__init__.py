"""项目管理相关Schema (聚合入口)

此模块包含所有与项目功能相关的Pydantic模型.
"""  # noqa: D400, D415

# 1. 导入 Core (基础 CRUD)
# 6. 导入规范化表 Schema
from .contract import (
    ContractBase,
    ContractCreate,
    ContractListResponse,
    ContractResponse,
    ContractUpdate,
    SigningMaterial,
)
from .core import (
    ProjectBase,
    ProjectCreate,
    ProjectListResponse,
    ProjectResponse,
    ProjectStatsResponse,
    ProjectUpdate,
    StatusUpdate,
)
from .evaluation import (
    EvaluationBase,
    EvaluationCreate,
    EvaluationListResponse,
    EvaluationResponse,
    EvaluationUpdate,
)

# 5. 导入 Finance (财务)
from .finance import (
    CashFlowRecordCreate,
    CashFlowRecordResponse,
    CashFlowResponse,
    CashFlowSummary,
    FinanceBase,
    FinanceCreate,
    FinanceListResponse,
    FinanceResponse,
    FinanceUpdate,
    ProjectReportResponse,
)
from .followup import (
    FollowUpBase,
    FollowUpCreate,
    FollowUpListResponse,
    FollowUpResponse,
    FollowUpUpdate,
)
from .owner import (
    OwnerBase,
    OwnerCreate,
    OwnerListResponse,
    OwnerResponse,
    OwnerUpdate,
)

# 3. 导入 Renovation (装修)
from .renovation import (
    RenovationBase,
    RenovationContractResponse,
    RenovationContractUpdate,
    RenovationCreate,
    RenovationInfoUpdate,
    RenovationListResponse,
    RenovationPhotoResponse,
    RenovationPhotoUpload,
    RenovationResponse,
    RenovationUpdate,
)

# 4. 导入 Sales (销售)
from .sales import (
    InteractionBase,
    InteractionCreate,
    InteractionListResponse,
    InteractionResponse,
    InteractionUpdate,
    ProjectCompleteRequest,
    SaleBase,
    SaleCreate,
    SaleListResponse,
    SaleResponse,
    SalesRecordCreate,
    SalesRecordResponse,
    SalesRolesUpdate,
    SaleUpdate,
)
from .status_log import (
    StatusLogBase,
    StatusLogCreate,
    StatusLogListResponse,
    StatusLogResponse,
    StatusLogUpdate,
)

__all__ = [
    # Finance
    "CashFlowRecordCreate",
    "CashFlowRecordResponse",
    "CashFlowResponse",
    "CashFlowSummary",
    "ContractBase",
    "ContractCreate",
    "ContractListResponse",
    "ContractResponse",
    "ContractUpdate",
    # Evaluation
    "EvaluationBase",
    "EvaluationCreate",
    "EvaluationListResponse",
    "EvaluationResponse",
    "EvaluationUpdate",
    "FinanceBase",
    "FinanceCreate",
    "FinanceListResponse",
    "FinanceResponse",
    "FinanceUpdate",
    # FollowUp
    "FollowUpBase",
    "FollowUpCreate",
    "FollowUpListResponse",
    "FollowUpResponse",
    "FollowUpUpdate",
    "InteractionBase",
    "InteractionCreate",
    "InteractionListResponse",
    "InteractionResponse",
    "InteractionUpdate",
    # Owner
    "OwnerBase",
    "OwnerCreate",
    "OwnerListResponse",
    "OwnerResponse",
    "OwnerUpdate",
    # Core
    "ProjectBase",
    "ProjectCompleteRequest",
    "ProjectCreate",
    "ProjectListResponse",
    "ProjectReportResponse",
    "ProjectResponse",
    "ProjectStatsResponse",
    "ProjectUpdate",
    "RenovationBase",
    "RenovationContractResponse",
    "RenovationContractUpdate",
    "RenovationCreate",
    "RenovationInfoUpdate",
    "RenovationListResponse",
    "RenovationPhotoResponse",
    "RenovationPhotoUpload",
    "RenovationResponse",
    # Renovation
    "RenovationUpdate",
    "SaleBase",
    "SaleCreate",
    "SaleListResponse",
    "SaleResponse",
    "SaleUpdate",
    "SalesRecordCreate",
    "SalesRecordResponse",
    # Sales
    "SalesRolesUpdate",
    # Contract
    "SigningMaterial",
    # StatusLog
    "StatusLogBase",
    "StatusLogCreate",
    "StatusLogListResponse",
    "StatusLogResponse",
    "StatusLogUpdate",
    "StatusUpdate",
]
