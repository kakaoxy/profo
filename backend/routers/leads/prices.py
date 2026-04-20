"""
线索价格历史路由
"""
from typing import Annotated

from fastapi import APIRouter, Path

from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from schemas.lead import PriceHistoryCreate, PriceHistoryResponse
from services.leads import LeadPriceService

router = APIRouter()


@router.get("/{lead_id}/prices", response_model=list[PriceHistoryResponse])
def get_price_history(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
):
    """获取线索价格历史记录"""
    service = LeadPriceService(db)
    return service.get_price_history(lead_id)


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
    service = LeadPriceService(db)
    return service.add_price_record(
        lead_id=lead_id,
        price=price_in.price,
        remark=price_in.remark,
        created_by_id=current_user.id,
    )
