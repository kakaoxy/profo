"""
项目管理服务模块（原L3）

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
from .facade import ProjectService

# 核心子服务
from .core import ProjectCoreService
from .renovation import RenovationService, ProjectRenovationService
from .sales import SalesService, ProjectSalesService
from .finance import FinanceService, ProjectFinanceService, CashFlowService

# 内部组件（如需直接使用）
from .internal import ProjectQueryService, ProjectResponseBuilder, ProjectStateManager

__all__ = [
    # Facade 聚合服务
    "ProjectService",
    # 核心服务
    "ProjectCoreService",
    # 装修服务
    "RenovationService",
    "ProjectRenovationService",
    # 销售服务
    "SalesService",
    "ProjectSalesService",
    # 财务服务
    "FinanceService",
    "ProjectFinanceService",
    "CashFlowService",
    # 内部组件
    "ProjectQueryService",
    "ProjectResponseBuilder",
    "ProjectStateManager",
]
