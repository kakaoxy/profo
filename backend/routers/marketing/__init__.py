"""
市场营销模块路由
对应原L4层：营销项目管理、数据导入等功能
"""
from .projects import router as projects_router
from .import_ import router as import_router

__all__ = [
    "projects_router",
    "import_router",
]
