"""项目管理服务模块（原L3）.

提供项目全生命周期管理服务，包括：
- 项目创建与基础CRUD
- 装修阶段管理
- 销售跟进管理
- 财务记录管理

使用方式:
    from services.projects import ProjectService
    from services.projects import ProjectCoreService, RenovationService
    from services.projects import SalesService, FinanceService
"""

# Facade 聚合服务（向后兼容）
# 核心子服务
from .core import ProjectCoreService
from .facade import ProjectService
from .finance import CashFlowService, FinanceService, ProjectFinanceService

# 内部组件（如需直接使用）
from .internal import ProjectQueryService, ProjectResponseBuilder, ProjectStateManager
from .renovation import ProjectRenovationService, RenovationService
from .sales import ProjectSalesService, SalesService

__all__ = [
    "CashFlowService",
    # 财务服务
    "FinanceService",
    # 核心服务
    "ProjectCoreService",
    "ProjectFinanceService",
    # 内部组件
    "ProjectQueryService",
    "ProjectRenovationService",
    "ProjectResponseBuilder",
    "ProjectSalesService",
    # Facade 聚合服务
    "ProjectService",
    "ProjectStateManager",
    # 装修服务
    "RenovationService",
    # 销售服务
    "SalesService",
]
