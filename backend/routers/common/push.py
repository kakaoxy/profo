"""JSON 推送 API 路由.

处理 JSON 数组的批量房源数据推送.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends
from fastapi.concurrency import run_in_threadpool

from dependencies.auth import DbSessionDep, require_api_key
from models import User
from schemas import PushResult
from services.market.json_batch_importer import JSONBatchImporter
from services.system.exceptions import BusinessLogicError, ValidationError

logger = logging.getLogger(__name__)

router = APIRouter()

_MAX_PUSH_RECORDS = 10000


@router.post("")
async def push_properties(
    properties: Annotated[list[dict], Body()],
    db: DbSessionDep,
    current_user: Annotated[User, Depends(require_api_key)],
) -> PushResult:
    """JSON 数据推送接口.

    接收 JSON 数组，批量导入房源数据。
    **需要通过 X-API-Key Header 进行认证。**

    Args:
        properties: 房源数据列表（原始字典）
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

    try:
        importer = JSONBatchImporter()
        return await run_in_threadpool(
            importer.batch_import_json,
            properties,
            db,
            current_user.id,
        )

    except Exception as e:
        logger.exception("JSON 推送处理失败")
        msg = f"推送处理失败: {e!s}"
        raise BusinessLogicError(msg) from e
