"""项目财务服务（组合各 Mixin）.

通过 Mixin 模式将财务服务拆分为多个职责模块：
- _FinanceServiceBase: 基础设施（db 会话、共享校验/缓存方法）
- _RecordMixin: 现金流记录 CRUD
- _SummaryMixin: 现金流汇总与财务报告
- _LedgerMixin: 资金账本列表/统计/导出
- _StatisticsMixin: 统计页面聚合
- _SettlementMixin: 结算/反结算/操作日志
- _ReceivablePayableMixin: 应收应付参考表聚合
- _SubjectMixin: 科目管理 CRUD（FinanceSubject）
"""

from .base import _FinanceServiceBase
from .ledger import _LedgerMixin
from .receivable_payable import _ReceivablePayableMixin
from .records import _RecordMixin
from .settlement import _SettlementMixin
from .statistics import _StatisticsMixin
from .subjects import _SubjectMixin
from .summary import _SummaryMixin


class FinanceService(
    _FinanceServiceBase,
    _RecordMixin,
    _SummaryMixin,
    _LedgerMixin,
    _StatisticsMixin,
    _SettlementMixin,
    _ReceivablePayableMixin,
    _SubjectMixin,
):
    """项目财务服务（Facade 聚合各 Mixin）."""


# 向后兼容别名，待调用方迁移后删除
CashFlowService = FinanceService
