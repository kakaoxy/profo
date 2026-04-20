"""
房源查询服务层
处理房源数据的查询、筛选、排序逻辑
"""
from typing import Optional, List
import logging

from sqlalchemy.orm import Session, selectinload
from sqlalchemy import func

from models import PropertyCurrent, Community
from schemas import PropertyResponse, PaginatedPropertyResponse
from utils.query_params import PropertyExportParams
from .filters import apply_filters
from .sorting import apply_sorting

logger = logging.getLogger(__name__)


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
            rooms_gte: 最少室数量（用于"5室以上"）
            sort_by: 排序字段
            sort_order: 排序方向 ("asc" | "desc")
            page: 页码
            page_size: 每页数量

        Returns:
            PaginatedPropertyResponse: 分页查询结果
        """
        # 构建基础查询 - 使用 selectinload 优化关联查询
        query = db.query(PropertyCurrent, Community).join(
            Community,
            PropertyCurrent.community_id == Community.id
        ).filter(PropertyCurrent.is_active.is_(True))

        # 关键优化：使用selectinload预加载图片
        query = query.options(
            selectinload(PropertyCurrent.property_media)
        )

        # 应用筛选条件
        query = apply_filters(
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
        count_query = query.statement.with_only_columns(func.count()).order_by(None)
        total = db.execute(count_query).scalar()

        # 应用排序
        query = apply_sorting(query, sort_by, sort_order)

        # 应用分页
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)

        # 执行查询
        results = query.all()

        # 转换为响应模型
        items = []
        for property_obj, community in results:
            item = PropertyResponse.from_orm_with_calculations(
                property_obj, community,
                property_obj.property_media  # 传递预加载的图片
            )
            items.append(item)

        logger.info(f"查询完成: 总数={total}, 页码={page}, 每页={page_size}, 返回={len(items)}")

        return PaginatedPropertyResponse(
            total=total,
            page=page,
            page_size=page_size,
            items=items
        )

    def query_properties_for_export(
        self,
        db: Session,
        params: PropertyExportParams
    ) -> List[PropertyResponse]:
        """
        查询房源数据用于导出（无分页限制）

        Args:
            db: 数据库会话
            params: PropertyExportParams 导出参数对象

        Returns:
            List[PropertyResponse]: 房源数据列表
        """
        # 构建基础查询
        query = db.query(PropertyCurrent, Community).join(
            Community,
            PropertyCurrent.community_id == Community.id
        ).filter(PropertyCurrent.is_active.is_(True))

        # 关键优化：使用selectinload预加载图片
        query = query.options(
            selectinload(PropertyCurrent.property_media)
        )

        # 应用筛选条件
        query = apply_filters(
            query,
            status=params.status,
            community_name=params.community_name,
            districts=params.districts,
            business_circles=params.business_circles,
            orientations=params.orientations,
            floor_levels=params.floor_levels,
            min_price=params.min_price,
            max_price=params.max_price,
            min_area=params.min_area,
            max_area=params.max_area,
            rooms=params.rooms,
            rooms_gte=params.rooms_gte
        )

        # 应用排序
        query = apply_sorting(query, params.sort_by, params.sort_order)

        # 执行查询（无分页限制）
        results = query.all()

        # 转换为响应模型
        items = []
        for property_obj, community in results:
            item = PropertyResponse.from_orm_with_calculations(
                property_obj, community,
                property_obj.property_media  # 传递预加载的图片
            )
            items.append(item)

        logger.info(f"导出查询完成: 总数={len(items)}")
        return items


# 依赖注入工厂函数
def get_property_query_service() -> PropertyQueryService:
    """获取房源查询服务实例"""
    return PropertyQueryService()
