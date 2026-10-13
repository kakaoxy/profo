"""楼盘字典四级数据模型（SRS §8 / R1，v1.9）.

包含：
- ``BdBuilding``：字典第二级楼栋（building_no 保留原始串，uq(community_id, building_no)）
- ``BdRoom``：字典第三级户室（room_no 原始串；floor 可空解析，uq(building_id, room_no)）
- ``BdPendingEntry``：审核池条目（kind 三类；uq_pending_open partial unique 防并发重名；
  parent_kind/parent_id 父子层级支撑拓扑审核 BR-28）
- ``BdPendingReference``：pending 引用账本（同一 pending 可被多张业务单据引用，
  uq(biz_type, biz_id, field) 保证单据单字段仅一条 open 引用）

楼层（Floor）为呈现层字段（由 room_no 前两位解析），非独立实体。
坐标一律 BD-09 原样落库（BR-18）。
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    BigInteger,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    func,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.common.base import Base


class BdEntryKind(str, enum.Enum):
    """审核池条目类型（FR-11：kind = community | building | room）."""

    COMMUNITY = "community"
    BUILDING = "building"
    ROOM = "room"


class BdEntryStatus(str, enum.Enum):
    """审核池条目状态机（SRS §6.1，终态不可逆）."""

    PENDING = "pending"  # 待审核
    CREATED = "created"  # 通过新增（字典落库）
    MERGED = "merged"  # 合并现有（改指现有目标）
    REJECTED = "rejected"  # 驳回


class BdReferenceStatus(str, enum.Enum):
    """引用记录状态（回填任务依据）."""

    OPEN = "open"  # 待回填
    RESOLVED = "resolved"  # 已回填


class BdBuilding(Base):
    """字典楼栋表（SRS §8 bd_buildings）.

    - building_no 保留原始串（``01``/``100``/``201乙``/``惠园路2000弄01``，BR-03 不做数字化抽取）
    - lng/lat 为首户坐标（BD-09 原样落库，约 97% 楼栋首户带坐标）
    - room_count 冗余计数（导入/补录时维护）
    """

    __tablename__ = "bd_buildings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    community_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="所属小区ID(逻辑外键)")
    building_no: Mapped[str] = mapped_column(String(100), nullable=False, comment="楼栋号(原始串，如 01/100/201乙)")
    lng: Mapped[float | None] = mapped_column(Float, nullable=True, comment="首户经度(BD-09，可空)")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True, comment="首户纬度(BD-09，可空)")
    room_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="户室数(冗余计数)")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="更新时间",
    )

    rooms = relationship(
        "BdRoom",
        primaryjoin="BdBuilding.id == foreign(BdRoom.building_id)",
        lazy="selectin",
    )

    __table_args__ = (
        # uq(community_id, building_no)：BR-09 唯一约束（批量跳过/单笔拦截依据）
        Index("uq_bd_building_no", "community_id", "building_no", unique=True),
        Index("idx_bd_building_community", "community_id"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<BdBuilding(id={self.id}, community_id={self.community_id}, building_no='{self.building_no}')>"


class BdRoom(Base):
    """字典户室表（SRS §8 bd_rooms，约 733 万行）.

    - room_no 保留原始串（非标户室号如 ``0233-1`` 原样保留，BR-02）
    - floor 可空解析字段：``0401`` → 4；非标 → NULL（归「未分层」组置底）
    """

    __tablename__ = "bd_rooms"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    building_id: Mapped[int] = mapped_column(BigInteger, nullable=False, comment="所属楼栋ID(逻辑外键)")
    room_no: Mapped[str] = mapped_column(String(100), nullable=False, comment="户室号(原始串，如 0401/0233-1)")
    floor: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="楼层(户室号前两位解析，非标 NULL)")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="创建时间",
    )

    __table_args__ = (
        # uq(building_id, room_no)：BR-09 唯一约束（导入幂等 upsert 依据）
        Index("uq_bd_room_no", "building_id", "room_no", unique=True),
        Index("idx_bd_room_building_floor", "building_id", "floor"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<BdRoom(id={self.id}, building_id={self.building_id}, room_no='{self.room_no}')>"


class BdPendingEntry(Base):
    """审核池条目表（SRS §8 bd_pending_entries）.

    - kind：community/building/room 三类
    - payload：提交内容 JSON 快照（楼栋/楼层/户室号 或 小区表单字段）
    - source_type/source_id：创建来源冗余（v1.7 泛化：project/lead/marketing/property）
    - normalized_name + parent_kind + parent_id（v1.8 FR-19）：同名唯一 + 父子层级
      （parent_id 指向字典实表 id 或父级 pending 条目 id；community 的 parent_id 为 NULL）
    - resolved_target_id：merge/reject 时改指的现有目标 id
    - partial unique ``uq_pending_open``：同 pending 状态下 (kind, parent_id, normalized_name)
      全局唯一，杜绝并发重复提交（BR-26）

    状态机（SRS §6.1）：pending → created/merged/rejected，终态不可逆。
    """

    __tablename__ = "bd_pending_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    kind: Mapped[BdEntryKind] = mapped_column(
        SQLEnum(BdEntryKind, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        comment="条目类型: community/building/room",
    )
    # 归属小区：community 条目为 NULL（自身即小区）；building/room 条目为所属小区
    community_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, comment="归属小区ID(community 条目为 NULL)"
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="提交内容名称(楼栋号/户室号/小区名)")
    normalized_name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
        comment="归一化名称(去空白/全半角归一，uq_pending_open 依据)",
    )
    # 提交内容 JSON 快照（小区表单字段或楼栋/户室明细）
    payload: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="提交内容快照(小区表单字段/楼栋/户室明细)",
    )
    # 父子层级（FR-19/BR-28）：building 挂 community，room 挂 building；
    # 父级也是待审时挂父级 pending 条目 id
    parent_kind: Mapped[BdEntryKind | None] = mapped_column(
        SQLEnum(BdEntryKind, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        comment="父级类型(community/building)，community 条目为 NULL",
    )
    parent_id: Mapped[int | None] = mapped_column(
        BigInteger,
        nullable=True,
        comment="父级ID(字典实表 id 或父级 pending 条目 id)",
    )
    # 创建来源冗余（v1.7 泛化）
    source_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="创建来源类型(project/lead/marketing/property/admin)"
    )
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="创建来源单据ID")
    submitted_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="提交人用户ID")
    status: Mapped[BdEntryStatus] = mapped_column(
        SQLEnum(BdEntryStatus, values_callable=lambda x: [e.value for e in x]),
        default=BdEntryStatus.PENDING,
        nullable=False,
        comment="状态: pending/created/merged/rejected(终态不可逆)",
    )
    resolved_target_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        comment="resolve 目标id(merge/reject 改指现有目标；create 时为落库后的字典行id)",
    )
    resolved_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="审核处理人用户ID")
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="审核处理时间")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="提交时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="更新时间",
    )

    references = relationship(
        "BdPendingReference",
        primaryjoin="BdPendingEntry.id == foreign(BdPendingReference.pending_id)",
        lazy="selectin",
    )

    __table_args__ = (
        # 同名并发唯一（FR-19/BR-26）：仅约束 open（pending）行，终态行允许同名重新提交。
        # community 条目 parent_id 为 NULL（SRS §8），而 PG 唯一索引将 NULL 视为 distinct，
        # 会令 (community, NULL, name) 永不冲突 —— 故用 COALESCE(parent_id, 0) 表达式归一。
        Index(
            "uq_pending_open",
            "kind",
            func.coalesce(parent_id, 0),
            "normalized_name",
            unique=True,
            postgresql_where="status = 'pending'",
        ),
        Index("idx_bd_pending_status_created", "status", "created_at"),
        Index("idx_bd_pending_community", "community_id"),
        Index("idx_bd_pending_parent", "parent_kind", "parent_id"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<BdPendingEntry(id={self.id}, kind='{self.kind.value if self.kind else None}', name='{self.name}')>"


class BdPendingReference(Base):
    """审核池引用账本表（SRS §8 bd_pending_references，v1.8）.

    同一 pending 条目可被多张业务单据引用；首位提交者另在 entry 上冗余
    source_type/source_id。create/merge/reject 后按此表批量回填/改指（BR-13）。
    """

    __tablename__ = "bd_pending_references"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    pending_id: Mapped[int] = mapped_column(BigInteger, nullable=False, comment="审核池条目ID(逻辑外键)")
    biz_type: Mapped[str] = mapped_column(
        String(20), nullable=False, comment="引用单据类型(project/lead/marketing/property)"
    )
    biz_id: Mapped[str] = mapped_column(String(64), nullable=False, comment="引用单据ID")
    field: Mapped[str] = mapped_column(String(30), nullable=False, comment="回填字段(community_id/building_id/room_id)")
    status: Mapped[BdReferenceStatus] = mapped_column(
        SQLEnum(BdReferenceStatus, values_callable=lambda x: [e.value for e in x]),
        default=BdReferenceStatus.OPEN,
        nullable=False,
        comment="引用状态: open(待回填)/resolved(已回填)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="创建时间",
    )

    __table_args__ = (
        # uq(biz_type, biz_id, field)：同一单据同一字段仅一条引用（幂等复用依据）
        Index("uq_bd_pending_ref_biz", "biz_type", "biz_id", "field", unique=True),
        Index("idx_bd_pending_ref_pending", "pending_id", "status"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<BdPendingReference(id={self.id}, pending_id={self.pending_id}, biz_type='{self.biz_type}')>"
