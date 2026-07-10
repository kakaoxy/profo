"""投资管理（跟投管理）服务（组合各 Mixin）.

通过 Mixin 模式将跟投服务拆分为多个职责模块：
- _InvestmentServiceBase: 基础设施（db 会话、共享校验/响应构建 helper）
- _RecordMixin: 跟投记录 CRUD/列表/统计/详情/复制
- _InvestorMixin: 投资方 CRUD
- _SettlementMixin: 结算/反结算/收益分配比例调整
- _ExporterMixin: Excel 导出
"""

from .base import _InvestmentServiceBase
from .exporter import _ExporterMixin
from .investors import _InvestorMixin
from .records import _RecordMixin
from .settlement import _SettlementMixin


class InvestmentService(
    _InvestmentServiceBase,
    _RecordMixin,
    _InvestorMixin,
    _SettlementMixin,
    _ExporterMixin,
):
    """跟投管理服务（Facade 聚合各 Mixin）."""
