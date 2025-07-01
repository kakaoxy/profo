"""
中介公司管理API端点
"""
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.agency import Agency
from app.models.user import User
from app.schemas.agency import AgencyCreate, AgencyUpdate, AgencyResponse

router = APIRouter()


@router.get("/", response_model=List[AgencyResponse])
def get_agencies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取中介公司列表"""
    agencies = db.query(Agency).all()
    return agencies


@router.post("/", response_model=AgencyResponse)
def create_agency(
    agency_data: AgencyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建中介公司"""
    # 检查公司名是否已存在
    existing_agency = db.query(Agency).filter(Agency.name == agency_data.name).first()
    if existing_agency:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="中介公司名已存在"
        )
    
    agency = Agency(**agency_data.dict())
    db.add(agency)
    db.commit()
    db.refresh(agency)
    return agency


@router.get("/{agency_id}", response_model=AgencyResponse)
def get_agency(
    agency_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取单个中介公司"""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="中介公司不存在"
        )
    return agency


@router.put("/{agency_id}", response_model=AgencyResponse)
def update_agency(
    agency_id: int,
    agency_data: AgencyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """更新中介公司"""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="中介公司不存在"
        )
    
    # 检查公司名是否已被其他公司使用
    if agency_data.name != agency.name:
        existing_agency = db.query(Agency).filter(Agency.name == agency_data.name).first()
        if existing_agency:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="中介公司名已存在"
            )
    
    for field, value in agency_data.dict(exclude_unset=True).items():
        setattr(agency, field, value)
    
    db.commit()
    db.refresh(agency)
    return agency


@router.delete("/{agency_id}")
def delete_agency(
    agency_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除中介公司"""
    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    if not agency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="中介公司不存在"
        )
    
    db.delete(agency)
    db.commit()
    return {"message": "中介公司删除成功"}
