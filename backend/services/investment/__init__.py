"""投资管理（跟投管理）Service 模块.

提供跟投记录 CRUD、投资方与子投资人管理、回报率调整、结算流转、操作日志、Excel 导出。

使用方式:
    from services.investment import InvestmentService
"""

from .core import InvestmentService

__all__ = ["InvestmentService"]
