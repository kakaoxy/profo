"""线索评估历史服务组件.

负责评估历史记录的创建和查询，创建时同步更新 Lead.eval_price 与 Lead.updated_at.
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import desc
from sqlalchemy.orm import Session, joinedload

from models.lead import Lead, LeadEvalHistory
from services.system.exceptions import ResourceNotFoundError


class LeadEvalService:
    """线索评估历史服务.

    负责评估历史记录的创建和查询。

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: Session) -> None:
        """初始化评估历史服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def get_evaluations(self, lead_id: str) -> list[LeadEvalHistory]:
        """获取线索评估历史记录.

        Args:
            lead_id: 线索ID

        Returns:
            评估历史记录列表，按评估时间倒序

        """
        return (
            self.db.query(LeadEvalHistory)
            .options(joinedload(LeadEvalHistory.evaluator))
            .filter(LeadEvalHistory.lead_id == lead_id)
            .order_by(desc(LeadEvalHistory.evaluated_at))
            .all()
        )

    def create_evaluation(
        self,
        lead_id: str,
        eval_price: float,
        remark: str | None,
        evaluator_id: str,
    ) -> LeadEvalHistory:
        """创建评估记录，同步更新 Lead.eval_price 与 Lead.updated_at.

        Args:
            lead_id: 线索ID
            eval_price: 评估价格(万)
            remark: 评估备注
            evaluator_id: 评估人ID

        Returns:
            创建的评估记录对象

        Raises:
            ResourceNotFoundError: 当线索不存在时

        """
        lead = (
            self.db.query(Lead)
            .filter(
                Lead.id == lead_id,
                Lead.is_deleted.is_(False),
            )
            .first()
        )
        if not lead:
            msg = "线索不存在"
            raise ResourceNotFoundError(msg)

        rec = LeadEvalHistory(
            id=str(uuid.uuid4()),
            lead_id=lead_id,
            eval_price=Decimal(str(eval_price)),
            remark=remark,
            evaluator_id=evaluator_id,
        )
        self.db.add(rec)

        lead.eval_price = Decimal(str(eval_price))
        lead.updated_at = datetime.now(timezone.utc)
        self.db.add(lead)

        self.db.commit()
        # 重新查询以 eager-load evaluator，避免 LeadEvalHistoryResponse.evaluator_name 触发 lazy load
        return (
            self.db.query(LeadEvalHistory)
            .options(joinedload(LeadEvalHistory.evaluator))
            .filter(LeadEvalHistory.id == rec.id)
            .one()
        )
