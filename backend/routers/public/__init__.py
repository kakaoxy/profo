"""
C端公开路由模块
"""
from .auth import router as public_auth_router
from .projects import router as public_projects_router
from .leads import router as public_leads_router
from .communities import router as public_communities_router

__all__ = [
    "public_auth_router",
    "public_projects_router",
    "public_leads_router",
    "public_communities_router",
]
