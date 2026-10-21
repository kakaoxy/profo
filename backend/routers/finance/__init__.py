"""财务管理路由模块."""

from .accounts import router as accounts_router
from .ledger import router as ledger_router
from .subjects import router as subjects_router

__all__ = ["accounts_router", "ledger_router", "subjects_router"]
