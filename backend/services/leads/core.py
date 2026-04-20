"""
线索核心服务
负责线索的创建、更新、删除，组合查询和关联服务
"""
from datetime import datetime
from typing import Optional, Dict, Any
import uuid

from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.lead import Lead
from schemas.lead import LeadCreate, LeadUpdate
from .internal import LeadQueryService, LeadPriceService


class LeadService:
    """
    线索核心业务服务

    负责线索的全生命周期管理，采用组件化设计，内部组合使用各子服务模块。

    Attributes:
        db: SQLAlchemy数据库会话
        query_service: 查询服务组件
        price_service: 价格服务组件
    """

    def __init__(self, db: Session):
        """
        初始化线索业务服务

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db
        self.query_service = LeadQueryService(db)
        self.price_service = LeadPriceService(db)

    def create_lead(self, lead_data: LeadCreate, creator_id: str) -> Lead:
        """
        创建线索

        Args:
            lead_data: 线索创建数据
            creator_id: 创建人ID

        Returns:
            创建成功的线索对象
        """
        db_lead = Lead(
            **lead_data.model_dump(),
            id=str(uuid.uuid4()),
            creator_id=creator_id,
        )
        self.db.add(db_lead)

        # 如果有总价，自动记录初始价格历史
        self.price_service.create_initial_record(
            lead_id=db_lead.id,
            price=lead_data.total_price,
            created_by_id=creator_id,
        )

        self.db.commit()
        self.db.refresh(db_lead)
        return db_lead

    def get_lead(self, lead_id: str) -> Optional[Lead]:
        """
        获取单个线索详情

        Args:
            lead_id: 线索ID

        Returns:
            线索对象，不存在时返回None
        """
        return self.query_service.get_by_id(lead_id)

    def get_lead_or_404(self, lead_id: str) -> Lead:
        """
        获取线索，不存在时抛出404错误

        Args:
            lead_id: 线索ID

        Returns:
            线索对象

        Raises:
            HTTPException: 404 当线索不存在时
        """
        lead = self.get_lead(lead_id)
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")
        return lead

    def get_leads(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        statuses: Optional[list] = None,
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
        return self.query_service.get_list(
            page=page,
            page_size=page_size,
            search=search,
            statuses=statuses,
            district=district,
            creator_id=creator_id,
            layout=layout,
            floor=floor,
        )

    def update_lead(self, lead_id: str, update_data: LeadUpdate, updater_id: str) -> Lead:
        """
        更新线索信息

        Args:
            lead_id: 线索ID
            update_data: 更新数据
            updater_id: 更新人ID

        Returns:
            更新后的线索对象

        Raises:
            HTTPException: 404 当线索不存在时
        """
        lead = self.get_lead_or_404(lead_id)
        update_dict = update_data.model_dump(exclude_unset=True)

        # 价格更新时记录历史
        new_price = update_dict.get("total_price")
        if new_price is not None and new_price != float(lead.total_price or 0):
            self.price_service.create_initial_record(
                lead_id=lead.id,
                price=new_price,
                created_by_id=updater_id,
            )

        for field, value in update_dict.items():
            setattr(lead, field, value)

        lead.updated_at = datetime.now()
        self.db.add(lead)
        self.db.commit()
        self.db.refresh(lead)
        return lead

    def delete_lead(self, lead_id: str) -> None:
        """
        删除线索

        Args:
            lead_id: 线索ID

        Raises:
            HTTPException: 404 当线索不存在时
        """
        lead = self.get_lead_or_404(lead_id)
        self.db.delete(lead)
        self.db.commit()
