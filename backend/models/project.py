"""
项目管理相关模型
"""
from sqlalchemy import Column, String, Float, DateTime, Text, ForeignKey, Integer, Numeric, Index, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.sqlite import JSON
from datetime import datetime

from .base import BaseModel, ProjectStatus, RenovationStage, RecordType


class Project(BaseModel):
    """项目主表 - 仅保留核心基础信息"""
    __tablename__ = "projects"

    # 基本信息
    name = Column(String(700), nullable=True, comment="项目名称(自动生成:小区名称+地址)")
    community_name = Column(String(200), nullable=True, comment="小区名称")
    address = Column(String(500), nullable=True, comment="物业地址")

    def generate_name(self) -> str:
        """自动生成项目名称: 小区名称 + 地址"""
        parts = []
        if self.community_name:
            parts.append(self.community_name)
        if self.address:
            parts.append(self.address)
        return " - ".join(parts) if parts else "未命名项目"

    # 物业信息
    area = Column(Numeric(10, 2), nullable=True, comment="产证面积(m²)")
    layout = Column(String(50), nullable=True, comment="户型(展示用)")
    orientation = Column(String(50), nullable=True, comment="朝向")

    # 项目状态
    status = Column(String(20), nullable=False, default=ProjectStatus.SIGNING.value, comment="项目状态")
    renovation_stage = Column(String(20), comment="改造子阶段")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 时间记录
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # 关联关系
    contract = relationship("ProjectContract", back_populates="project", uselist=False, cascade="all, delete-orphan")
    owners = relationship("ProjectOwner", back_populates="project", cascade="all, delete-orphan")
    sale = relationship("ProjectSale", back_populates="project", uselist=False, cascade="all, delete-orphan")
    follow_ups = relationship("ProjectFollowUp", back_populates="project", cascade="all, delete-orphan")
    evaluations = relationship("ProjectEvaluation", back_populates="project", cascade="all, delete-orphan")
    interactions = relationship("ProjectInteraction", back_populates="project", cascade="all, delete-orphan")
    finance_records = relationship("FinanceRecord", back_populates="project", cascade="all, delete-orphan")
    status_logs = relationship("ProjectStatusLog", back_populates="project", cascade="all, delete-orphan")
    renovation = relationship("ProjectRenovation", back_populates="project", uselist=False, cascade="all, delete-orphan")
    renovation_photos = relationship("RenovationPhoto", back_populates="project", cascade="all, delete-orphan")

    # 索引
    __table_args__ = (
        # 项目状态查询索引
        Index("idx_project_status", "status"),
        # 逻辑删除索引
        Index("idx_project_deleted", "is_deleted"),
    )


class ProjectContract(BaseModel):
    """签约合同表"""
    __tablename__ = "project_contracts"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 合同信息
    contract_no = Column(String(100), unique=True, nullable=True, comment="合同编号")
    signing_price = Column(Numeric(15, 2), nullable=True, comment="签约价格(万)")
    signing_date = Column(DateTime, nullable=True, comment="签约日期")
    signing_period = Column(Integer, nullable=True, comment="合同周期(天)")
    extension_period = Column(Integer, nullable=True, comment="顺延期(天)")
    extension_rent = Column(Numeric(15, 2), nullable=True, comment="顺延期租金(元/月)")
    cost_assumption = Column(String(50), nullable=True, comment="税费及佣金承担方")
    planned_handover_date = Column(DateTime, nullable=True, comment="业主交房时间")
    other_agreements = Column(Text, nullable=True, comment="其他约定条款")
    signing_materials = Column(JSON, nullable=True, comment="合同附件URLs")

    # 合同状态
    contract_status = Column(String(20), nullable=False, default="生效", comment="合同状态")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 关联关系
    project = relationship("Project", back_populates="contract")

    # 索引
    __table_args__ = (
        Index("idx_contract_project", "project_id"),
        Index("idx_contract_status", "contract_status"),
    )


class ProjectOwner(BaseModel):
    """业主信息表"""
    __tablename__ = "project_owners"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 业主信息
    owner_name = Column(String(100), nullable=True, comment="业主姓名")
    owner_phone = Column(String(20), nullable=True, comment="业主联系方式")
    owner_id_card = Column(String(18), nullable=True, comment="业主身份证号")
    relation_type = Column(String(20), nullable=False, default="业主", comment="关系类型")
    owner_info = Column(Text, nullable=True, comment="备注")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 关联关系
    project = relationship("Project", back_populates="owners")

    # 索引
    __table_args__ = (
        Index("idx_owner_project", "project_id"),
    )


