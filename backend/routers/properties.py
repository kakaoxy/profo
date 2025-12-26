"""
房源查询路由
处理房源数据的查询、筛选、排序和分页
"""
from datetime import datetime as dt
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from typing import Optional
import logging
import csv
import io

from db import get_db
from models import PropertyCurrent, Community, PropertyMedia
from utils.param_parser import parse_comma_separated_list
from utils.query_params import PropertyExportParams
from schemas import PaginatedPropertyResponse, PropertyDetailResponse
from dependencies.auth import get_current_normal_user, get_current_operator_user
from models.user import User
from services.property_query_service import PropertyQueryService, get_property_query_service


logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/communities/search")
def search_communities(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Search communities by name"""
    results = db.query(Community).filter(Community.name.contains(q)).limit(20).all()
    return [
        {
            "id": c.id, 
            "name": c.name, 
            "district": c.district, 
            "business_circle": c.business_circle
        } 
        for c in results
    ]


@router.get("", response_model=PaginatedPropertyResponse)
def get_properties(
    status: Optional[str] = Query(None, description="房源状态: 在售 | 成交"),
    community_name: Optional[str] = Query(None, description="小区名称（模糊搜索）"),
    districts: Optional[str] = Query(None, description="行政区，逗号分隔，例如: 徐汇,静安"),
    business_circles: Optional[str] = Query(None, description="商圈，逗号分隔，例如: 五角场,中关村"),
    orientations: Optional[str] = Query(None, description="朝向关键词，逗号分隔，例如: 南,东南"),
    floor_levels: Optional[str] = Query(None, description="楼层级别，逗号分隔: 低楼层,中楼层,高楼层"),
    min_price: Optional[float] = Query(None, ge=0, description="最低价格（万）"),
    max_price: Optional[float] = Query(None, ge=0, description="最高价格（万）"),
    min_area: Optional[float] = Query(None, ge=0, description="最小面积（㎡）"),
    max_area: Optional[float] = Query(None, ge=0, description="最大面积（㎡）"),
    rooms: Optional[str] = Query(None, description="室数量，逗号分隔，例如: 1,2,3"),
    rooms_gte: Optional[int] = Query(None, ge=0, description="最少室数量，例如: 5 表示5室以上"),
    sort_by: str = Query("updated_at", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向: asc | desc"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_normal_user),
    service: PropertyQueryService = Depends(get_property_query_service)
):
    """
    查询房源列表
    
    支持多维度筛选、排序和分页
    """
    # 解析 rooms 参数
    rooms_list = None
    if rooms:
        try:
            rooms_list = [int(r.strip()) for r in rooms.split(',') if r.strip()]
        except ValueError:
            logger.warning(f"无效的 rooms 参数: {rooms}")

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
    status: Optional[str] = Query(None, description="房源状态: 在售 | 成交"),
    community_name: Optional[str] = Query(None, description="小区名称（模糊搜索）"),
    districts: Optional[str] = Query(None, description="行政区，逗号分隔"),
    business_circles: Optional[str] = Query(None, description="商圈，逗号分隔"),
    orientations: Optional[str] = Query(None, description="朝向关键词，逗号分隔"),
    floor_levels: Optional[str] = Query(None, description="楼层级别，逗号分隔"),
    min_price: Optional[float] = Query(None, ge=0, description="最低价格（万）"),
    max_price: Optional[float] = Query(None, ge=0, description="最高价格（万）"),
    min_area: Optional[float] = Query(None, ge=0, description="最小面积（㎡）"),
    max_area: Optional[float] = Query(None, ge=0, description="最大面积（㎡）"),
    rooms: Optional[str] = Query(None, description="室数量，逗号分隔，例如: 1,2,3"),
    rooms_gte: Optional[int] = Query(None, ge=0, description="最少室数量"),
    sort_by: str = Query("updated_at", description="排序字段"),
    sort_order: str = Query("desc", description="排序方向: asc | desc"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_operator_user),
    service: PropertyQueryService = Depends(get_property_query_service)
):
    """
    导出房源数据为 CSV 文件
    
    使用与查询接口相同的筛选和排序参数，但移除分页限制，导出所有匹配的记录
    """
    # 解析 rooms 参数
    rooms_list = None
    if rooms:
        try:
            rooms_list = [int(r.strip()) for r in rooms.split(',') if r.strip()]
        except ValueError:
            logger.warning(f"无效的 rooms 参数: {rooms}")
    
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
    
    # 创建 CSV 内容
    output = io.StringIO()
    writer = csv.writer(output)
    
    # 写入表头
    headers = [
        "ID", "数据源", "房源ID", "状态", "小区名", 
        "室", "厅", "卫", "朝向", "楼层", "楼层级别",
        "建筑面积(㎡)", "套内面积(㎡)", "总价(万)", "单价(元/㎡)",
        "上架时间", "成交时间", "成交周期(天)",
        "物业类型", "建筑年代", "装修情况", "电梯",
        "创建时间", "更新时间"
    ]
    writer.writerow(headers)
    
    # 写入数据行
    for prop in properties:
        row = [
            prop.id,
            prop.data_source,
            prop.source_property_id,
            prop.status,
            prop.community_name,
            prop.rooms,
            prop.halls,
            prop.baths,
            prop.orientation,
            prop.floor_display,
            prop.floor_level or "",
            prop.build_area,
            prop.inner_area or "",
            prop.total_price,
            prop.unit_price,
            prop.listed_date.strftime("%Y-%m-%d %H:%M:%S") if prop.listed_date else "",
            prop.sold_date.strftime("%Y-%m-%d %H:%M:%S") if prop.sold_date else "",
            prop.transaction_duration_days or "",
            prop.property_type or "",
            prop.build_year or "",
            prop.decoration or "",
            "是" if prop.elevator else ("否" if prop.elevator is False else ""),
            prop.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            prop.updated_at.strftime("%Y-%m-%d %H:%M:%S")
        ]
        writer.writerow(row)
    
    # 获取 CSV 内容
    csv_content = output.getvalue()
    output.close()
    
    # 生成文件名（包含时间戳）
    timestamp = dt.now().strftime("%Y%m%d_%H%M%S")
    filename = f"properties_export_{timestamp}.csv"
    
    logger.info(f"导出完成: {len(properties)} 条记录, 文件名: {filename}")
    
    # 返回 CSV 文件流
    return StreamingResponse(
        iter([csv_content.encode('utf-8-sig')]),  # 使用 utf-8-sig 以支持 Excel 正确显示中文
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8"
        }
    )


# 动态路径必须放在静态路径之后
@router.get("/{id}", response_model=PropertyDetailResponse)
def get_property_detail(
    id: int, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_normal_user)
):
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
