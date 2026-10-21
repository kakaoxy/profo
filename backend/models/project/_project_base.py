"""项目主表核心模型."""

from datetime import date
from decimal import Decimal

from sqlalchemy import BigInteger, Boolean, Date, Index, Numeric, String
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel, BusinessForm, ProjectStatus, RenovationStage, SettlementStatus


class Project(BaseModel):
    """项目主表 - 仅保留核心基础信息."""

    __tablename__ = "projects"

    name: Mapped[str] = mapped_column(String(700), nullable=False, comment="项目名称(自动生成:小区名称+地址)")
    community_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="小区ID")
    community_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="小区名称")
    address: Mapped[str] = mapped_column(String(500), nullable=False, comment="物业地址")

    # ===== 楼盘字典关联（SRS §8 / R1，v1.9）=====
    building_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, comment="字典楼栋ID(bd_buildings，可空)")
    room_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, comment="字典户室ID(bd_rooms，可空)")
    # 字典关联状态机（§6.2）：manual/linked/pending/rejected
    dict_status: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="字典关联状态: linked/manual/pending/rejected(未关联为 manual)",
    )

    project_manager_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="项目负责人ID")

    area: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True, comment="产证面积(m²)")
    layout: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="户型(展示用)")
    orientation: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="朝向")
    floor_info: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="楼层信息(如:5/28层)")
    electricity_account: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="电表户号")
    water_account: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="水表户号")
    gas_account: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="煤气户号")

    status: Mapped[ProjectStatus] = mapped_column(
        SQLEnum(ProjectStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ProjectStatus.SIGNING,
        comment="项目状态",
    )
    renovation_stage: Mapped[RenovationStage | None] = mapped_column(
        SQLEnum(RenovationStage, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        comment="改造子阶段",
    )

    business_form: Mapped[BusinessForm | None] = mapped_column(
        SQLEnum(BusinessForm, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        default=None,
        comment="业务形式",
    )
    commission_start_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        default=None,
        comment="委托开始日期",
    )
    commission_end_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        default=None,
        comment="委托结束日期",
    )

    finance_settlement_status: Mapped[SettlementStatus] = mapped_column(
        SQLEnum(SettlementStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=SettlementStatus.UNSETTLED,
        comment="项目账本结算状态",
    )
    finance_settled_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        default=None,
        comment="项目账本结算日期",
    )
    finance_settled_note: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        default=None,
        comment="项目账本结算说明",
    )

    # ===== 归档标记（独立于 ProjectStatus 生命周期状态机）=====
    # 归档后所有项目写接口 400（含更新/状态流转/文书/装修/销售/删除），需反归档恢复可写。
    is_archived: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
        comment="项目归档标记(归档后全量锁定写操作)",
    )
    archived_at: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
        default=None,
        comment="归档日期(业务口径,弹窗必填)",
    )
    archived_note: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True,
        default=None,
        comment="归档说明",
    )

    key_note: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        default=None,
        comment="带看注意事项(房源级,实时展示于经纪人钥匙分享页中部)",
    )

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_project_status", "status"),
        Index("idx_project_deleted", "is_deleted"),
        Index("idx_project_manager", "project_manager_id"),
        Index("idx_project_community", "community_id"),
        Index("idx_project_business_form", "business_form"),
    )

    def __init__(self, **kwargs: object) -> None:
        super().__init__(**kwargs)
        if not self.name or self.name == "未命名项目":
            self.name = self.generate_name()

    def generate_name(self) -> str:
        """自动生成项目名称: 小区名称 + 地址."""
        parts = []
        if self.community_name:
            parts.append(self.community_name)
        if self.address:
            parts.append(self.address)
        return " - ".join(parts) if parts else "未命名项目"
