"""C端公开小区搜索路由."""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from utils.common import RateLimits, limiter
from dependencies.auth import DbSessionDep
from models import Community
from schemas.public import PublicCommunitySearchItem
from utils.formatters import escape_like

router = APIRouter(prefix="/public/communities", tags=["public-communities"])


@router.get(
    "/search",
    summary="搜索小区",
    description="根据关键词搜索小区，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_COMMUNITY_SEARCH)
def search_communities(
    request: Request,
    db: DbSessionDep,
    q: Annotated[str, Query(min_length=1, description="搜索关键词")],
    limit: Annotated[int, Query(ge=1, le=100, description="返回条数限制")] = 20,
) -> list[PublicCommunitySearchItem]:
    """根据关键词搜索小区."""
    query = (
        db.query(Community)
        .filter(
            Community.is_active.is_(True),
            Community.name.like(f"%{escape_like(q)}%"),
        )
        .order_by(Community.name)
        .limit(limit)
    )

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
