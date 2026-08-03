"""项目管理模块路由.

对应原L3层：项目核心、装修管理、销售管理等功能.
"""

from .core import router as core_router

__all__ = [
    "core_router",
]
