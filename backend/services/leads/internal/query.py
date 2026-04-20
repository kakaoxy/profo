"""
线索查询服务组件
负责线索的查询操作
"""
from typing import Optional, Dict, Any, List

from sqlalchemy.orm import Session, joinedload, noload
from sqlalchemy import desc

from models.lead import Lead
from models.common import LeadStatus


class LeadQueryService:
    """
    线索查询服务

    负责线索的列表查询和单条查询。

    Attributes:
        db: SQLAlchemy数据库会话
    """

    def __init__(self, db: Session):
        """
        初始化查询服务

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db

    def get_by_id(self, lead_id: str, load_creator: bool = True) -> Optional[Lead]:
        """
        根据ID获取线索

        Args:
            lead_id: 线索ID
            load_creator: 是否加载创建者关系

        Returns:
            线索对象，不存在时返回None
        """
        query = self.db.query(Lead)
        if load_creator:
            query = query.options(joinedload(Lead.creator))
        return query.filter(Lead.id == lead_id).first()

    def get_list(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        statuses: Optional[List[LeadStatus]] = None,
        district: Optional[str] = None,
        creator_id: Optional[str] = None,
        layout: Optional[str] = None,
        floor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        获取线索列表（分页）

        Args:
            page: 页码
            page_size: 每页数量
            search: 小区名称搜索
            statuses: 状态筛选
            district: 行政区筛选
            creator_id: 创建人筛选
            layout: 户型筛选
            floor: 楼层筛选

        Returns:
            包含线索列表和分页信息的字典
        """
        # 构建查询，优化关系加载
        query = self.db.query(Lead).options(
            joinedload(Lead.creator),
            noload(Lead.auditor),
            noload(Lead.follow_ups),
            noload(Lead.price_history),
        )

        # 应用过滤条件
        if search:
            query = query.filter(Lead.community_name.contains(search))
        if statuses:
            query = query.filter(Lead.status.in_(statuses))
        if district:
            query = query.filter(Lead.district.contains(district))
        if creator_id:
            query = query.filter(Lead.creator_id == creator_id)
        if layout:
            query = query.filter(Lead.layout.contains(layout))
        if floor:
            query = query.filter(Lead.floor_info.contains(floor))

        # 计算总数和获取分页数据
        total = query.count()
        items = (
            query.order_by(desc(Lead.created_at))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
