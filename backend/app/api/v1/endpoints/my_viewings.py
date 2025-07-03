"""
个人看房笔记API端点
"""
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.my_viewing import MyViewing
from app.models.property import Property
from app.models.agent import Agent
from app.models.user import User
from app.schemas.my_viewing import MyViewingCreate, MyViewingUpdate, MyViewingResponse

router = APIRouter()


@router.get("/", response_model=List[MyViewingResponse])
def get_my_viewings(
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取当前用户的看房笔记列表"""
    offset = (page - 1) * limit
    viewings = db.query(MyViewing).filter(
        MyViewing.user_id == current_user.id
    ).order_by(
        MyViewing.viewing_date.desc()
    ).offset(offset).limit(limit).all()
    
    return viewings


@router.post("/", response_model=MyViewingResponse)
def create_my_viewing(
    viewing_data: MyViewingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建看房笔记"""
    # 验证房源是否存在
    property_obj = db.query(Property).filter(Property.id == viewing_data.property_id).first()
    if not property_obj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="指定的房源不存在"
        )
    
    # 验证经纪人是否存在（如果提供了经纪人ID）
    if viewing_data.agent_id:
        agent = db.query(Agent).filter(Agent.id == viewing_data.agent_id).first()
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="指定的经纪人不存在"
            )
    
    viewing = MyViewing(
        user_id=current_user.id,
        **viewing_data.dict()
    )
    db.add(viewing)
    db.commit()
    db.refresh(viewing)
    return viewing


@router.get("/{viewing_id}", response_model=MyViewingResponse)
def get_my_viewing(
    viewing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取单个看房笔记详情"""
    viewing = db.query(MyViewing).filter(
        MyViewing.id == viewing_id,
        MyViewing.user_id == current_user.id
    ).first()
    
    if not viewing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="看房笔记不存在"
        )
    return viewing


@router.put("/{viewing_id}", response_model=MyViewingResponse)
def update_my_viewing(
    viewing_id: int,
    viewing_data: MyViewingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """更新看房笔记"""
    viewing = db.query(MyViewing).filter(
        MyViewing.id == viewing_id,
        MyViewing.user_id == current_user.id
    ).first()
    
    if not viewing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="看房笔记不存在"
        )
    
    # 如果更新房源ID，验证房源是否存在
    if viewing_data.property_id and viewing_data.property_id != viewing.property_id:
        property_obj = db.query(Property).filter(Property.id == viewing_data.property_id).first()
        if not property_obj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="指定的房源不存在"
            )
    
    # 如果更新经纪人ID，验证经纪人是否存在
    if viewing_data.agent_id and viewing_data.agent_id != viewing.agent_id:
        agent = db.query(Agent).filter(Agent.id == viewing_data.agent_id).first()
        if not agent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="指定的经纪人不存在"
            )
    
    # 更新字段
    for field, value in viewing_data.dict(exclude_unset=True).items():
        setattr(viewing, field, value)
    
    # 更新时间会自动更新
    from datetime import datetime
    viewing.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(viewing)
    return viewing


@router.delete("/{viewing_id}")
def delete_my_viewing(
    viewing_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除看房笔记"""
    viewing = db.query(MyViewing).filter(
        MyViewing.id == viewing_id,
        MyViewing.user_id == current_user.id
    ).first()
    
    if not viewing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="看房笔记不存在"
        )
    
    db.delete(viewing)
    db.commit()
    return {"message": "看房笔记删除成功"}


@router.get("/stats/summary")
def get_viewing_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取当前用户的看房统计摘要"""
    total_count = db.query(MyViewing).filter(MyViewing.user_id == current_user.id).count()
    
    # 按评分统计
    rating_stats = {}
    for rating in range(1, 6):
        count = db.query(MyViewing).filter(
            MyViewing.user_id == current_user.id,
            MyViewing.rating == rating
        ).count()
        rating_stats[f"rating_{rating}"] = count
    
    return {
        "total_count": total_count,
        **rating_stats
    }
