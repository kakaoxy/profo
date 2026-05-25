"""API 路由模块.

按业务领域划分为以下模块：
- market: 市场情报模块（小区、房源）
- leads: 线索管理模块
- projects: 项目管理模块（核心、装修、销售、现金流）
- marketing: 市场营销模块
- system: 系统管理模块（认证、用户、角色）
- common: 通用功能模块（文件、上传、推送）
- monitor: 监控模块.
"""

from .common import files_router
from .leads import leads_router
from .market import communities_router, properties_router
from .projects import (
    cashflow_router,
)
from .projects import (
    core_router as projects_router,
)

__all__ = [
    "cashflow_router",
    "communities_router",
    "files_router",
    "leads_router",
    "projects_router",
    "properties_router",
]
