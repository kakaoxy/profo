"""获客中心聚合只读服务层.

跨 4 条分享获客链路（估价/房源预约/房源单/招募）的统一总览、漏斗、
员工排行与统一线索查询。不修改任何业务线写路径与表结构。
"""

from services.growth_center.employees import GrowthEmployeeService
from services.growth_center.funnel import GrowthFunnelService
from services.growth_center.lead_detail import GrowthLeadDetailService
from services.growth_center.leads import GrowthLeadService
from services.growth_center.overview import GrowthOverviewService

__all__ = [
    "GrowthEmployeeService",
    "GrowthFunnelService",
    "GrowthLeadDetailService",
    "GrowthLeadService",
    "GrowthOverviewService",
]