class ProjectSale(BaseModel):
    """销售交易表"""
    __tablename__ = "project_sales"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 销售信息
    listing_date = Column(DateTime, nullable=True, comment="上架日期")
    list_price = Column(Numeric(15, 2), nullable=True, comment="挂牌价(万)")
    sold_date = Column(DateTime, nullable=True, comment="成交时间")
    sold_price = Column(Numeric(15, 2), nullable=True, comment="成交价(万)")

    # 销售人员ID（关联人员管理表）
    channel_manager_id = Column(String(36), nullable=True, comment="渠道负责人ID")
    property_agent_id = Column(String(36), nullable=True, comment="房源维护人ID")
    negotiator_id = Column(String(36), nullable=True, comment="联卖谈判人ID")

    # 交易状态
    transaction_status = Column(String(20), nullable=False, default="在售", comment="交易状态")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 关联关系
    project = relationship("Project", back_populates="sale")

    # 索引
    __table_args__ = (
        Index("idx_sale_project", "project_id"),
        Index("idx_sale_status", "transaction_status"),
    )


class ProjectFollowUp(BaseModel):
    """项目跟进记录表"""
    __tablename__ = "project_follow_ups"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 跟进信息
    follow_up_type = Column(String(20), nullable=False, comment="跟进方式")
    content = Column(Text, nullable=True, comment="跟进详情")
    follow_up_at = Column(DateTime, nullable=False, comment="跟进时间")
    follower_id = Column(String(36), nullable=True, comment="跟进人ID")

    # 关联关系
    project = relationship("Project", back_populates="follow_ups")

    # 索引
    __table_args__ = (
        Index("idx_followup_project", "project_id"),
        Index("idx_followup_date", "follow_up_at"),
    )


class ProjectEvaluation(BaseModel):
    """项目评估记录表"""
    __tablename__ = "project_evaluations"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 评估信息
    evaluation_type = Column(String(20), nullable=False, comment="评估类型")
    evaluation_price = Column(Numeric(15, 2), nullable=False, comment="评估价格(万)")
    remark = Column(Text, nullable=True, comment="评估备注")
    evaluator_id = Column(String(36), nullable=True, comment="评估人ID")
    evaluation_at = Column(DateTime, nullable=False, comment="评估时间")

    # 关联关系
    project = relationship("Project", back_populates="evaluations")

    # 索引
    __table_args__ = (
        Index("idx_evaluation_project", "project_id"),
        Index("idx_evaluation_date", "evaluation_at"),
    )


class ProjectInteraction(BaseModel):
    """互动过程明细表（替换sales_records）"""
    __tablename__ = "project_interactions"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 互动信息
    record_type = Column(String(20), nullable=False, comment="互动类型")
    interaction_target = Column(String(100), nullable=True, comment="互动对象")
    content = Column(Text, nullable=True, comment="互动详情")
    interaction_at = Column(DateTime, nullable=False, comment="互动时间")
    operator_id = Column(String(36), nullable=True, comment="操作人ID")

    # 关联关系
    project = relationship("Project", back_populates="interactions")

    # 索引
    __table_args__ = (
        Index("idx_interaction_project", "project_id"),
        Index("idx_interaction_date", "interaction_at"),
        Index("idx_interaction_type", "record_type"),
    )


class FinanceRecord(BaseModel):
    """财务流水明细表（替换cashflow_records）"""
    __tablename__ = "finance_records"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 财务信息
    type = Column(String(20), nullable=False, comment="流水类型：income/expense")
    category = Column(String(50), nullable=False, comment="费用类别")
    amount = Column(Numeric(15, 2), nullable=False, comment="金额(元)")
    record_date = Column(DateTime, nullable=False, comment="发生日期")
    operator_id = Column(String(36), nullable=True, comment="经办人ID")
    remark = Column(Text, nullable=True, comment="备注")

    # 关联关系
    project = relationship("Project", back_populates="finance_records")

    # 索引
    __table_args__ = (
        Index("idx_finance_project_date", "project_id", "record_date"),
        Index("idx_finance_type_category", "type", "category"),
    )


