"""项目管理相关Schema (聚合入口)

此模块包含所有与项目功能相关的Pydantic模型.
"""  # noqa: D400, D415

# 1. 导入 Core (基础 CRUD)
# 2. 导入规范化表 Schema
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
    ProjectFilter,
    ProjectListResponse,
    ProjectResponse,
    ProjectStatsResponse,
    ProjectStatusUpdate,
    ProjectUpdate,
)
from .document import (
    DocumentCreate,
    DocumentInitializeResponse,
    DocumentResponse,
    DocumentUpdate,
)
from .evaluation import (
    EvaluationBase,
    EvaluationCreate,
    EvaluationListResponse,
    EvaluationResponse,
    EvaluationUpdate,
)

# 3. 导入 Finance (财务)
from .finance import (
    CashFlowRecordCreate,
    CashFlowRecordResponse,
    CashFlowResponse,
    CashFlowSummary,
    FinanceBase,
    FinanceCreate,
    FinanceListResponse,
    FinanceLogResponse,
    FinanceResponse,
    FinanceSettlementChangeRequest,
    FinanceSettlementResponse,
    FinanceUnsettleRequest,
    FinanceUpdate,
    LedgerListResponse,
    LedgerProjectListItem,
    LedgerRecordCreate,
    LedgerRecordUpdate,
    LedgerStatsResponse,
    ProjectReportResponse,
    ReceivablePayableItem,
    ReceivablePayableResponse,
)
from .followup import (
    FollowUpBase,
    FollowUpCreate,
    FollowUpListResponse,
    FollowUpResponse,
    FollowUpUpdate,
)

# 3.1 导入 Ledger 统计页面 Schema（从 finance.py 拆分）
from .ledger_statistics import ProjectLedgerStatisticsResponse
from .owner import (
    OwnerBase,
    OwnerCreate,
    OwnerListResponse,
    OwnerResponse,
    OwnerUpdate,
)

# 4. 导入 Renovation (装修)
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

# 5. 导入 Sales (销售)
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
    # Document
    "DocumentCreate",
    "DocumentInitializeResponse",
    "DocumentResponse",
    "DocumentUpdate",
    # Evaluation
    "EvaluationBase",
    "EvaluationCreate",
    "EvaluationListResponse",
    "EvaluationResponse",
    "EvaluationUpdate",
    "FinanceBase",
    "FinanceCreate",
    "FinanceListResponse",
    "FinanceLogResponse",
    "FinanceResponse",
    "FinanceSettlementChangeRequest",
    "FinanceSettlementResponse",
    "FinanceUnsettleRequest",
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
    "LedgerListResponse",
    "LedgerProjectListItem",
    "LedgerRecordCreate",
    "LedgerRecordUpdate",
    "LedgerStatsResponse",
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
    "ProjectFilter",
    "ProjectLedgerStatisticsResponse",
    "ProjectListResponse",
    "ProjectReportResponse",
    "ProjectResponse",
    "ProjectStatsResponse",
    "ProjectStatusUpdate",
    "ProjectUpdate",
    "ReceivablePayableItem",
    "ReceivablePayableResponse",
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
]
