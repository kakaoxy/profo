"""数据报表路由模块.

聚合 market 与 communities 子路由, 由 main.py 注册到 API_V1_PREFIX:
    app.include_router(reports_router, prefix=API_V1_PREFIX)

最终路径:
- /api/v1/reports/market/{kpi,trend,price-distribution,business-districts,dictionaries,compare}
- /api/v1/reports/communities/, /api/v1/reports/communities/{community_id}/analysis
"""

from fastapi import APIRouter

from .communities import communities_router
from .market import market_router

# 聚合 reports_router, tags 留空由各子路由自带 (reports-market / reports-communities)
reports_router = APIRouter(prefix="/reports", tags=[])
reports_router.include_router(market_router)
reports_router.include_router(communities_router)

__all__ = ["reports_router"]
