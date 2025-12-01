"""
API 路由模块
"""
from .projects_simple import router as projects_router
from .cashflow_simple import router as cashflow_router
from .files import router as files_router

__all__ = [
    'projects_router',
    'cashflow_router',
    'files_router',
]