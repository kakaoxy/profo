"""项目财务服务包.

导出 FinanceService 和 CashFlowService（向后兼容别名）。
"""

from .service import CashFlowService, FinanceService

__all__ = ["CashFlowService", "FinanceService"]
