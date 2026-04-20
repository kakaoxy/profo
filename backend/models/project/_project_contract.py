"""
签约合同模型
"""
from sqlalchemy import Column, String, Integer, Numeric, DateTime, Text, Boolean, ForeignKey, Index, JSON

from ..common.base import BaseModel


class ProjectContract(BaseModel):
    """签约合同表"""
    __tablename__ = "project_contracts"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, unique=True, comment="项目ID")

    contract_no = Column(String(100), nullable=True, comment="合同编号")
    signing_price = Column(Numeric(15, 2), nullable=True, comment="签约价格(万)")
    signing_date = Column(DateTime, nullable=True, comment="签约日期")
    signing_period = Column(Integer, nullable=True, comment="合同周期(天)")
    extension_period = Column(Integer, nullable=True, comment="顺延期(天)")
    extension_rent = Column(Numeric(15, 2), nullable=True, comment="顺延期租金(元/月)")
    cost_assumption = Column(String(50), nullable=True, comment="税费及佣金承担方")
    planned_handover_date = Column(DateTime, nullable=True, comment="业主交房时间")
    other_agreements = Column(Text, nullable=True, comment="其他约定条款")
    signing_materials = Column(JSON, nullable=True, comment="合同附件URLs")

    contract_status = Column(String(20), nullable=False, default="生效", comment="合同状态")

    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_contract_project", "project_id"),
        Index("idx_contract_status", "contract_status"),
        Index("idx_contract_no", "contract_no", unique=True),
    )