"""小区管理路由.

处理小区查询、搜索和合并操作.
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from common import RateLimits, limiter
from dependencies.auth import CurrentAdminUserDep, CurrentOperatorUserDep, DbSessionDep
from models.property import Community
from schemas.community import (
    CommunityCreateRequest,
    CommunityListResponse,
    CommunityMergeRequest,
    CommunityMergeResponse,
    CommunityResponse,
    DictionaryResponse,
)
from services.market import CommunityMerger
from services.market.community_service import (
    CommunityQueryService,
    _find_existing_community_by_name,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["L1-小区管理"])

service = CommunityQueryService()


@router.get("/communities")
def get_communities(
    db: DbSessionDep,
    _current_user: CurrentOperatorUserDep,
    search: Annotated[str | None, Query(description="小区名称搜索（模糊匹配）")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
) -> CommunityListResponse:
    """查询小区列表."""
    return service.query_communities(
        db=db,
        search=search,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/dictionaries",
    responses={400: {"description": "不支持的字典类型参数"}},
)
def get_dictionaries(
    db: DbSessionDep,
    _current_user: CurrentOperatorUserDep,
    dict_type: Annotated[str, Query(description="字典类型: district | business_circle")],
    search: Annotated[str | None, Query(description="模糊搜索关键词")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="返回数量上限")] = 50,
) -> DictionaryResponse:
    """返回行政区或商圈的去重列表."""
    try:
        return service.query_dictionaries(db=db, dict_type=dict_type, search=search, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


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
        raise HTTPException(status_code=400, detail=str(e)) from e
    except SQLAlchemyError:
        logger.exception("小区合并发生数据库错误")
        raise HTTPException(status_code=500, detail="合并操作失败，请联系管理员") from None
    except Exception:
        logger.exception("小区合并发生未知错误")
        raise HTTPException(status_code=500, detail="合并操作失败，请联系管理员") from None


@router.post("/communities")
@limiter.limit(RateLimits.COMMUNITY_CREATE)
def create_community(
    request: Request,
    body: CommunityCreateRequest,
    db: DbSessionDep,
    _current_user: CurrentOperatorUserDep,
) -> CommunityResponse:
    """创建新小区.

    速率限制：100次/小时
    """
    existing = _find_existing_community_by_name(db, body.name)

    if existing:
        logger.info("小区已存在，直接返回: %s (ID: %s)", existing.name, existing.id)
        return CommunityResponse.model_validate(existing)

    new_community = Community(
        id=str(uuid.uuid4()),
        name=body.name.strip(),
        district=body.district,
        business_circle=body.business_circle,
        city_id=None,
        avg_price_wan=None,
        total_properties=0,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )

    db.add(new_community)

    try:
        db.commit()
        db.refresh(new_community)
        logger.info("创建新小区成功: %s (ID: %s)", new_community.name, new_community.id)
    except IntegrityError as e:
        db.rollback()
        logger.warning("创建小区时发生唯一约束冲突: %s, 错误: %s", body.name, e)
        existing = _find_existing_community_by_name(db, body.name)
        if existing:
            return CommunityResponse.model_validate(existing)
        raise HTTPException(status_code=500, detail="创建小区失败") from e
    except SQLAlchemyError:
        db.rollback()
        logger.exception("创建小区发生数据库错误")
        raise HTTPException(status_code=500, detail="创建小区失败") from None
    except Exception:
        db.rollback()
        logger.exception("创建小区发生未知错误")
        raise HTTPException(status_code=500, detail="创建小区失败") from None

    return CommunityResponse.model_validate(new_community)
