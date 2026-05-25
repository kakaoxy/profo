"""线索跟进记录服务组件.

负责跟进记录的创建和查询.
"""

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import Session

from models.common import FollowUpMethod
from models.lead import Lead, LeadFollowUp


class LeadFollowUpService:
    """线索跟进记录服务.

    负责跟进记录的创建和查询。

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: Session) -> None:
        """初始化跟进记录服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def create_follow_up(
        self,
        lead_id: str,
        method: FollowUpMethod,
        content: str,
        created_by_id: str,
    ) -> LeadFollowUp:
        """创建跟进记录.

        Args:
            lead_id: 线索ID
            method: 跟进方式
            content: 跟进内容
            created_by_id: 跟进人ID

        Returns:
            创建的跟进记录对象

        Raises:
            HTTPException: 404 当线索不存在时

        """
        # 检查线索是否存在
        lead = self.db.query(Lead).filter(Lead.id == lead_id).first()
        if not lead:
            raise HTTPException(status_code=404, detail="Lead not found")

        db_follow = LeadFollowUp(
            id=str(uuid.uuid4()),
            lead_id=lead_id,
            method=method,
            content=content,
            created_by_id=created_by_id,
        )
        self.db.add(db_follow)

        # 自动更新线索的最后跟进时间
        lead.last_follow_up_at = datetime.now(timezone.utc)
        self.db.add(lead)

        self.db.commit()
        self.db.refresh(db_follow)
        return db_follow

    def get_follow_ups(self, lead_id: str) -> list[LeadFollowUp]:
        """获取线索的跟进记录列表.

        Args:
            lead_id: 线索ID

        Returns:
            跟进记录列表，按跟进时间倒序

        """
        return (
            self.db.query(LeadFollowUp)
            .filter(LeadFollowUp.lead_id == lead_id)
            .order_by(desc(LeadFollowUp.followed_at))
            .all()
        )
