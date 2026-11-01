"""高德地图 Key 配置路由.

仅管理员可读写（与订阅消息模板配置口径一致）。
"""

from fastapi import APIRouter

from dependencies.auth import CurrentAdminUserDep, DbSessionDep
from schemas.amap_config import AmapConfigResponse, AmapConfigUpdateRequest
from services.system import amap_config

router = APIRouter(prefix="/amap-config", tags=["system"])


@router.get("")
def get_amap_config(
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> AmapConfigResponse:
    """读取高德 Web 端 Key（未配置时 configured=false）."""
    return amap_config.get_amap_config(db)


@router.put("")
def update_amap_config(
    req: AmapConfigUpdateRequest,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> AmapConfigResponse:
    """保存高德 Web 端 Key 与安全密钥；留空保存 = 清除配置."""
    return amap_config.save_amap_config(
        db,
        js_key=req.js_key,
        security_js_code=req.security_js_code,
        operator_id=str(current_user.id),
    )
