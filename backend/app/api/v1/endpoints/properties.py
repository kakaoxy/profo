"""
房源管理API端点
"""
from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from app.api.deps import get_db, get_current_user
from app.models.property import Property
from app.models.community import Community
from app.models.user import User
from app.schemas.property import PropertyCreate, PropertyUpdate, PropertyResponse, PropertyFilter

router = APIRouter()


@router.get("/", response_model=List[PropertyResponse])
def get_properties(
    community_name: Optional[str] = Query(None, description="小区名称模糊搜索"),
    status: Optional[str] = Query(None, description="房源状态筛选"),
    min_price: Optional[float] = Query(None, description="最低价格(万元)"),
    max_price: Optional[float] = Query(None, description="最高价格(万元)"),
    min_area: Optional[float] = Query(None, description="最小面积(平方米)"),
    max_area: Optional[float] = Query(None, description="最大面积(平方米)"),
    bedrooms: Optional[int] = Query(None, description="卧室数量"),
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取房源列表（支持筛选和分页）"""
    query = db.query(Property)
    
    # 如果有小区名称筛选，需要关联查询
    if community_name:
        query = query.join(Community).filter(
            Community.name.contains(community_name)
        )
    
    # 状态筛选
    if status:
        query = query.filter(Property.status == status)
    
    # 价格区间筛选
    if min_price is not None:
        query = query.filter(Property.listing_price_wan >= min_price)
    if max_price is not None:
        query = query.filter(Property.listing_price_wan <= max_price)
    
    # 面积区间筛选
    if min_area is not None:
        query = query.filter(Property.area_sqm >= min_area)
    if max_area is not None:
        query = query.filter(Property.area_sqm <= max_area)
    
    # 卧室数量筛选
    if bedrooms is not None:
        query = query.filter(Property.layout_bedrooms == bedrooms)
    
    # 按更新时间倒序排列
    query = query.order_by(Property.updated_at.desc())
    
    # 分页
    offset = (page - 1) * limit
    properties = query.offset(offset).limit(limit).all()
    
    return properties


@router.post("/", response_model=PropertyResponse)
def create_property(
    property_data: PropertyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建房源"""
    # 验证小区是否存在
    community = db.query(Community).filter(Community.id == property_data.community_id).first()
    if not community:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="指定的小区不存在"
        )
    
    property_obj = Property(**property_data.dict())
    db.add(property_obj)
    db.commit()
    db.refresh(property_obj)
    return property_obj


@router.get("/{property_id}", response_model=PropertyResponse)
def get_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取单个房源详情"""
    property_obj = db.query(Property).filter(Property.id == property_id).first()
    if not property_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="房源不存在"
        )
    return property_obj


@router.put("/{property_id}", response_model=PropertyResponse)
def update_property(
    property_id: int,
    property_data: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """更新房源"""
    property_obj = db.query(Property).filter(Property.id == property_id).first()
    if not property_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="房源不存在"
        )
    
    # 如果更新小区ID，验证小区是否存在
    if property_data.community_id and property_data.community_id != property_obj.community_id:
        community = db.query(Community).filter(Community.id == property_data.community_id).first()
        if not community:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="指定的小区不存在"
            )
    
    # 更新字段
    for field, value in property_data.dict(exclude_unset=True).items():
        setattr(property_obj, field, value)
    
    # 更新时间会自动更新
    from datetime import datetime
    property_obj.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(property_obj)
    return property_obj


@router.delete("/{property_id}")
def delete_property(
    property_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除房源"""
    property_obj = db.query(Property).filter(Property.id == property_id).first()
    if not property_obj:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="房源不存在"
        )
    
    db.delete(property_obj)
    db.commit()
    return {"message": "房源删除成功"}


@router.get("/stats/summary")
def get_property_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取房源统计摘要"""
    total_count = db.query(Property).count()
    on_sale_count = db.query(Property).filter(Property.status == "在售").count()
    sold_count = db.query(Property).filter(Property.status == "已成交").count()
    personal_count = db.query(Property).filter(Property.status == "个人记录").count()
    
    return {
        "total_count": total_count,
        "on_sale_count": on_sale_count,
        "sold_count": sold_count,
        "personal_count": personal_count
    }
