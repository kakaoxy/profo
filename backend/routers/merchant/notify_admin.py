"""后台商户通知任务路由（前缀 /admin/merchant，V09 REQ-M14-006）."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request

from dependencies.auth import CurrentOperatorUserDep, DbSessionDep
from schemas.merchant.notify import MerchantNotifyRunRecord, MerchantNotifyRunResponse
from services.merchant.tasks import list_runs, run_daily
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/admin/merchant", tags=["merchant-notify"])


@router.post("/notify/run-daily", summary="手动补跑商户通知每日任务")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def run_merchant_notify_daily(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentOperatorUserDep,
) -> MerchantNotifyRunResponse:
    """补跑协议到期 + 拜访超期通知（幂等，重复执行命中去重键）."""
    return run_daily(db, operator_id=str(current_user.id), request=request)


@router.get("/notify/runs", summary="商户通知任务执行记录")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_merchant_notify_runs(
    request: Request,
    db: DbSessionDep,
    _current_user: CurrentOperatorUserDep,
    run_date: Annotated[date | None, Query(alias="date")] = None,
    notify_type: Annotated[Literal["agreement", "visit"] | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> list[MerchantNotifyRunRecord]:
    """按日期/通知类型查询任务统计（admin/operator）."""
    return list_runs(
        db,
        run_date=run_date.isoformat() if run_date else None,
        notify_type=notify_type,
        limit=limit,
    )


__all__ = ["router"]
