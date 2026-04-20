"""
API 路由模块
按业务领域划分为以下模块：
- market: 市场情报模块（小区、房源）
- leads: 线索管理模块
- projects: 项目管理模块（核心、装修、销售、现金流）
- marketing: 市场营销模块
- system: 系统管理模块（认证、用户、角色）
- common: 通用功能模块（文件、上传、推送）
- monitor: 监控模块
"""

# 市场情报模块
from .market import properties_router, communities_router

# 线索管理模块
from .leads import leads_router

# 项目管理模块
from .projects import (
    core_router as projects_router,
    cashflow_router,
)

# 通用功能模块
from .common import files_router

__all__ = [
    # 项目相关
    'projects_router',
    'cashflow_router',
    # 文件管理
    'files_router',
]
