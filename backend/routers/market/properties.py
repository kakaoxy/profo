"""房源查询路由.

处理房源数据的查询、筛选、排序和分页.
"""

import csv
import io
import logging
from datetime import datetime as dt
from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query
from fastapi.responses import StreamingResponse

from dependencies.auth import (
    CurrentInternalUserDep,
    DbSessionDep,
)
from dependencies.common import PaginationDep
from models import Community, PropertyCurrent
from models.common.base import MediaType
from schemas import (
    CommunitySearchResponse,
    PaginatedPropertyResponse,
    PropertyDetailResponse,
)
from services.market import (
    PropertyQueryService,
    PropertyService,
    get_property_query_service,
    get_property_service,
)
from services.system.exceptions import ResourceNotFoundError
from utils.param_parser import parse_comma_separated_list
from utils.query_params import PropertyExportParams

logger = logging.getLogger(__name__)

PropertyServiceDep = Annotated[PropertyQueryService, Depends(get_property_query_service)]
DetailServiceDep = Annotated[PropertyService, Depends(get_property_service)]

router = APIRouter(prefix="/properties", tags=["properties"])


@router.get("/communities/search")
def search_communities(
    q: Annotated[str, Query(min_length=1, description="搜索关键词")],
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    detail_service: DetailServiceDep,
) -> list[CommunitySearchResponse]:
    """Search communities by name."""
    return detail_service.search_communities(db, q)


