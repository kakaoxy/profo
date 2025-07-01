"""
城市管理API端点
"""
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.city import City
from app.models.user import User
from app.schemas.city import CityCreate, CityUpdate, CityResponse

router = APIRouter()


@router.get("/", response_model=List[CityResponse])
def get_cities(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取城市列表"""
    cities = db.query(City).all()
    return cities


@router.post("/", response_model=CityResponse)
def create_city(
    city_data: CityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建城市"""
    # 检查城市名是否已存在
    existing_city = db.query(City).filter(City.name == city_data.name).first()
    if existing_city:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="城市名已存在"
        )
    
    city = City(**city_data.dict())
    db.add(city)
    db.commit()
    db.refresh(city)
    return city


@router.get("/{city_id}", response_model=CityResponse)
def get_city(
    city_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取单个城市"""
    city = db.query(City).filter(City.id == city_id).first()
    if not city:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="城市不存在"
        )
    return city


@router.put("/{city_id}", response_model=CityResponse)
def update_city(
    city_id: int,
    city_data: CityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """更新城市"""
    city = db.query(City).filter(City.id == city_id).first()
    if not city:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="城市不存在"
        )
    
    # 检查城市名是否已被其他城市使用
    if city_data.name != city.name:
        existing_city = db.query(City).filter(City.name == city_data.name).first()
        if existing_city:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="城市名已存在"
            )
    
    for field, value in city_data.dict(exclude_unset=True).items():
        setattr(city, field, value)
    
    db.commit()
    db.refresh(city)
    return city


@router.delete("/{city_id}")
def delete_city(
    city_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除城市"""
    city = db.query(City).filter(City.id == city_id).first()
    if not city:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="城市不存在"
        )
    
    db.delete(city)
    db.commit()
    return {"message": "城市删除成功"}
