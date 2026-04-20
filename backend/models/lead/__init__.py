"""
线索管理模块
包含线索、跟进记录和价格历史
"""

from .lead import Lead, LeadFollowUp, LeadPriceHistory

__all__ = ['Lead', 'LeadFollowUp', 'LeadPriceHistory']
