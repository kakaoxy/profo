"""
装修信息模型
"""
from sqlalchemy import Column, String, Numeric, DateTime, Text, Boolean, ForeignKey, Index, JSON

from ..common.base import BaseModel


class ProjectRenovation(BaseModel):
    """装修信息表"""
    __tablename__ = "project_renovations"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, unique=True, comment="项目ID")

    renovation_company = Column(String(200), nullable=True, comment="合作装修公司")

    contract_start_date = Column(DateTime, nullable=True, comment="合同约定进场时间")
    contract_end_date = Column(DateTime, nullable=True, comment="合同约定竣工交房时间")

    actual_start_date = Column(DateTime, nullable=True, comment="实际开工时间")
    actual_end_date = Column(DateTime, nullable=True, comment="实际竣工时间")

    hard_contract_amount = Column(Numeric(15, 2), nullable=True, comment="硬装合同总金额")

    payment_node_1 = Column(String(100), nullable=True, comment="第一笔款项支付节点")
    payment_ratio_1 = Column(Numeric(6, 4), nullable=True, comment="第一笔款项支付比例(支持小数点后4位)")
    payment_node_2 = Column(String(100), nullable=True, comment="第二笔款项支付节点")
    payment_ratio_2 = Column(Numeric(6, 4), nullable=True, comment="第二笔款项支付比例(支持小数点后4位)")
    payment_node_3 = Column(String(100), nullable=True, comment="第三笔款项支付节点")
    payment_ratio_3 = Column(Numeric(6, 4), nullable=True, comment="第三笔款项支付比例(支持小数点后4位)")
    payment_node_4 = Column(String(100), nullable=True, comment="第四笔款项支付节点")
    payment_ratio_4 = Column(Numeric(6, 4), nullable=True, comment="第四笔款项支付比例(支持小数点后4位)")

    soft_budget = Column(Numeric(15, 2), nullable=True, comment="软装预算金额")
    soft_actual_cost = Column(Numeric(15, 2), nullable=True, comment="软装实际发生成本")
    soft_detail_attachment = Column(String(500), nullable=True, comment="软装明细附件")

    design_fee = Column(Numeric(15, 2), nullable=True, comment="设计费用")
    demolition_fee = Column(Numeric(15, 2), nullable=True, comment="拆旧费用")
    garbage_fee = Column(Numeric(15, 2), nullable=True, comment="垃圾清运费用")
    other_extra_fee = Column(Numeric(15, 2), nullable=True, comment="其他额外费用")
    other_fee_reason = Column(Text, nullable=True, comment="其他费用原因")

    stage_completed_dates = Column(JSON, nullable=True, comment="各阶段完成日期记录，格式: {stage: date_string}")

    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_renovation_project", "project_id"),
    )


class RenovationPhoto(BaseModel):
    """改造阶段照片表"""
    __tablename__ = "renovation_photos"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")
    renovation_id = Column(String(36), ForeignKey("project_renovations.id"), nullable=True, comment="装修记录ID")

    stage = Column(String(20), nullable=False, comment="改造阶段")
    url = Column(String(500), nullable=False, comment="图片URL")
    filename = Column(String(200), nullable=True, comment="文件名")
    description = Column(Text, nullable=True, comment="描述")

    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")