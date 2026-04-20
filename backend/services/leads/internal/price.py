"""
线索价格历史服务组件
负责价格历史记录的创建和查询
"""
from typing import Optional, List
import uuid

from sqlalchemy.orm import Session
from sqlalchemy import desc
from fastapi import HTTPException

from models.lead import Lead, LeadPriceHistory


class LeadPriceService:
    """
    线索价格历史服务

    负责价格历史记录的创建和查询。

    Attributes:
        db: SQLAlchemy数据库会话
    """

    def __init__(self, db: Session):
        """
        初始化价格历史服务

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db

    def get_by_lead(self, lead_id: str) -> List[LeadPriceHistory]:
        """
        获取线索价格历史记录

        Args:
            lead_id: 线索ID

        Returns:
            价格历史记录列表，按记录时间倒序
        """
        return (
            self.db.query(LeadPriceHistory)
            .filter(LeadPriceHistory.lead_id == lead_id)
            .order_by(desc(LeadPriceHistory.recorded_at))
            .all()
        )

    def add_record(
        self,
        lead_id: str,
        price: float,
        remark: Optional[str],
        created_by_id: str,
    ) -> LeadPriceHistory:
        """
        添加价格记录，同时更新线索的当前总价

        Args:
            lead_id: 线索ID
            price: 价格
            remark: 备注
            created_by_id: 记录人ID

        Returns:
            创建的价格记录对象

        Raises:
            HTTPException: 404 当线索不存在时
        """
        lead = self.db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        # 创建价格记录
        rec = LeadPriceHistory(
            id=str(uuid.uuid4()),
            lead_id=lead_id,
            price=price,
            remark=remark,
            created_by_id=created_by_id,
        )
        self.db.add(rec)

        # 更新当前价格
        lead.total_price = price
        self.db.add(lead)

        self.db.commit()
        self.db.refresh(rec)
        return rec

    def create_initial_record(
        self,
        lead_id: str,
        price: float,
        created_by_id: str,
    ) -> Optional[LeadPriceHistory]:
        """
        创建初始价格记录

        Args:
            lead_id: 线索ID
            price: 价格
            created_by_id: 创建人ID

        Returns:
            创建的价格记录对象，如果price为None则返回None
        """
        if not price:
            return None

        rec = LeadPriceHistory(
            id=str(uuid.uuid4()),
            lead_id=lead_id,
            price=price,
            remark="Initial Creation",
            created_by_id=created_by_id,
        )
        self.db.add(rec)
        return rec
