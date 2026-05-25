"""业务逻辑服务模块.

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
# Leads 模块
from .leads import (
    LeadFollowUpService,
    LeadPriceService,
    LeadService,
)
from .market import (
    CommunityMerger,
    CSVBatchImporter,
    FloorInfo,
    FloorParser,
    MergeResult,
    PropertyImporter,
    PropertyQueryService,
    get_property_query_service,
)

# Marketing 模块
from .marketing import (
    MarketingImportService,
    MarketingMediaService,
    MarketingProjectService,
    MarketingQueryService,
)

# Monitor 模块
from .monitor import MonitorService

# Projects 模块
from .projects import (
    CashFlowService,
    FinanceService,
    ProjectCoreService,
    ProjectFinanceService,
    ProjectQueryService,
    ProjectRenovationService,
    ProjectResponseBuilder,
    ProjectSalesService,
    ProjectService,
    ProjectStateManager,
    RenovationService,
    SalesService,
)

# System 模块
from .system import (
    AuthService,
    RoleService,
    UserService,
    role_service,
    save_failed_record,
    user_service,
)

__all__ = [
    # System
    "AuthService",
    "CSVBatchImporter",
    "CashFlowService",
    "CommunityMerger",
    "FinanceService",
    "FloorInfo",
    "FloorParser",
    "LeadFollowUpService",
    "LeadPriceService",
    # Leads
    "LeadService",
    "MarketingImportService",
    "MarketingMediaService",
    # Marketing
    "MarketingProjectService",
    "MarketingQueryService",
    "MergeResult",
    # Monitor
    "MonitorService",
    "ProjectCoreService",
    "ProjectFinanceService",
    "ProjectQueryService",
    "ProjectRenovationService",
    "ProjectResponseBuilder",
    "ProjectSalesService",
    # Projects
    "ProjectService",
    "ProjectStateManager",
    "PropertyImporter",
    # Market
    "PropertyQueryService",
    "RenovationService",
    "RoleService",
    "SalesService",
    "UserService",
    "get_property_query_service",
    "role_service",
    "save_failed_record",
    "user_service",
]
