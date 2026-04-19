"""
财务流水模型
"""
from sqlalchemy import Column, String, Numeric, DateTime, Text, ForeignKey, Index

from .base import BaseModel


class FinanceRecord(BaseModel):
    """财务流水明细表（替换cashflow_records）"""
    __tablename__ = "finance_records"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    type = Column(String(20), nullable=False, comment="流水类型：income/expense")
    category = Column(String(50), nullable=False, comment="费用类别")
    amount = Column(Numeric(15, 2), nullable=False, comment="金额(元)")
    record_date = Column(DateTime, nullable=False, comment="发生日期")
    operator_id = Column(String(36), nullable=True, comment="经办人ID")
    remark = Column(Text, nullable=True, comment="备注")

    __table_args__ = (
        Index("idx_finance_project_date", "project_id", "record_date"),
        Index("idx_finance_type_category", "type", "category"),
    )

    def validate_user_references(self, db) -> None:
        """验证软引用的用户ID是否存在且有效"""
        from .user import User
        if self.operator_id:
            user = db.query(User).filter(
                User.id == self.operator_id,
                User.status == "active"
            ).first()
            if not user:
                raise ValueError(f"无效的经办人ID: {self.operator_id}")