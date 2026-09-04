"""C端房源单（多房源分享）公开路由.

前缀 ``/public/property-sheets``：创建/列表/删除需 C 端登录态，短码解析/
详情/联系卡/访问埋点免登录，小程序码与分享事件需登录态.
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.public import (
    PublicConsultantContact,
    PublicShareStatsResponse,
    PublicTrackingEventResponse,
)
from schemas.public.property_sheet import (
    PropertySheetCreateRequest,
    PropertySheetMineListResponse,
    PropertySheetQRCodeResponse,
    PropertySheetQRSceneResponse,
    PropertySheetResponse,
    PropertySheetShareEventRequest,
    PropertySheetVisitEventRequest,
)
from services.property_sheet import PropertySheetService
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/property-sheets", tags=["public-property-sheets"])


@router.post(
    "",
    summary="创建房源单",
    description="选择 1~10 套在售已发布房源生成房源单（服务端去重保序），需 C 端登录态；限流",
    responses={400: {"description": "房源不存在、未发布或非在售"}},
)
@limiter.limit(RateLimits.PROPERTY_SHEET_CREATE)
def create_property_sheet(
    request: Request,
    body: PropertySheetCreateRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PropertySheetResponse:
    """创建房源单并返回含明细的完整响应."""
    svc = PropertySheetService(db)
    sheet = svc.create_property_sheet(current_user.id, body)
    # 明细展示字段需 join 房源，复用详情组装（Router 不做查询）
    return svc.get_sheet_detail(sheet.id)


@router.get(
    "/mine",
    summary="我的房源单列表",
    description="当前员工未删除的房源单列表（创建时间倒序，含明细数），需登录",
)
@limiter.limit(RateLimits.PROPERTY_SHEET_DETAIL)
def list_my_property_sheets(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PropertySheetMineListResponse:
    """我的房源单列表."""
    items = PropertySheetService(db).list_my_sheets(current_user.id)
    return PropertySheetMineListResponse(items=items)


@router.get(
    "/my/share-stats",
    summary="我的房源单分享统计",
    description="分享次数 / 经我分享打开 PV/UV / 分享归因留资数（今日 + 累计），需登录",
)
def get_my_share_stats(
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicShareStatsResponse:
    """我的房源单分享统计."""
    data = PropertySheetService(db).get_my_share_stats(current_user)
    return PublicShareStatsResponse(**data)


@router.get(
    "/qr/{code}",
    summary="解析小程序码短码",
    description="游客可访问，限流；返回房源单ID与来源员工ID（员工无效时 referrer 为 null）",
    responses={404: {"description": "短码不存在"}, 400: {"description": "房源单已失效"}},
)
@limiter.limit(RateLimits.PROPERTY_SHEET_QR_SCENE)
def resolve_qr_code(
    request: Request,
    code: Annotated[str, Path(min_length=1, max_length=8, description="8位短码")],
    db: DbSessionDep,
) -> PropertySheetQRSceneResponse:
    """解析短码."""
    return PropertySheetService(db).resolve_code(code)


@router.get(
    "/{sheet_id}",
    summary="获取房源单详情",
    description="获取房源单及其可见房源明细（仅显示已发布且在售/已售的房源），无需登录",
    responses={404: {"description": "房源单不存在或已删除"}},
)
@limiter.limit(RateLimits.PROPERTY_SHEET_DETAIL)
def get_property_sheet_detail(
    request: Request,
    sheet_id: Annotated[int, Path(ge=1, description="房源单ID")],
    db: DbSessionDep,
) -> PropertySheetResponse:
    """获取房源单详情."""
    return PropertySheetService(db).get_sheet_detail(sheet_id)


@router.delete(
    "/{sheet_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除房源单",
    description="软删归档（status 置 archived），删除后全链路拦截；仅本人可删，需登录",
    responses={404: {"description": "房源单不存在、已删除或不归属当前员工"}},
)
def delete_property_sheet(
    sheet_id: Annotated[int, Path(ge=1, description="房源单ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> None:
    """软删房源单（归档）."""
    PropertySheetService(db).delete_sheet(current_user.id, sheet_id)


@router.get(
    "/{sheet_id}/qrcode",
    summary="生成房源单小程序码",
    description="复用房源单短码实时调微信生成，返回短码与 base64 图片；仅本人，需登录；限流",
    responses={404: {"description": "房源单不存在、已删除或不归属当前员工"}},
)
@limiter.limit(RateLimits.PROPERTY_SHEET_QRCODE)
def generate_property_sheet_qrcode(
    request: Request,
    sheet_id: Annotated[int, Path(ge=1, description="房源单ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PropertySheetQRCodeResponse:
    """生成房源单小程序码."""
    return PropertySheetService(db).generate_qrcode(current_user.id, sheet_id)


@router.get(
    "/{sheet_id}/consultant",
    summary="获取分享人联系卡",
    description="无需登录；referrer 为有效内部员工时返回其联系方式，否则回退默认顾问",
    responses={404: {"description": "房源单不存在或已删除"}},
)
@limiter.limit(RateLimits.PROPERTY_SHEET_DETAIL)
def get_consultant_contact(
    request: Request,
    sheet_id: Annotated[int, Path(ge=1, description="房源单ID")],
    db: DbSessionDep,
    referrer: Annotated[str | None, Query(max_length=36, description="分享归属员工ID(内部员工)")] = None,
) -> PublicConsultantContact:
    """获取分享人联系卡."""
    return PropertySheetService(db).get_consultant_contact(sheet_id, referrer)


@router.post(
    "/{sheet_id}/visit-events",
    summary="上报房源单访问埋点",
    description="免登录，referrer 原样落库；房源单不存在或已删除返回 404",
    responses={404: {"description": "房源单不存在或已删除"}},
)
@limiter.limit(RateLimits.PROPERTY_SHEET_VISIT)
def create_visit_event(
    request: Request,
    sheet_id: Annotated[int, Path(ge=1, description="房源单ID")],
    body: PropertySheetVisitEventRequest,
    db: DbSessionDep,
) -> PublicTrackingEventResponse:
    """上报房源单访问埋点."""
    visit = PropertySheetService(db).create_visit_event(sheet_id, body)
    return PublicTrackingEventResponse(id=visit.id)


@router.post(
    "/{sheet_id}/share-events",
    summary="上报房源单分享事件",
    description="需 C 端登录态（员工经附加 customer 角色访问），employee_id 服务端取当前用户；限流",
    responses={404: {"description": "房源单不存在或已删除"}},
)
@limiter.limit(RateLimits.PROPERTY_SHEET_SHARE)
def create_share_event(
    request: Request,
    sheet_id: Annotated[int, Path(ge=1, description="房源单ID")],
    body: PropertySheetShareEventRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicTrackingEventResponse:
    """上报房源单分享事件."""
    event = PropertySheetService(db).create_share_event(current_user, sheet_id, body)
    return PublicTrackingEventResponse(id=event.id)
