"""
监控模块路由
包含：市场监控、竞品分析等功能
"""
from .monitor import router as monitor_router

__all__ = [
    "monitor_router",
]