@router.get("")
def get_properties(  # noqa: PLR0913
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    service: PropertyServiceDep,
    pagination: PaginationDep,
    status: Annotated[str | None, Query(description="房源状态: 在售 | 成交")] = None,
    community_name: Annotated[str | None, Query(description="小区名称（模糊搜索）")] = None,
    community_ids: Annotated[str | None, Query(description="小区ID，逗号分隔，例如: uuid1,uuid2")] = None,
    districts: Annotated[str | None, Query(description="行政区，逗号分隔，例如: 徐汇,静安")] = None,
    business_circles: Annotated[str | None, Query(description="商圈，逗号分隔，例如: 五角场,中关村")] = None,
    orientations: Annotated[str | None, Query(description="朝向关键词，逗号分隔，例如: 南,东南")] = None,
    floor_levels: Annotated[str | None, Query(description="楼层级别，逗号分隔: 低楼层,中楼层,高楼层")] = None,
    min_price: Annotated[float | None, Query(ge=0, description="最低价格（万）")] = None,
    max_price: Annotated[float | None, Query(ge=0, description="最高价格（万）")] = None,
    min_area: Annotated[float | None, Query(ge=0, description="最小面积（㎡）")] = None,
    max_area: Annotated[float | None, Query(ge=0, description="最大面积（㎡）")] = None,
    rooms: Annotated[str | None, Query(description="室数量，逗号分隔，例如: 1,2,3")] = None,
    rooms_gte: Annotated[int | None, Query(ge=0, description="最少室数量，例如: 5 表示5室以上")] = None,
    sort_by: Annotated[str, Query(description="排序字段")] = "updated_at",
    sort_order: Annotated[str, Query(description="排序方向: asc | desc")] = "desc",
) -> PaginatedPropertyResponse:
    """查询房源列表.

    支持多维度筛选、排序和分页
    """
    rooms_list = _parse_rooms_param(rooms)

    districts_list = parse_comma_separated_list(districts)
    business_circles_list = parse_comma_separated_list(business_circles)
    orientations_list = parse_comma_separated_list(orientations)
    floor_levels_list = parse_comma_separated_list(floor_levels)
    community_ids_list = parse_comma_separated_list(community_ids)

    return service.query_properties(
        db=db,
        status=status,
        community_name=community_name,
        community_ids=community_ids_list,
        districts=districts_list,
        business_circles=business_circles_list,
        orientations=orientations_list,
        floor_levels=floor_levels_list,
        min_price=min_price,
        max_price=max_price,
        min_area=min_area,
        max_area=max_area,
        rooms=rooms_list,
        rooms_gte=rooms_gte,
        sort_by=sort_by,
        sort_order=sort_order,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/export")
def export_properties(  # noqa: PLR0913
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    service: PropertyServiceDep,
    status: Annotated[str | None, Query(description="房源状态: 在售 | 成交")] = None,
    community_name: Annotated[str | None, Query(description="小区名称（模糊搜索）")] = None,
    community_ids: Annotated[str | None, Query(description="小区ID，逗号分隔")] = None,
    districts: Annotated[str | None, Query(description="行政区，逗号分隔")] = None,
    business_circles: Annotated[str | None, Query(description="商圈，逗号分隔")] = None,
    orientations: Annotated[str | None, Query(description="朝向关键词，逗号分隔")] = None,
    floor_levels: Annotated[str | None, Query(description="楼层级别，逗号分隔")] = None,
    min_price: Annotated[float | None, Query(ge=0, description="最低价格（万）")] = None,
    max_price: Annotated[float | None, Query(ge=0, description="最高价格（万）")] = None,
    min_area: Annotated[float | None, Query(ge=0, description="最小面积（㎡）")] = None,
    max_area: Annotated[float | None, Query(ge=0, description="最大面积（㎡）")] = None,
    rooms: Annotated[str | None, Query(description="室数量，逗号分隔，例如: 1,2,3")] = None,
    rooms_gte: Annotated[int | None, Query(ge=0, description="最少室数量")] = None,
    sort_by: Annotated[str, Query(description="排序字段")] = "updated_at",
    sort_order: Annotated[str, Query(description="排序方向: asc | desc")] = "desc",
) -> StreamingResponse:
    """导出房源数据为 CSV 文件.

    使用与查询接口相同的筛选和排序参数，但移除分页限制，导出所有匹配的记录
    """
    rooms_list = _parse_rooms_param(rooms)

    districts_list = parse_comma_separated_list(districts)
    business_circles_list = parse_comma_separated_list(business_circles)
    orientations_list = parse_comma_separated_list(orientations)
    floor_levels_list = parse_comma_separated_list(floor_levels)
    community_ids_list = parse_comma_separated_list(community_ids)

    export_params = PropertyExportParams(
        status=status,
        community_name=community_name,
        community_ids=community_ids_list,
        districts=districts_list,
        business_circles=business_circles_list,
        orientations=orientations_list,
        floor_levels=floor_levels_list,
        min_price=min_price,
        max_price=max_price,
        min_area=min_area,
        max_area=max_area,
        rooms=rooms_list,
        rooms_gte=rooms_gte,
        sort_by=sort_by,
        sort_order=sort_order,
    )

    properties = service.query_properties_for_export(
        db=db,
        params=export_params,
    )

    return _generate_csv_response(properties)


@router.get("/{property_id}")
def get_property_detail(
    property_id: Annotated[int, Path(ge=1, description="房源ID")],
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    detail_service: DetailServiceDep,
) -> PropertyDetailResponse:
    """获取房源详情."""
    try:
        return detail_service.get_detail(db, property_id)
    except ValueError as e:
        raise ResourceNotFoundError(str(e)) from e


def _parse_rooms_param(rooms: str | None) -> list[int] | None:
    """解析 rooms 参数为整数列表."""
    if not rooms:
        return None
    try:
        return [int(r.strip()) for r in rooms.split(",") if r.strip()]
    except ValueError:
        logger.warning("无效的 rooms 参数: %s", rooms)
        return None


def _format_datetime(value: object) -> str:
    """格式化日期时间为字符串."""
    if value is None:
        return ""
    if isinstance(value, dt):
        return value.strftime("%Y-%m-%d")
    return str(value)


def _format_bool(value: object) -> str:
    """格式化布尔值为大写英文字符串."""
    if value is True:
        return "TRUE"
    if value is False:
        return "FALSE"
    return ""


def _format_list(value: object) -> str:
    """格式化列表为逗号分隔的字符串."""
    if not value:
        return ""
    if isinstance(value, list):
        return ",".join(str(v) for v in value)
    return str(value)


def _get_image_urls(prop: PropertyCurrent) -> str:
    """从 property_media 关系中获取图片URL列表."""
    if not hasattr(prop, "property_media") or not prop.property_media:
        return ""

    image_types = {
        MediaType.INTERIOR.value,
        MediaType.EXTERIOR.value,
        MediaType.FLOOR_PLAN.value,
        MediaType.OTHER.value,
    }

    urls = []
    for media in prop.property_media:
        if hasattr(media, "media_type"):
            media_type_value = media.media_type.value
            if media_type_value in image_types and media.url:
                urls.append(media.url)

    return ",".join(urls) if urls else ""


def _generate_csv_response(results: list[tuple[PropertyCurrent, Community]]) -> StreamingResponse:
    """生成 CSV 文件流响应.

    格式与批量上传模板保持一致，参考 PropertyIngestionModel 的字段别名.
    """
    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "数据源",
        "房源ID",
        "状态",
        "小区名",
        "室",
        "厅",
        "卫",
        "朝向",
        "楼层",
        "面积",
        "套内面积",
        "挂牌价",
        "上架时间",
        "成交价",
        "成交时间",
        "物业类型",
        "建筑年代",
        "建筑结构",
        "装修情况",
        "电梯",
        "产权性质",
        "产权年限",
        "上次交易",
        "供暖方式",
        "房源描述",
        "图片链接",
        "城市ID",
        "行政区",
        "商圈",
    ]
    writer.writerow(headers)

    for prop, community in results:
        orientation = prop.orientation if prop.orientation and str(prop.orientation).strip() else "未知"
        row = [
            prop.data_source,
            prop.source_property_id,
            prop.status.value if hasattr(prop.status, "value") else prop.status,
            community.name if community else (prop.community_name if hasattr(prop, "community_name") else ""),
            prop.rooms,
            prop.halls or 0,
            prop.baths or 0,
            orientation,
            prop.floor_original,
            prop.build_area,
            prop.inner_area or "",
            prop.listed_price_wan or "",
            _format_datetime(prop.listed_date),
            prop.sold_price_wan or "",
            _format_datetime(prop.sold_date),
            prop.property_type or "",
            prop.build_year or "",
            prop.building_structure or "",
            prop.decoration or "",
            _format_bool(prop.elevator),
            prop.ownership_type or "",
            prop.ownership_years or "",
            prop.last_transaction or "",
            prop.heating_method or "",
            prop.listing_remarks or "",
            _get_image_urls(prop),
            community.city_id if community and hasattr(community, "city_id") else "",
            community.district if community and hasattr(community, "district") else "",
            community.business_circle if community and hasattr(community, "business_circle") else "",
        ]
        writer.writerow(row)

    csv_content = output.getvalue()
    output.close()

    timestamp = dt.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"properties_export_{timestamp}.csv"

    logger.info("导出完成: %s 条记录, 文件名: %s", len(results), filename)

    return StreamingResponse(
        iter([csv_content.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8",
        },
    )
