"""
线索管理服务模块（原L2）

使用方式:
    from services.leads import LeadService
    from services.leads import LeadFollowUpService, LeadPriceService
"""

from .core import LeadService
from .internal import LeadFollowUpService, LeadPriceService

__all__ = [
    "LeadService",
    "LeadFollowUpService",
    "LeadPriceService",
]
