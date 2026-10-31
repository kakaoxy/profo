"""后台门店地图与拜访轨迹路由（前缀 /admin/merchant）."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Request

from dependencies.auth import DbSessionDep, MerchantMapPermDep
from schemas.amap_config import AmapConfigResponse
from schemas.merchant import MerchantMapResponse, MerchantTrackResponse
from services.merchant.map import MerchantMapService
from services.system import amap_config
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/admin/merchant", tags=["merchant-map"])


@router.get("/map/config", summary="地图配置（高德 Key）")
@limiter.limit(RateLimits.MERCHANT_READ)
def map_config(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantMapPermDep,
) -> AmapConfigResponse:
    """地图页按需读取高德 Key；未配置时返回空串，前端降级为列表."""
    return amap_config.get_amap_config(db)


@router.get("/map/stores", summary="门店地图点位与统计")
@limiter.limit(RateLimits.MERCHANT_READ)
def map_stores(
    request: Request,
    db: DbSessionDep,
    current_user: MerchantMapPermDep,
    province: str | None = None,
    city: str | None = None,
    district: str | None = None,
    business_circle: str | None = None,
    cooperation_status: str | None = None,
    review_status: str | None = None,
) -> MerchantMapResponse:
    """按区域/商圈/合作/审核状态筛选门店点位."""
    return MerchantMapService(db).map_points(
        current_user,
        province=province,
        city=city,
        district=district,
        business_circle=business_circle,
        cooperation_status=cooperation_status,
        review_status=review_status,
    )


@router.get("/tracks", summary="员工拜访轨迹")
@limiter.limit(RateLimits.MERCHANT_READ)
def employee_track(
    request: Request,
    db: DbSessionDep,
    current_user: MerchantMapPermDep,
    employee_id: Annotated[str, Query(min_length=1, description="员工ID")],
    start_date: Annotated[date | None, Query(description="开始日期")] = None,
    end_date: Annotated[date | None, Query(description="结束日期")] = None,
) -> MerchantTrackResponse:
    """按员工与日期查询到店打卡点（默认当天，最长 31 天）."""
    return MerchantMapService(db).employee_track(
        current_user,
        employee_id=employee_id,
        start_date=start_date,
        end_date=end_date,
        request=request,
    )
