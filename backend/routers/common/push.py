"""JSON 推送 API 路由.

处理 JSON 数组的批量房源数据推送.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Request
from fastapi.concurrency import run_in_threadpool

from dependencies.auth import DbSessionDep, require_api_key
from models import User
from schemas import PropertyIngestionModel, PushResult
from services.market.json_batch_importer import JSONBatchImporter
from services.system.exceptions import BusinessLogicError, ValidationError
from utils.common import RateLimits, limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/push", tags=["push"])

_MAX_PUSH_RECORDS = 10000


@router.post("")
@limiter.limit(RateLimits.PUSH_API)
async def push_properties(
    request: Request,
    properties: Annotated[list[PropertyIngestionModel], Body()],
    db: DbSessionDep,
    current_user: Annotated[User, Depends(require_api_key)],
) -> PushResult:
    """JSON 数据推送接口.

    接收 JSON 数组，批量导入房源数据。
    **需要通过 X-API-Key Header 进行认证。**

    Args:
        request: FastAPI 请求对象（速率限制所需）
        properties: 房源数据列表（Pydantic 模型校验后的数据）
        db: 数据库会话
        current_user: 当前认证用户（通过 API Key）

    Returns:
        PushResult: 推送结果统计

    Raises:
        HTTPException: 401 Unauthorized - API Key 无效或缺失
        HTTPException: 数据验证失败或处理失败

    """
    if not properties:
        msg = "请求体不能为空"
        raise ValidationError(msg)

    if len(properties) > _MAX_PUSH_RECORDS:
        msg = "单次推送最多支持 10000 条记录"
        raise ValidationError(msg)

    logger.info("接收到 JSON 推送请求，包含 %d 条记录", len(properties))

    # 转换为 dict 列表传给 importer（importer 内部仍会构造模型，双重校验无害）
    properties_data = [p.model_dump(by_alias=True, exclude_unset=True) for p in properties]

    try:
        importer = JSONBatchImporter()
        return await run_in_threadpool(
            importer.batch_import_json,
            properties_data,
            db,
            current_user.id,
        )

    except Exception as e:
        logger.exception("JSON 推送处理失败")
        msg = "推送处理失败，请稍后重试"
        raise BusinessLogicError(msg) from e
