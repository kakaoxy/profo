"""区域伙伴招募计划路由模块."""

from .admin import router as admin_recruit_router
from .public import router as public_recruit_router

__all__ = [
    "admin_recruit_router",
    "public_recruit_router",
]
