"""C端公开小区路由.

提供无需登录的小区搜索与户型图查询，供 C端估价表单使用。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from dependencies.auth import DbSessionDep
from schemas.community_image import CommunityImageListResponse
from schemas.public import PublicCommunitySearchItem
from services.market.community_image_service import CommunityImageService
from services.market.community_service import CommunityQueryService
from utils.common import RateLimits, limiter

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
    q: Annotated[str, Query(min_length=1, max_length=100, description="搜索关键词")],
    limit: Annotated[int, Query(ge=1, le=100, description="返回条数限制")] = 20,
) -> list[PublicCommunitySearchItem]:
    """根据关键词搜索小区."""
    return CommunityQueryService.search_public_communities(db=db, keyword=q, limit=limit)


@router.get(
    "/{community_id}/images",
    summary="查询小区户型图",
    description="返回指定小区的户型图列表，无需登录，供 C端估价表单选择户型图",
)
@limiter.limit(RateLimits.PUBLIC_COMMUNITY_SEARCH)
def list_community_images(
    request: Request,
    db: DbSessionDep,
    community_id: Annotated[str, Path(min_length=1, max_length=36, description="小区ID")],
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="每页数量")] = 100,
) -> CommunityImageListResponse:
    """查询小区户型图列表（公开端点）."""
    return CommunityImageService.list_by_community(
        db=db,
        community_id=community_id,
        page=page,
        page_size=page_size,
    )
