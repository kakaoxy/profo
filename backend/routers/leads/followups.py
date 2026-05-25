"""线索跟进记录路由."""

from typing import Annotated

from fastapi import APIRouter, Path

from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from schemas.lead import FollowUpCreate, FollowUpResponse
from services.leads import LeadFollowUpService

router = APIRouter()


@router.post("/{lead_id}/follow-ups")
def add_follow_up(
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    follow_up_in: FollowUpCreate,
) -> FollowUpResponse:
    """添加跟进记录."""
    service = LeadFollowUpService(db)
    return service.create_follow_up(
        lead_id=lead_id,
        method=follow_up_in.method,
        content=follow_up_in.content,
        created_by_id=_current_user.id,
    )


@router.get("/{lead_id}/follow-ups")
def get_follow_ups(
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
) -> list[FollowUpResponse]:
    """获取线索的跟进记录列表."""
    service = LeadFollowUpService(db)
    return service.get_follow_ups(lead_id)
