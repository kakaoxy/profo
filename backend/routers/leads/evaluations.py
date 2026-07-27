"""线索评估历史路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Request

from dependencies.auth import CurrentInternalUserDep, DbSessionDep, LeadReadPermDep
from schemas.lead import LeadEvalHistoryCreate, LeadEvalHistoryResponse
from services.leads import LeadService
from utils.common import RateLimits, limiter

router = APIRouter()


@router.get("/{lead_id}/evaluations")
def get_evaluations(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
) -> list[LeadEvalHistoryResponse]:
    """获取线索评估历史记录."""
    service = LeadService(db)
    return service.eval_service.get_evaluations(lead_id)


@router.post("/{lead_id}/evaluations", status_code=201)
@limiter.limit(RateLimits.LEAD_UPDATE)
def create_evaluation(
    request: Request,
    db: DbSessionDep,
    current_internal_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    eval_in: LeadEvalHistoryCreate,
) -> LeadEvalHistoryResponse:
    """创建评估记录.

    同时更新线索的当前评估价（Lead.eval_price）与 updated_at.
    速率限制：100次/小时（LEAD_UPDATE）.
    """
    service = LeadService(db)
    return service.eval_service.create_evaluation(
        lead_id=lead_id,
        eval_price=eval_in.eval_price,
        remark=eval_in.remark,
        evaluator_id=current_internal_user.id,
    )
