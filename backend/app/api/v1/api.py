"""
API v1 路由配置
"""
from fastapi import APIRouter

from app.api.v1.endpoints import (
    auth,
    cities,
    agencies,
    agents,
    communities,
    properties,
    my_viewings,
    dashboard,
    data_import,
    stats
)

api_router = APIRouter()

# 认证相关路由
api_router.include_router(auth.router, prefix="/auth", tags=["认证"])

# 基础数据管理路由
api_router.include_router(cities.router, prefix="/cities", tags=["城市管理"])
api_router.include_router(agencies.router, prefix="/agencies", tags=["中介公司管理"])
api_router.include_router(agents.router, prefix="/agents", tags=["经纪人管理"])
api_router.include_router(communities.router, prefix="/communities", tags=["小区管理"])

# 核心功能路由
api_router.include_router(properties.router, prefix="/properties", tags=["房源管理"])
api_router.include_router(my_viewings.router, prefix="/my-viewings", tags=["个人看房管理"])

# 数据看板路由
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["数据看板"])

# 数据导入路由
api_router.include_router(data_import.router, prefix="/data-import", tags=["数据导入"])

# 统计数据路由
api_router.include_router(stats.router, prefix="/stats", tags=["统计数据管理"])
