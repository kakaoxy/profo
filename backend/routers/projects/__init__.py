"""项目管理模块路由.

对应原L3层：项目核心、装修管理、销售管理、现金流等功能.
"""

from .cashflow import router as cashflow_router
from .core import router as core_router

__all__ = [
    "cashflow_router",
    "core_router",
]
