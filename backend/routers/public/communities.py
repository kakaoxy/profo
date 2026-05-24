"""
C端公开小区搜索路由
"""
from typing import Optional, List

from fastapi import APIRouter, Query, Request

from dependencies.auth import DbSessionDep
from models import Community
from utils.formatters import escape_like
from common import limiter
from schemas.public import PublicCommunitySearchItem

router = APIRouter(prefix="/public/communities", tags=["public-communities"])


@router.get(
    "/search",
    response_model=List[PublicCommunitySearchItem],
    summary="搜索小区",
    description="根据关键词搜索小区，无需登录",
)
@limiter.limit("60/minute")
def search_communities(
    request: Request,
    db: DbSessionDep,
    q: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(20, ge=1, le=100, description="返回条数限制"),
):
    """根据关键词搜索小区"""
    query = db.query(Community).filter(
        Community.is_active.is_(True),
        Community.name.like(f"%{escape_like(q)}%"),
    ).order_by(Community.name).limit(limit)

    communities = query.all()

    return [
        PublicCommunitySearchItem(
            id=c.id,
            name=c.name,
            district=c.district,
            business_circle=c.business_circle,
        )
        for c in communities
    ]
