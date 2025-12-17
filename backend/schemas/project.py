"""
项目管理相关Schema (聚合入口)
此文件用于向后兼容，从拆分后的子模块中导出所有模型。
"""

# 1. 从 common 导入通用响应，并在此重新导出，以兼容旧引用
from .common import BaseResponse, GenericBaseResponse

# 2. 导入 Core (基础 CRUD)
from .project_core import (
    ProjectBase,
    ProjectCreate,
    ProjectUpdate,
    ProjectResponse,
    ProjectListResponse,
    ProjectStatsResponse,
    StatusUpdate
)

# 3. 导入 Renovation (装修)
from .project_renovation import (
    RenovationUpdate,
    RenovationPhotoUpload,
    RenovationPhotoResponse
)

# 4. 导入 Sales (销售)
from .project_sales import (
    SalesRecordCreate,
    SalesRecordResponse,
    SalesRolesUpdate,
    ProjectCompleteRequest
)

# 5. 导入 Finance (财务)
from .project_finance import (
    CashFlowRecordCreate,
    CashFlowRecordResponse,
    CashFlowSummary,
    CashFlowResponse,
    ProjectReportResponse
)