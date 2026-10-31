"""商户管理路由（后台 admin + 小程序员工侧 public）."""

from .admin import router as merchant_admin_router
from .public import router as merchant_public_router

__all__ = ["merchant_admin_router", "merchant_public_router"]
