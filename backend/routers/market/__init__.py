"""市场情报模块路由.

对应原L1层：小区管理、房源查询等功能.
"""

from .communities import router as communities_router
from .properties import router as properties_router

__all__ = [
    "communities_router",
    "properties_router",
]
