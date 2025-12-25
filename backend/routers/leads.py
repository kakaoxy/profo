"""
Leads API Router
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
import uuid

from db import get_db
from dependencies.auth import get_current_user as get_current_user_dep
from models import User, Lead, LeadFollowUp, LeadPriceHistory, LeadStatus, FollowUpMethod
from schemas.lead import (
    LeadCreate, LeadUpdate, LeadResponse, PaginatedLeadResponse,
    FollowUpCreate, FollowUpResponse,
    PriceHistoryCreate, PriceHistoryResponse
)

router = APIRouter(
    prefix="/leads",
    tags=["Leads Management"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=PaginatedLeadResponse)
def get_leads(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    statuses: Optional[List[LeadStatus]] = Query(None),
    district: Optional[str] = None,
    creator_id: Optional[int] = None,
    layout: Optional[str] = None, # Simple text match for now
    floor: Optional[str] = None, # Simple text match
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    query = db.query(Lead)
    
    if search:
        query = query.filter(Lead.community_name.contains(search))
    if statuses:
        query = query.filter(Lead.status.in_(statuses))
    if district:
        query = query.filter(Lead.district.contains(district))
    if creator_id:
        query = query.filter(Lead.creator_id == creator_id)
    if layout:
        # e.g. "2" matches "2室..."
        query = query.filter(Lead.layout.contains(layout))
    if floor:
        # e.g. "低"
        query = query.filter(Lead.floor_info.contains(floor))
        
    total = query.count()
    items = query.order_by(desc(Lead.created_at)).offset((page - 1) * page_size).limit(page_size).all()
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    }

@router.post("/", response_model=LeadResponse)
def create_lead(
    lead_in: LeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    # Determine creator name helper logic if needed, but for now just ID
    db_lead = Lead(
        **lead_in.model_dump(),
        id=str(uuid.uuid4()), 
        creator_id=current_user.id
    )
    # Manually ensure unique ID generation if SQLAlchemy generic default doesn't kick in immediately 
    # (It does if defined in model `default=`)
    
    # Handle initial price history? 
    # If total_price is provided, we should probably record it in history too?
    # User requirement: record EVERY authorization.
    
    db.add(db_lead)
    db.commit()
    db.refresh(db_lead)
    
    if lead_in.total_price:
       # Auto-record initial price history
       price_rec = LeadPriceHistory(
           id=str(uuid.uuid4()),
           lead_id=db_lead.id,
           price=lead_in.total_price,
           remark="Initial Creation",
           created_by_id=current_user.id
       )
       db.add(price_rec)
       db.commit()
    
    return db_lead

@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead

@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: str,
    lead_in: LeadUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    update_data = lead_in.model_dump(exclude_unset=True)
    
    # Special handling for price update to record history
    new_price = update_data.get("total_price")
    if new_price is not None and new_price != float(lead.total_price or 0):
        # Create history record
        price_rec = LeadPriceHistory(
            id=str(uuid.uuid4()),
            lead_id=lead.id,
            price=new_price,
            remark=update_data.get("remarks") or "Update Price", # Ideally separate field
            created_by_id=current_user.id
        )
        db.add(price_rec)
    
    # Special handling for Audit using specific logic if generic update isn't enough?
    # For now generic update is fine.
    
    for field, value in update_data.items():
        setattr(lead, field, value)
    
    if "status" in update_data:
        # If auditing
        if update_data["status"] in [LeadStatus.PENDING_VISIT, LeadStatus.REJECTED]:
             # Implicitly being audited
             pass # Logic handles by frontend passing audit_time/auditor_id or we do it here?
             # Let's auto-fill auditor if status changed to 'audited' states?
             # For simplicity, rely on explicit update for now or add lightweight logic:
             pass

    lead.updated_at = datetime.now()
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead

@router.post("/{lead_id}/follow-ups", response_model=FollowUpResponse)
def add_follow_up(
    lead_id: str,
    follow_up_in: FollowUpCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
        
    db_follow = LeadFollowUp(
        **follow_up_in.model_dump(),
        id=str(uuid.uuid4()),
        lead_id=lead_id,
        created_by_id=current_user.id
    )
    db.add(db_follow)
    
    # Auto-update lead's last_follow_up_at
    lead.last_follow_up_at = datetime.now()
    db.add(lead)
    
    db.commit()
    db.refresh(db_follow)
    return db_follow

@router.get("/{lead_id}/prices", response_model=List[PriceHistoryResponse])
def get_price_history(
    lead_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    history = db.query(LeadPriceHistory)\
        .filter(LeadPriceHistory.lead_id == lead_id)\
        .order_by(desc(LeadPriceHistory.recorded_at))\
        .all()
    return history

@router.post("/{lead_id}/prices", response_model=PriceHistoryResponse)
def add_price_record(
    lead_id: str,
    price_in: PriceHistoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_dep)
):
    """
    Explicitly add a price record (e.g. secondary authorization)
    This also updates the main lead's total_price
    """
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    
    # Create record
    rec = LeadPriceHistory(
        id=str(uuid.uuid4()),
        lead_id=lead_id,
        price=price_in.price,
        remark=price_in.remark,
        created_by_id=current_user.id
    )
    db.add(rec)
    
    # Update current price
    lead.total_price = price_in.price
    db.add(lead)
    
    db.commit()
    db.refresh(rec)
    return rec
