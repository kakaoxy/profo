"""
房源查询路由
处理房源数据的查询、筛选、排序和分页
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc, asc
from typing import Optional, List
import logging
import csv
import io

from db import get_db
from models import PropertyCurrent, Community, PropertyStatus
from schemas import PropertyResponse, PaginatedPropertyResponse, PropertyDetailResponse


logger = logging.getLogger(__name__)

router = APIRouter()


class PropertyQueryService:
    """房源查询服务"""
    
    def query_properties(
        self,
        db: Session,
        status: Optional[str] = None,
        community_name: Optional[str] = None,
        districts: Optional[List[str]] = None,
        business_circles: Optional[List[str]] = None,
        orientations: Optional[List[str]] = None,
        floor_levels: Optional[List[str]] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        rooms: Optional[List[int]] = None,
        rooms_gte: Optional[int] = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        page: int = 1,
        page_size: int = 50
    ) -> PaginatedPropertyResponse:
        """
        查询房源数据（优化版本）
        
        Args:
            db: 数据库会话
            status: 房源状态 ("在售" | "成交" | None)
            community_name: 小区名称（模糊搜索）
            districts: 行政区列表
            business_circles: 商圈列表
            orientations: 朝向关键字列表（南/北/东西等）
            floor_levels: 楼层级别列表（低楼层/中楼层/高楼层）
            min_price: 最低价格（万）
            max_price: 最高价格（万）
            min_area: 最小面积（㎡）
            max_area: 最大面积（㎡）
            rooms: 室数量列表
            rooms_gte: 最少室数量（用于“5室以上”）
            sort_by: 排序字段
            sort_order: 排序方向 ("asc" | "desc")
            page: 页码
            page_size: 每页数量
        
        Returns:
            PaginatedPropertyResponse: 分页查询结果
        """
        # 构建基础查询 - 使用 joinedload 优化关联查询
        from sqlalchemy.orm import joinedload
        
        query = db.query(PropertyCurrent, Community.name).join(
            Community,
            PropertyCurrent.community_id == Community.id
        ).filter(PropertyCurrent.is_active == True)
        
        # 应用筛选条件
        query = self._apply_filters(
            query,
            status=status,
            community_name=community_name,
            districts=districts,
            business_circles=business_circles,
            orientations=orientations,
            floor_levels=floor_levels,
            min_price=min_price,
            max_price=max_price,
            min_area=min_area,
            max_area=max_area,
            rooms=rooms,
            rooms_gte=rooms_gte
        )
        
        # 优化：使用子查询获取总数（避免在大数据集上使用 count()）
        # 对于分页查询，我们可以使用更高效的计数方法
        from sqlalchemy import func
        count_query = query.statement.with_only_columns(func.count()).order_by(None)
        total = db.execute(count_query).scalar()
        
        # 应用排序
        query = self._apply_sorting(query, sort_by, sort_order)
        
        # 应用分页
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)
        
        # 执行查询 - 使用 yield_per 进行流式处理（对大结果集更高效）
        results = query.all()
        
        # 转换为响应模型
        items = []
        for property_obj, community_name in results:
            item = PropertyResponse.from_orm_with_calculations(property_obj, community_name)
            items.append(item)
        
        logger.info(f"查询完成: 总数={total}, 页码={page}, 每页={page_size}, 返回={len(items)}")
        
        return PaginatedPropertyResponse(
            total=total,
            page=page,
            page_size=page_size,
            items=items
        )
    
    def _apply_filters(
        self,
        query,
        status: Optional[str] = None,
        community_name: Optional[str] = None,
        districts: Optional[List[str]] = None,
        business_circles: Optional[List[str]] = None,
        orientations: Optional[List[str]] = None,
        floor_levels: Optional[List[str]] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        rooms: Optional[List[int]] = None,
        rooms_gte: Optional[int] = None
    ):
        """
        应用筛选条件
        
        Args:
            query: SQLAlchemy 查询对象
            status: 房源状态
            community_name: 小区名称
            districts: 行政区
            business_circles: 商圈
            orientations: 朝向
            floor_levels: 楼层级别
            min_price: 最低价格
            max_price: 最高价格
            min_area: 最小面积
            max_area: 最大面积
            rooms: 室数量列表
            rooms_gte: 最少室数量
        
        Returns:
            应用筛选后的查询对象
        """
        # 状态筛选
        if status:
            if status == "在售":
                query = query.filter(PropertyCurrent.status == PropertyStatus.FOR_SALE)
            elif status == "成交":
                query = query.filter(PropertyCurrent.status == PropertyStatus.SOLD)
        
        # 小区名称模糊搜索
        if community_name:
            query = query.filter(Community.name.like(f"%{community_name}%"))

        # 行政区筛选（多选）
        if districts:
            query = query.filter(Community.district.in_(districts))

        # 商圈筛选（多选）
        if business_circles:
            query = query.filter(Community.business_circle.in_(business_circles))
        
        # 价格范围筛选
        if min_price is not None or max_price is not None:
            # 根据状态选择价格字段
            if status == "在售":
                if min_price is not None:
                    query = query.filter(PropertyCurrent.listed_price_wan >= min_price)
                if max_price is not None:
                    query = query.filter(PropertyCurrent.listed_price_wan <= max_price)
            elif status == "成交":
                if min_price is not None:
                    query = query.filter(PropertyCurrent.sold_price_wan >= min_price)
                if max_price is not None:
                    query = query.filter(PropertyCurrent.sold_price_wan <= max_price)
            else:
                # 状态为空时，同时考虑挂牌价和成交价
                price_conditions = []
                if min_price is not None:
                    price_conditions.append(
                        or_(
                            PropertyCurrent.listed_price_wan >= min_price,
                            PropertyCurrent.sold_price_wan >= min_price
                        )
                    )
                if max_price is not None:
                    price_conditions.append(
                        or_(
                            PropertyCurrent.listed_price_wan <= max_price,
                            PropertyCurrent.sold_price_wan <= max_price
                        )
                    )
                if price_conditions:
                    query = query.filter(and_(*price_conditions))
        
        # 面积范围筛选
        if min_area is not None:
            query = query.filter(PropertyCurrent.build_area >= min_area)
        if max_area is not None:
            query = query.filter(PropertyCurrent.build_area <= max_area)
        
        # 户型筛选
        if rooms:
            query = query.filter(PropertyCurrent.rooms.in_(rooms))
        if rooms_gte is not None:
            query = query.filter(PropertyCurrent.rooms >= rooms_gte)

        # 楼层级别筛选（多选）
        if floor_levels:
            query = query.filter(PropertyCurrent.floor_level.in_(floor_levels))

        # 朝向筛选（包含任意关键字）
        if orientations:
            orientation_conditions = []
            for ori in orientations:
                if ori:
                    orientation_conditions.append(PropertyCurrent.orientation.like(f"%{ori}%"))
            if orientation_conditions:
                query = query.filter(or_(*orientation_conditions))

        return query
    
    def _apply_sorting(self, query, sort_by: str, sort_order: str):
        """
        应用排序
        
        Args:
            query: SQLAlchemy 查询对象
            sort_by: 排序字段
            sort_order: 排序方向
        
        Returns:
            应用排序后的查询对象
        """
        # 映射排序字段
        sort_field_map = {
            "updated_at": PropertyCurrent.updated_at,
            "created_at": PropertyCurrent.created_at,
            "listed_price_wan": PropertyCurrent.listed_price_wan,
            "sold_price_wan": PropertyCurrent.sold_price_wan,
            "build_area": PropertyCurrent.build_area,
            "rooms": PropertyCurrent.rooms,
            "listed_date": PropertyCurrent.listed_date,
            "sold_date": PropertyCurrent.sold_date,
        }
        
        # 获取排序字段
        sort_field = sort_field_map.get(sort_by, PropertyCurrent.updated_at)
        
        # 应用排序方向
        if sort_order == "asc":
            query = query.order_by(asc(sort_field))
        else:
            query = query.order_by(desc(sort_field))
        
        return query
    
    def query_properties_for_export(
        self,
        db: Session,
        status: Optional[str] = None,
        community_name: Optional[str] = None,
        districts: Optional[List[str]] = None,
        business_circles: Optional[List[str]] = None,
        orientations: Optional[List[str]] = None,
        floor_levels: Optional[List[str]] = None,
        min_price: Optional[float] = None,
        max_price: Optional[float] = None,
        min_area: Optional[float] = None,
        max_area: Optional[float] = None,
        rooms: Optional[List[int]] = None,
        rooms_gte: Optional[int] = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc"
    ) -> List[PropertyResponse]:
        """
        查询房源数据用于导出（无分页限制）
        
        Args:
            db: 数据库会话
            status: 房源状态 ("在售" | "成交" | None)
            community_name: 小区名称（模糊搜索）
            min_price: 最低价格（万）
            max_price: 最高价格（万）
            min_area: 最小面积（㎡）
            max_area: 最大面积（㎡）
            rooms: 室数量列表
            sort_by: 排序字段
            sort_order: 排序方向 ("asc" | "desc")
        
        Returns:
            List[PropertyResponse]: 所有匹配的房源列表
        """
        # 构建基础查询
        query = db.query(PropertyCurrent, Community.name).join(
            Community,
            PropertyCurrent.community_id == Community.id
        ).filter(PropertyCurrent.is_active == True)
        
        # 应用筛选条件
        query = self._apply_filters(
            query,
            status=status,
            community_name=community_name,
            districts=districts,
            business_circles=business_circles,
            orientations=orientations,
            floor_levels=floor_levels,
            min_price=min_price,
            max_price=max_price,
            min_area=min_area,
            max_area=max_area,
            rooms=rooms,
            rooms_gte=rooms_gte
        )
        
        # 应用排序
        query = self._apply_sorting(query, sort_by, sort_order)
        
        # 执行查询（无分页限制）
        results = query.all()
        
        # 转换为响应模型
        items = []
        for property_obj, community_name in results:
            item = PropertyResponse.from_orm_with_calculations(property_obj, community_name)
            items.append(item)
        
        logger.info(f"导出查询完成: 总数={len(items)}")
        return items


@router.get("", response_model=PaginatedPropertyResponse)
async def get_properties(
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
    db: Session = Depends(get_db)
):
    """
    查询房源列表
    
    支持多维度筛选、排序和分页
    
    Args:
        status: 房源状态筛选
        community_name: 小区名称模糊搜索
        min_price: 最低价格
        max_price: 最高价格
        min_area: 最小面积
        max_area: 最大面积
        rooms: 室数量列表（逗号分隔）
        sort_by: 排序字段
        sort_order: 排序方向
        page: 页码
        page_size: 每页数量
        db: 数据库会话
    
    Returns:
        PaginatedPropertyResponse: 分页查询结果
    """
    # 解析 rooms 参数
    rooms_list = None
    if rooms:
        try:
            rooms_list = [int(r.strip()) for r in rooms.split(',') if r.strip()]
        except ValueError:
            logger.warning(f"无效的 rooms 参数: {rooms}")

    # 解析多选参数
    def parse_list_param(s: Optional[str]) -> Optional[List[str]]:
        if not s:
            return None
        return [item.strip() for item in s.split(',') if item.strip()]

    districts_list = parse_list_param(districts)
    business_circles_list = parse_list_param(business_circles)
    orientations_list = parse_list_param(orientations)
    floor_levels_list = parse_list_param(floor_levels)
    
    # 执行查询
    service = PropertyQueryService()
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


@router.get("/{id}", response_model=PropertyDetailResponse)
async def get_property_detail(id: int, db: Session = Depends(get_db)):
    property_obj = db.query(PropertyCurrent).filter(
        PropertyCurrent.id == id,
        PropertyCurrent.is_active == True
    ).first()
    if not property_obj:
        raise HTTPException(status_code=404, detail="房源不存在")

    community = db.query(Community).filter(Community.id == property_obj.community_id).first()
    if not community:
        raise HTTPException(status_code=404, detail="关联小区不存在")

    return PropertyDetailResponse.from_orm_with_calculations(property_obj, community)


@router.get("/export")
async def export_properties(
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
    db: Session = Depends(get_db)
):
    """
    导出房源数据为 CSV 文件
    
    使用与查询接口相同的筛选和排序参数，但移除分页限制，导出所有匹配的记录
    
    Args:
        status: 房源状态筛选
        community_name: 小区名称模糊搜索
        min_price: 最低价格
        max_price: 最高价格
        min_area: 最小面积
        max_area: 最大面积
        rooms: 室数量列表（逗号分隔）
        sort_by: 排序字段
        sort_order: 排序方向
        db: 数据库会话
    
    Returns:
        StreamingResponse: CSV 文件流
    """
    # 解析 rooms 参数
    rooms_list = None
    if rooms:
        try:
            rooms_list = [int(r.strip()) for r in rooms.split(',') if r.strip()]
        except ValueError:
            logger.warning(f"无效的 rooms 参数: {rooms}")
    
    # 执行查询（无分页）
    service = PropertyQueryService()
    def parse_list_param(s: Optional[str]) -> Optional[List[str]]:
        if not s:
            return None
        return [item.strip() for item in s.split(',') if item.strip()]

    districts_list = parse_list_param(districts)
    business_circles_list = parse_list_param(business_circles)
    orientations_list = parse_list_param(orientations)
    floor_levels_list = parse_list_param(floor_levels)

    properties = service.query_properties_for_export(
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
        sort_order=sort_order
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
    from datetime import datetime as dt
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
