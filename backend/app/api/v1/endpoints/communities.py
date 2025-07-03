"""
小区管理API端点
"""
from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.community import Community
from app.models.city import City
from app.models.user import User
from app.schemas.community import CommunityCreate, CommunityUpdate, CommunityResponse

router = APIRouter()


@router.get("/", response_model=List[CommunityResponse])
def get_communities(
    city_id: int = Query(None, description="按城市筛选"),
    name: str = Query(None, description="按小区名称模糊搜索"),
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取小区列表"""
    query = db.query(Community)
    
    if city_id:
        query = query.filter(Community.city_id == city_id)
    
    if name:
        query = query.filter(Community.name.contains(name))
    
    offset = (page - 1) * limit
    communities = query.offset(offset).limit(limit).all()
    return communities


@router.post("/", response_model=CommunityResponse)
def create_community(
    community_data: CommunityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建小区"""
    # 验证城市是否存在
    city = db.query(City).filter(City.id == community_data.city_id).first()
    if not city:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="指定的城市不存在"
        )
    
    # 检查同城市下是否已有同名小区
    existing_community = db.query(Community).filter(
        Community.city_id == community_data.city_id,
        Community.name == community_data.name
    ).first()
    if existing_community:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该城市下已存在同名小区"
        )
    
    community = Community(**community_data.dict())
    db.add(community)
    db.commit()
    db.refresh(community)
    return community


@router.get("/{community_id}", response_model=CommunityResponse)
def get_community(
    community_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取单个小区"""
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="小区不存在"
        )
    return community


@router.put("/{community_id}", response_model=CommunityResponse)
def update_community(
    community_id: int,
    community_data: CommunityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """更新小区"""
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="小区不存在"
        )
    
    # 如果更新城市，验证城市是否存在
    if community_data.city_id and community_data.city_id != community.city_id:
        city = db.query(City).filter(City.id == community_data.city_id).first()
        if not city:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="指定的城市不存在"
            )
    
    # 如果更新小区名，检查同城市下是否已有同名小区
    if community_data.name and community_data.name != community.name:
        city_id = community_data.city_id or community.city_id
        existing_community = db.query(Community).filter(
            Community.city_id == city_id,
            Community.name == community_data.name,
            Community.id != community_id
        ).first()
        if existing_community:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="该城市下已存在同名小区"
            )
    
    for field, value in community_data.dict(exclude_unset=True).items():
        setattr(community, field, value)
    
    from datetime import datetime
    community.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(community)
    return community


@router.delete("/{community_id}")
def delete_community(
    community_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除小区"""
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="小区不存在"
        )
    
    db.delete(community)
    db.commit()
    return {"message": "小区删除成功"}


@router.get("/search/by-name")
def search_communities_by_name(
    name: str = Query(..., description="小区名称关键词"),
    city_id: int = Query(None, description="限制在指定城市内搜索"),
    limit: int = Query(10, ge=1, le=50, description="返回数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """按名称搜索小区（用于下拉选择）"""
    query = db.query(Community).filter(Community.name.contains(name))
    
    if city_id:
        query = query.filter(Community.city_id == city_id)
    
    communities = query.limit(limit).all()
    
    return [
        {
            "id": community.id,
            "name": community.name,
            "city_id": community.city_id,
            "district": community.district,
            "business_circle": community.business_circle
        }
        for community in communities
    ]
