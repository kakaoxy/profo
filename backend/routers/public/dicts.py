"""业务字典公开只读路由（免登录，C 端/小程序渲染用）.

替代「小程序直接从 openapi 类型导入枚举」的耦合：字典组由后端下发，
运营改名/排序 ≤60s 生效（服务层进程内缓存，见 ``services/system/biz_dict.py``）。

仅暴露 ``code/label/sort_order``，不含 ``is_builtin/enabled/remark`` 等内部字段。
"""

from fastapi import APIRouter, Request

from dependencies.auth import DbSessionDep
from schemas.biz_dict import PublicDictListResponse
from services.system import biz_dict
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/dicts", tags=["public-dicts"])


@router.get(
    "/{dict_code}",
    summary="获取业务字典（仅启用项）",
    description="免登录下发指定字典组的启用项（按 sort_order 升序）；未登记字典组返回 404",
)
@limiter.limit(RateLimits.PUBLIC_DICT)
def get_public_dict(
    request: Request,
    dict_code: str,
    db: DbSessionDep,
) -> PublicDictListResponse:
    """读取公开字典（未登记组 404，避免运营建出无人消费的死字典）."""
    return biz_dict.get_public_items(db, dict_code)
