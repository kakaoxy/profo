"""小区管理路由.

处理小区查询、搜索和合并操作.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentAdminUserDep, CurrentOperatorUserDep, DbSessionDep
from dependencies.common import PaginationDep
from schemas.community import (
    CommunityCreateRequest,
    CommunityListResponse,
    CommunityMergeRequest,
    CommunityMergeResponse,
    CommunityResponse,
    DictionaryResponse,
)
from services.market import CommunityMerger, get_community_service
from services.market.community_service import CommunityQueryService
from services.system.exceptions import ServiceException, ValidationError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["communities"])

CommunityServiceDep = Annotated[CommunityQueryService, Depends(get_community_service)]


@router.get("/communities")
def get_communities(
    db: DbSessionDep,
    _current_user: CurrentOperatorUserDep,
    pagination: PaginationDep,
    service: CommunityServiceDep,
    search: Annotated[str | None, Query(description="小区名称搜索（模糊匹配）")] = None,
) -> CommunityListResponse:
    """查询小区列表."""
    return service.query_communities(
        db=db,
        search=search,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get(
    "/dictionaries",
    responses={400: {"description": "不支持的字典类型参数"}},
)
def get_dictionaries(
    db: DbSessionDep,
    _current_user: CurrentOperatorUserDep,
    service: CommunityServiceDep,
    dict_type: Annotated[str, Query(description="字典类型: district | business_circle")],
    search: Annotated[str | None, Query(description="模糊搜索关键词")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="返回数量上限")] = 50,
) -> DictionaryResponse:
    """返回行政区或商圈的去重列表."""
    try:
        return service.query_dictionaries(db=db, dict_type=dict_type, search=search, limit=limit)
    except ValueError as e:
        raise ValidationError(str(e)) from e


@router.post("/communities/merge")
@limiter.limit(RateLimits.COMMUNITY_MERGE)
def merge_communities(
    request: Request,
    merge_request: CommunityMergeRequest,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> CommunityMergeResponse:
    """合并小区操作.

    参数:
        request: FastAPI HTTP 请求对象（用于速率限制）
        merge_request: 小区合并请求体，包含主小区 ID 和待合并小区 ID 列表
        db: 数据库会话
        current_user: 当前登录的管理员用户

    速率限制：20次/小时
    """
    logger.info(
        "收到小区合并请求: primary_id=%s, merge_ids=%s",
        merge_request.primary_id,
        merge_request.merge_ids,
    )

    merger = CommunityMerger()

    try:
        result = merger.merge_communities(
            primary_id=merge_request.primary_id,
            merge_ids=merge_request.merge_ids,
            db=db,
        )

        if not result.success:
            raise ValueError(result.message)  # noqa: TRY301

        logger.info("小区合并成功: %s", result.message)
        return CommunityMergeResponse(
            success=True,
            affected_properties=result.affected_properties,
            message=result.message,
        )

    except ValueError as e:
        logger.warning("小区合并业务验证失败: %s", e)
        raise ValidationError(str(e)) from e
    except Exception:
        logger.exception("小区合并发生未知错误")
        raise ServiceException("合并操作失败，请联系管理员")


@router.post("/communities")
@limiter.limit(RateLimits.COMMUNITY_CREATE)
def create_community(
    request: Request,
    body: CommunityCreateRequest,
    db: DbSessionDep,
    _current_user: CurrentOperatorUserDep,
    service: CommunityServiceDep,
) -> CommunityResponse:
    """创建新小区.

    速率限制：100次/小时
    """
    return service.create_community(db, body)
