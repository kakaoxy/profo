"""
市场情报模块路由
对应原L1层：小区管理、房源查询等功能
"""
from .properties import router as properties_router
from .communities import router as communities_router

__all__ = [
    "properties_router",
    "communities_router",
]
