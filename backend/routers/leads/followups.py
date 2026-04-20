"""
线索跟进记录路由
"""
from datetime import datetime
from typing import Annotated
import uuid

from fastapi import APIRouter, Path, HTTPException
from sqlalchemy import desc

from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from models import Lead, LeadFollowUp
from schemas.lead import FollowUpCreate, FollowUpResponse

router = APIRouter()


@router.post("/{lead_id}/follow-ups", response_model=FollowUpResponse)
def add_follow_up(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    follow_up_in: FollowUpCreate,
):
    """添加跟进记录"""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    db_follow = LeadFollowUp(
        **follow_up_in.model_dump(),
        id=str(uuid.uuid4()),
        lead_id=lead_id,
        created_by_id=current_user.id,
    )
    db.add(db_follow)

    # 自动更新线索的最后跟进时间
    lead.last_follow_up_at = datetime.now()
    db.add(lead)

    db.commit()
    db.refresh(db_follow)
    return db_follow


@router.get("/{lead_id}/follow-ups", response_model=list[FollowUpResponse])
def get_follow_ups(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
):
    """获取线索的跟进记录列表"""
    follow_ups = (
        db.query(LeadFollowUp)
        .filter(LeadFollowUp.lead_id == lead_id)
        .order_by(desc(LeadFollowUp.followed_at))
        .all()
    )
    return follow_ups