class ProjectStatusLog(BaseModel):
    """项目状态流转日志表"""
    __tablename__ = "project_status_logs"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 状态变更信息
    old_status = Column(String(20), nullable=False, comment="变更前状态")
    new_status = Column(String(20), nullable=False, comment="变更后状态")
    trigger_event = Column(String(100), nullable=True, comment="触发事件")
    operator_id = Column(String(36), nullable=True, comment="操作人ID")
    operate_at = Column(DateTime, nullable=False, comment="变更时间")
    remark = Column(Text, nullable=True, comment="变更说明")

    # 关联关系
    project = relationship("Project", back_populates="status_logs")

    # 索引
    __table_args__ = (
        Index("idx_statuslog_project", "project_id"),
        Index("idx_statuslog_date", "operate_at"),
    )


class ProjectRenovation(BaseModel):
    """装修信息表"""
    __tablename__ = "project_renovations"

    # 外键关联
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    # 装修公司
    renovation_company = Column(String(200), nullable=True, comment="合作装修公司")

    # 合同时间
    contract_start_date = Column(DateTime, nullable=True, comment="合同约定进场时间")
    contract_end_date = Column(DateTime, nullable=True, comment="合同约定竣工交房时间")

    # 实际时间
    actual_start_date = Column(DateTime, nullable=True, comment="实际开工时间")
    actual_end_date = Column(DateTime, nullable=True, comment="实际竣工时间")

    # 硬装费用
    hard_contract_amount = Column(Numeric(15, 2), nullable=True, comment="硬装合同总金额")

    # 支付节点
    payment_node_1 = Column(String(100), nullable=True, comment="第一笔款项支付节点")
    payment_ratio_1 = Column(Numeric(5, 2), nullable=True, comment="第一笔款项支付比例")
    payment_node_2 = Column(String(100), nullable=True, comment="第二笔款项支付节点")
    payment_ratio_2 = Column(Numeric(5, 2), nullable=True, comment="第二笔款项支付比例")
    payment_node_3 = Column(String(100), nullable=True, comment="第三笔款项支付节点")
    payment_ratio_3 = Column(Numeric(5, 2), nullable=True, comment="第三笔款项支付比例")
    payment_node_4 = Column(String(100), nullable=True, comment="第四笔款项支付节点")
    payment_ratio_4 = Column(Numeric(5, 2), nullable=True, comment="第四笔款项支付比例")

    # 软装费用
    soft_budget = Column(Numeric(15, 2), nullable=True, comment="软装预算金额")
    soft_actual_cost = Column(Numeric(15, 2), nullable=True, comment="软装实际发生成本")
    soft_detail_attachment = Column(String(500), nullable=True, comment="软装明细附件")

    # 其他费用
    design_fee = Column(Numeric(15, 2), nullable=True, comment="设计费用")
    demolition_fee = Column(Numeric(15, 2), nullable=True, comment="拆旧费用")
    garbage_fee = Column(Numeric(15, 2), nullable=True, comment="垃圾清运费用")
    other_extra_fee = Column(Numeric(15, 2), nullable=True, comment="其他额外费用")
    other_fee_reason = Column(Text, nullable=True, comment="其他费用原因")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 关联关系
    project = relationship("Project", back_populates="renovation")
    photos = relationship("RenovationPhoto", back_populates="renovation", cascade="all, delete-orphan")

    # 索引
    __table_args__ = (
        Index("idx_renovation_project", "project_id"),
    )


class RenovationPhoto(BaseModel):
    """改造阶段照片表"""
    __tablename__ = "renovation_photos"

    # 外键关联 - 改为关联project_renovations表
    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")
    renovation_id = Column(String(36), ForeignKey("project_renovations.id"), nullable=True, comment="装修记录ID")

    # 基本信息
    stage = Column(String(20), nullable=False, comment="改造阶段")
    url = Column(String(500), nullable=False, comment="图片URL")
    filename = Column(String(200), nullable=True, comment="文件名")
    description = Column(Text, nullable=True, comment="描述")

    deleted_at = Column(DateTime, nullable=True, default=None, comment="软删除时间")

    # 关联关系
    project = relationship("Project", back_populates="renovation_photos")
    renovation = relationship("ProjectRenovation", back_populates="photos")
