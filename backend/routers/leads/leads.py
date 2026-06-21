"""线索管理路由主模块.

整合核心 CRUD、跟进记录、价格历史等子路由.
"""

from fastapi import APIRouter

from .core import router as core_router
from .followups import router as followups_router
from .prices import router as prices_router

router = APIRouter(
    tags=["leads"],
    responses={404: {"description": "Not found"}},
)

router.include_router(core_router, prefix="/leads")
router.include_router(followups_router, prefix="/leads", tags=["lead-followups"])
router.include_router(prices_router, prefix="/leads", tags=["lead-prices"])
