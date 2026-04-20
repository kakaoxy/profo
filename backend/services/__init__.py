"""
业务逻辑服务模块

按照业务领域组织的服务层，包含：
- market: 市场情报（原L1）
- leads: 线索管理（原L2）
- projects: 项目管理（原L3）
- marketing: 市场营销（原L4）
- monitor: 市场监控
- system: 系统服务

使用方式:
    from services.market import PropertyQueryService
    from services.projects import ProjectService, FinanceService
    from services.marketing import MarketingProjectService
    from services.system import AuthService, UserService
    from services.monitor import MonitorService
"""

# Market 模块
from .market import (
    PropertyQueryService,
    get_property_query_service,
    PropertyImporter,
    CSVBatchImporter,
    CommunityMerger,
    MergeResult,
    FloorParser,
    FloorInfo,
)

# Projects 模块
from .projects import (
    ProjectService,
    ProjectCoreService,
    RenovationService,
    ProjectRenovationService,
    SalesService,
    ProjectSalesService,
    FinanceService,
    ProjectFinanceService,
    CashFlowService,
    ProjectQueryService,
    ProjectResponseBuilder,
    ProjectStateManager,
)

# Marketing 模块
from .marketing import (
    MarketingProjectService,
    MarketingMediaService,
    MarketingImportService,
    MarketingQueryService,
)

# System 模块
from .system import (
    AuthService,
    UserService,
    user_service,
    RoleService,
    role_service,
    save_failed_record,
)

# Monitor 模块
from .monitor import MonitorService

__all__ = [
    # Market
    "PropertyQueryService",
    "get_property_query_service",
    "PropertyImporter",
    "CSVBatchImporter",
    "CommunityMerger",
    "MergeResult",
    "FloorParser",
    "FloorInfo",
    # Projects
    "ProjectService",
    "ProjectCoreService",
    "RenovationService",
    "ProjectRenovationService",
    "SalesService",
    "ProjectSalesService",
    "FinanceService",
    "ProjectFinanceService",
    "CashFlowService",
    "ProjectQueryService",
    "ProjectResponseBuilder",
    "ProjectStateManager",
    # Marketing
    "MarketingProjectService",
    "MarketingMediaService",
    "MarketingImportService",
    "MarketingQueryService",
    # System
    "AuthService",
    "UserService",
    "user_service",
    "RoleService",
    "role_service",
    "save_failed_record",
    # Monitor
    "MonitorService",
]
