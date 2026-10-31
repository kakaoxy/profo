"""商户管理路由（后台 admin + 小程序员工侧 public）."""

from .admin import router as merchant_admin_router
from .agreement_admin import router as merchant_agreement_admin_router
from .agreement_public import router as merchant_agreement_public_router
from .map import router as merchant_map_router
from .public import router as merchant_public_router

__all__ = [
    "merchant_admin_router",
    "merchant_agreement_admin_router",
    "merchant_agreement_public_router",
    "merchant_map_router",
    "merchant_public_router",
]
