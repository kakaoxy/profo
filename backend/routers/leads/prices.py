"""
线索价格历史路由
"""
from typing import Annotated
import uuid

from fastapi import APIRouter, Path, HTTPException
from sqlalchemy import desc

from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from models import Lead, LeadPriceHistory
from schemas.lead import PriceHistoryCreate, PriceHistoryResponse

router = APIRouter()


@router.get("/{lead_id}/prices", response_model=list[PriceHistoryResponse])
def get_price_history(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
):
    """获取线索价格历史记录"""
    history = (
        db.query(LeadPriceHistory)
        .filter(LeadPriceHistory.lead_id == lead_id)
        .order_by(desc(LeadPriceHistory.recorded_at))
        .all()
    )
    return history


@router.post("/{lead_id}/prices", response_model=PriceHistoryResponse)
def add_price_record(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    price_in: PriceHistoryCreate,
):
    """
    添加价格记录（如二次授权）
    同时更新线索的当前总价
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # 创建价格记录
    rec = LeadPriceHistory(
        id=str(uuid.uuid4()),
        lead_id=lead_id,
        price=price_in.price,
        remark=price_in.remark,
        created_by_id=current_user.id,
    )
    db.add(rec)

    # 更新当前价格
    lead.total_price = price_in.price
    db.add(lead)

    db.commit()
    db.refresh(rec)
    return rec
