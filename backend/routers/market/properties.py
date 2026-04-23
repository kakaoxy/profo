"""
房源查询路由
处理房源数据的查询、筛选、排序和分页
"""
from datetime import datetime as dt
from typing import Optional, List, Annotated, Tuple
from fastapi import APIRouter, Depends, Query, Path, HTTPException
from fastapi.responses import StreamingResponse
import logging
import csv
import io

from utils.param_parser import parse_comma_separated_list
from utils.query_params import PropertyExportParams
from schemas import PaginatedPropertyResponse, PropertyDetailResponse, CommunitySearchResponse
from dependencies.auth import (
    DbSessionDep,
    CurrentInternalUserDep,
)
from services.market import PropertyQueryService, get_property_query_service
from models import PropertyCurrent, Community, PropertyMedia
from models.common.base import MediaType


logger = logging.getLogger(__name__)

# 定义服务依赖类型别名
PropertyServiceDep = Annotated[PropertyQueryService, Depends(get_property_query_service)]

router = APIRouter(tags=["市场情报-房源查询"])


@router.get("/communities/search", response_model=list[CommunitySearchResponse])
def search_communities(
    q: Annotated[str, Query(min_length=1, description="搜索关键词")],
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> list[CommunitySearchResponse]:
    """Search communities by name"""
    results = db.query(Community).filter(Community.name.contains(q)).limit(20).all()
    return [
        CommunitySearchResponse(
            id=c.id,
            name=c.name,
            district=c.district,
            business_circle=c.business_circle
        )
        for c in results
    ]


@router.get("", response_model=PaginatedPropertyResponse)
def get_properties(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    service: PropertyServiceDep,
    status: Annotated[Optional[str], Query(description="房源状态: 在售 | 成交")] = None,
    community_name: Annotated[Optional[str], Query(description="小区名称（模糊搜索）")] = None,
    districts: Annotated[Optional[str], Query(description="行政区，逗号分隔，例如: 徐汇,静安")] = None,
    business_circles: Annotated[Optional[str], Query(description="商圈，逗号分隔，例如: 五角场,中关村")] = None,
    orientations: Annotated[Optional[str], Query(description="朝向关键词，逗号分隔，例如: 南,东南")] = None,
    floor_levels: Annotated[Optional[str], Query(description="楼层级别，逗号分隔: 低楼层,中楼层,高楼层")] = None,
    min_price: Annotated[Optional[float], Query(ge=0, description="最低价格（万）")] = None,
    max_price: Annotated[Optional[float], Query(ge=0, description="最高价格（万）")] = None,
    min_area: Annotated[Optional[float], Query(ge=0, description="最小面积（㎡）")] = None,
    max_area: Annotated[Optional[float], Query(ge=0, description="最大面积（㎡）")] = None,
    rooms: Annotated[Optional[str], Query(description="室数量，逗号分隔，例如: 1,2,3")] = None,
    rooms_gte: Annotated[Optional[int], Query(ge=0, description="最少室数量，例如: 5 表示5室以上")] = None,
    sort_by: Annotated[str, Query(description="排序字段")] = "updated_at",
    sort_order: Annotated[str, Query(description="排序方向: asc | desc")] = "desc",
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50
) -> PaginatedPropertyResponse:
    """
    查询房源列表
    
    支持多维度筛选、排序和分页
    """
    # 解析 rooms 参数
    rooms_list = _parse_rooms_param(rooms)

    # 解析多选参数
    districts_list = parse_comma_separated_list(districts)
    business_circles_list = parse_comma_separated_list(business_circles)
    orientations_list = parse_comma_separated_list(orientations)
    floor_levels_list = parse_comma_separated_list(floor_levels)
    
    # 执行查询
    result = service.query_properties(
        db=db,
        status=status,
        community_name=community_name,
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
        page=page,
        page_size=page_size
    )
    
    return result


# 静态路径必须在动态路径之前定义
@router.get("/export")
def export_properties(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    service: PropertyServiceDep,
    status: Annotated[Optional[str], Query(description="房源状态: 在售 | 成交")] = None,
    community_name: Annotated[Optional[str], Query(description="小区名称（模糊搜索）")] = None,
    districts: Annotated[Optional[str], Query(description="行政区，逗号分隔")] = None,
    business_circles: Annotated[Optional[str], Query(description="商圈，逗号分隔")] = None,
    orientations: Annotated[Optional[str], Query(description="朝向关键词，逗号分隔")] = None,
    floor_levels: Annotated[Optional[str], Query(description="楼层级别，逗号分隔")] = None,
    min_price: Annotated[Optional[float], Query(ge=0, description="最低价格（万）")] = None,
    max_price: Annotated[Optional[float], Query(ge=0, description="最高价格（万）")] = None,
    min_area: Annotated[Optional[float], Query(ge=0, description="最小面积（㎡）")] = None,
    max_area: Annotated[Optional[float], Query(ge=0, description="最大面积（㎡）")] = None,
    rooms: Annotated[Optional[str], Query(description="室数量，逗号分隔，例如: 1,2,3")] = None,
    rooms_gte: Annotated[Optional[int], Query(ge=0, description="最少室数量")] = None,
    sort_by: Annotated[str, Query(description="排序字段")] = "updated_at",
    sort_order: Annotated[str, Query(description="排序方向: asc | desc")] = "desc"
) -> StreamingResponse:
    """
    导出房源数据为 CSV 文件
    
    使用与查询接口相同的筛选和排序参数，但移除分页限制，导出所有匹配的记录
    """
    # 解析 rooms 参数
    rooms_list = _parse_rooms_param(rooms)
    
    # 解析多选参数
    districts_list = parse_comma_separated_list(districts)
    business_circles_list = parse_comma_separated_list(business_circles)
    orientations_list = parse_comma_separated_list(orientations)
    floor_levels_list = parse_comma_separated_list(floor_levels)

    # 创建导出参数对象
    export_params = PropertyExportParams(
        status=status,
        community_name=community_name,
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
        sort_order=sort_order
    )

    properties = service.query_properties_for_export(
        db=db,
        params=export_params
    )
    
    return _generate_csv_response(properties)


# 动态路径必须放在静态路径之后
@router.get("/{id}", response_model=PropertyDetailResponse)
def get_property_detail(
    id: Annotated[int, Path(ge=1, description="房源ID")],
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> PropertyDetailResponse:
    """获取房源详情"""
    property_obj = db.query(PropertyCurrent).filter(
        PropertyCurrent.id == id,
        PropertyCurrent.is_active == True
    ).first()
    if not property_obj:
        raise HTTPException(status_code=404, detail="房源不存在")

    community = db.query(Community).filter(Community.id == property_obj.community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="关联小区不存在")

    detail = PropertyDetailResponse.from_orm_with_calculations(property_obj, community)
    # 获取图片链接
    picture_links = db.query(PropertyMedia.url).filter(
        PropertyMedia.data_source == property_obj.data_source,
        PropertyMedia.source_property_id == property_obj.source_property_id
    ).order_by(PropertyMedia.sort_order).all()
    detail.picture_links = [link[0] for link in picture_links] if picture_links else []
    return detail


def _parse_rooms_param(rooms: Optional[str]) -> Optional[List[int]]:
    """解析 rooms 参数为整数列表"""
    if not rooms:
        return None
    try:
        return [int(r.strip()) for r in rooms.split(',') if r.strip()]
    except ValueError:
        logger.warning(f"无效的 rooms 参数: {rooms}")
        return None


def _format_datetime(value) -> str:
    """格式化日期时间为字符串"""
    if value is None:
        return ""
    if isinstance(value, dt):
        return value.strftime("%Y-%m-%d")
    return str(value)


def _format_bool(value) -> str:
    """格式化布尔值为中文字符串"""
    if value is True:
        return "是"
    if value is False:
        return "否"
    return ""


def _format_list(value) -> str:
    """格式化列表为逗号分隔的字符串"""
    if not value:
        return ""
    if isinstance(value, list):
        return ",".join(str(v) for v in value)
    return str(value)


def _get_image_urls(prop) -> str:
    """从 property_media 关系中获取图片URL列表"""
    if not hasattr(prop, "property_media") or not prop.property_media:
        return ""

    IMAGE_TYPES = {MediaType.INTERIOR.value, MediaType.EXTERIOR.value, MediaType.FLOOR_PLAN.value, MediaType.OTHER.value}

    urls = []
    for media in prop.property_media:
        if hasattr(media, "media_type"):
            media_type_value = media.media_type.value if hasattr(media.media_type, "value") else str(media.media_type)
            if media_type_value in IMAGE_TYPES and media.url:
                urls.append(media.url)

    return ",".join(urls) if urls else ""


def _generate_csv_response(results: List[Tuple[PropertyCurrent, Community]]) -> StreamingResponse:
    """
    生成 CSV 文件流响应
    格式与批量上传模板保持一致，参考 PropertyIngestionModel 的字段别名
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # 表头与 PropertyIngestionModel 的 alias 保持一致
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
        row = [
            prop.data_source,
            prop.source_property_id,
            prop.status.value if hasattr(prop.status, "value") else prop.status,
            community.name if community else (prop.community_name if hasattr(prop, "community_name") else ""),
            prop.rooms,
            prop.halls or 0,
            prop.baths or 0,
            prop.orientation,
            prop.floor_original,
            prop.build_area,
            prop.inner_area if prop.inner_area else "",
            prop.listed_price_wan if prop.listed_price_wan else "",
            _format_datetime(prop.listed_date),
            prop.sold_price_wan if prop.sold_price_wan else "",
            _format_datetime(prop.sold_date),
            prop.property_type if prop.property_type else "",
            prop.build_year if prop.build_year else "",
            prop.building_structure if prop.building_structure else "",
            prop.decoration if prop.decoration else "",
            _format_bool(prop.elevator),
            prop.ownership_type if prop.ownership_type else "",
            prop.ownership_years if prop.ownership_years else "",
            prop.last_transaction if prop.last_transaction else "",
            prop.heating_method if prop.heating_method else "",
            prop.listing_remarks if prop.listing_remarks else "",
            _get_image_urls(prop),
            community.city_id if community and hasattr(community, "city_id") else "",
            community.district if community and hasattr(community, "district") else "",
            community.business_circle if community and hasattr(community, "business_circle") else "",
        ]
        writer.writerow(row)

    csv_content = output.getvalue()
    output.close()

    timestamp = dt.now().strftime("%Y%m%d_%H%M%S")
    filename = f"properties_export_{timestamp}.csv"

    logger.info(f"导出完成: {len(results)} 条记录, 文件名: {filename}")

    return StreamingResponse(
        iter([csv_content.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8",
        },
    )
