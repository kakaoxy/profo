"""
线索管理模块路由
对应原L2层：线索创建、跟进、评估等功能
"""
from .leads import router as leads_router

__all__ = [
    "leads_router",
]
