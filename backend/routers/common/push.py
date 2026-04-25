"""
JSON 推送 API 路由
处理 JSON 数组的批量房源数据推送
"""
import logging
from typing import Annotated, List

from fastapi import APIRouter, Body, Depends
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from schemas import PushResult
from exceptions import ValidationException, BusinessLogicException
from dependencies.auth import DbSessionDep, require_api_key
from models import User
from services.market.json_batch_importer import JSONBatchImporter

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("", response_model=PushResult)
async def push_properties(
    properties: Annotated[List[dict], Body()],
    db: Annotated[Session, Depends(DbSessionDep)],
    current_user: Annotated[User, Depends(require_api_key)],
) -> PushResult:
    """
    JSON 数据推送接口

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
        raise ValidationException(
            message="请求体不能为空",
            details={"received": "empty array"}
        )

    if len(properties) > 10000:
        raise ValidationException(
            message="单次推送最多支持 10000 条记录",
            details={"received": len(properties), "max_allowed": 10000}
        )

    logger.info(f"接收到 JSON 推送请求，包含 {len(properties)} 条记录")

    try:
        # 处理推送（使用线程池避免阻塞事件循环）
        importer = JSONBatchImporter()
        result = await run_in_threadpool(importer.batch_import_json, properties, db)

        return result

    except Exception as e:
        logger.error(f"JSON 推送处理失败: {str(e)}")
        raise BusinessLogicException(
            message=f"推送处理失败: {str(e)}",
            details={"total_records": len(properties)}
        )
