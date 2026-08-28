"""线索查询服务组件.

负责线索的查询操作.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, desc, func, or_, select
from sqlalchemy.orm import Session, joinedload, noload, selectinload

from models.common import LeadStatus
from models.lead import Lead
from models.user import User
from settings import settings
from utils.formatters import escape_like


class LeadQueryService:
    """线索查询服务.

    负责线索的列表查询和单条查询。

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: Session) -> None:
        """初始化查询服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def get_by_id(self, lead_id: str, *, load_creator: bool = True, for_update: bool = False) -> Lead | None:
        """根据ID获取线索.

        Args:
            lead_id: 线索ID
            load_creator: 是否加载创建者关系
            for_update: 是否加行级锁（SELECT ... FOR UPDATE，锁持至事务提交，供状态流转防并发）。
                不可与 load_creator 同用（PostgreSQL 禁止锁外连接可空侧），行锁调用请传 load_creator=False

        Returns:
            线索对象，不存在时返回None

        """
        query = self.db.query(Lead)
        if load_creator and not for_update:
            query = query.options(joinedload(Lead.creator), joinedload(Lead.referrer))
        if for_update:
            query = query.with_for_update()
        return query.filter(Lead.id == lead_id, Lead.is_deleted.is_(False)).first()

    def get_list(
        self,
        page: int = 1,
        page_size: int | None = None,
        search: str | None = None,
        statuses: list[LeadStatus] | None = None,
        district: str | None = None,
        creator_id: str | None = None,
        layout: str | None = None,
        floor: str | None = None,
    ) -> dict[str, Any]:
        """获取线索列表（分页）.

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
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        # 构建查询，优化关系加载
        # creator 附载 role/roles：供工作台 source 判定「创建者是否为员工」
        # （has_backend_identity 依赖主角色与附加角色），避免逐行懒加载 N+1
        query = (
            self.db.query(Lead)
            .options(
                selectinload(Lead.creator).joinedload(User.role),
                selectinload(Lead.creator).selectinload(User.roles),
                joinedload(Lead.referrer),
                noload(Lead.auditor),
                noload(Lead.follow_ups),
                noload(Lead.price_history),
            )
            .filter(Lead.is_deleted.is_(False))
        )

        # 应用过滤条件
        if search:
            query = query.filter(
                func.lower(Lead.community_name).like(f"%{escape_like(search).lower()}%", escape="\\"),
            )
        if statuses:
            # 「已放弃」聚合口径：rejected 为 umbrella，隐含 lost_to_competitor（他司成交归入放弃）
            has_rejected = LeadStatus.REJECTED in statuses
            has_lost = LeadStatus.LOST_TO_COMPETITOR in statuses
            effective_statuses = list(statuses)
            if has_rejected and not has_lost:
                effective_statuses.append(LeadStatus.LOST_TO_COMPETITOR)
            query = query.filter(Lead.status.in_(effective_statuses))
        if district:
            query = query.filter(
                func.lower(Lead.district).like(f"%{escape_like(district).lower()}%", escape="\\"),
            )
        if creator_id:
            query = query.filter(Lead.creator_id == creator_id)
        if layout:
            query = query.filter(
                func.lower(Lead.layout).like(f"%{escape_like(layout).lower()}%", escape="\\"),
            )
        if floor:
            query = query.filter(
                func.lower(Lead.floor_info).like(f"%{escape_like(floor).lower()}%", escape="\\"),
            )

        # 计算总数和获取分页数据
        total = query.count()
        items = (
            query.order_by(desc(Lead.created_at))
            .offset((page - 1) * effective_page_size)
            .limit(effective_page_size)
            .all()
        )

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": effective_page_size,
        }

    def get_funnel_stats(self) -> dict[str, int]:
        """获取线索漏斗统计数据.

        Returns:
            包含各阶段数量的字典

        """
        # 获取总数
        total = self.db.query(Lead).filter(Lead.is_deleted.is_(False)).count()

        # 评估中：待评估 + 待看房
        evaluating = (
            self.db.query(Lead)
            .filter(
                Lead.is_deleted.is_(False),
                Lead.status.in_([LeadStatus.PENDING_ASSESSMENT, LeadStatus.PENDING_VISIT]),
            )
            .count()
        )

        # 已放弃（含他司已成交：两终态合并为同一漏斗口径）
        rejected = (
            self.db.query(Lead)
            .filter(
                Lead.is_deleted.is_(False),
                Lead.status.in_([LeadStatus.REJECTED, LeadStatus.LOST_TO_COMPETITOR]),
            )
            .count()
        )

        # 带看中：已看房
        visiting = (
            self.db.query(Lead)
            .filter(
                Lead.is_deleted.is_(False),
                Lead.status == LeadStatus.VISITED,
            )
            .count()
        )

        # 已签约
        signed = (
            self.db.query(Lead)
            .filter(
                Lead.is_deleted.is_(False),
                Lead.status == LeadStatus.SIGNED,
            )
            .count()
        )

        return {
            "total": total,
            "evaluating": evaluating,
            "rejected": rejected,
            "visiting": visiting,
            "signed": signed,
        }

    def get_status_stats(self) -> dict[str, int]:
        """获取线索各状态数量统计（单次 GROUP BY 查询）.

        Returns:
            包含各状态数量的字典，键为 LeadStatus 枚举值

        """
        rows = self.db.execute(
            select(Lead.status, func.count())
            .where(Lead.is_deleted.is_(False), Lead.status.is_not(None))
            .group_by(Lead.status),
        ).all()

        counts = {status.value: 0 for status in LeadStatus}
        for status, count in rows:
            counts[status.value] = count
        return counts

    def count_total(self) -> int:
        """统计未删除线索总数（与 admin /leads 的 total 同口径）."""
        return self.db.query(Lead).filter(Lead.is_deleted.is_(False)).count()

    def _acquired_filter(self, user_id: str) -> ColumnElement[bool]:
        """员工获客归属过滤：分享归因（referrer_id）或直接录入（creator_id）."""
        return or_(Lead.referrer_id == user_id, Lead.creator_id == user_id)

    def get_acquired_list(
        self,
        page: int,
        page_size: int,
        user_id: str,
        status: LeadStatus | None = None,
    ) -> dict[str, Any]:
        """获取员工获客线索列表（分享归因 + 直接录入，分页）.

        Args:
            page: 页码
            page_size: 每页数量
            user_id: 当前员工用户ID
            status: 状态筛选（可选）

        Returns:
            包含线索列表和分页信息的字典

        """
        query = (
            self.db.query(Lead)
            .options(
                joinedload(Lead.creator),
                joinedload(Lead.referrer),
                noload(Lead.auditor),
                noload(Lead.follow_ups),
                noload(Lead.price_history),
            )
            .filter(Lead.is_deleted.is_(False), self._acquired_filter(user_id))
        )
        if status is not None:
            # 「已放弃」聚合口径：rejected 为 umbrella，隐含 lost_to_competitor（他司成交归入放弃）
            if status == LeadStatus.REJECTED:
                query = query.filter(
                    Lead.status.in_([LeadStatus.REJECTED, LeadStatus.LOST_TO_COMPETITOR]),
                )
            else:
                query = query.filter(Lead.status == status)

        total = query.count()
        items = query.order_by(desc(Lead.created_at)).offset((page - 1) * page_size).limit(page_size).all()

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    def get_acquired_stats(self, user_id: str) -> dict[str, int]:
        """获取员工获客线索各状态数量统计（与列表同口径，单次 GROUP BY）.

        Args:
            user_id: 当前员工用户ID

        Returns:
            含 total 与各状态数量的字典，键为 LeadStatus 枚举值

        """
        rows = self.db.execute(
            select(Lead.status, func.count())
            .where(Lead.is_deleted.is_(False), Lead.status.is_not(None), self._acquired_filter(user_id))
            .group_by(Lead.status),
        ).all()

        counts = {status.value: 0 for status in LeadStatus}
        for status, count in rows:
            counts[status.value] = count
        counts["total"] = sum(counts.values())
        return counts

    def get_acquired_lead(self, user_id: str, lead_id: str) -> Lead | None:
        """按 ID + 归属过滤查询员工获客线索单条.

        Args:
            user_id: 当前员工用户ID
            lead_id: 线索ID

        Returns:
            线索对象，不存在或不属于该员工时返回None

        """
        return (
            self.db.query(Lead)
            .options(joinedload(Lead.creator), joinedload(Lead.referrer))
            .filter(Lead.id == lead_id, Lead.is_deleted.is_(False), self._acquired_filter(user_id))
            .first()
        )

    def get_handled(
        self,
        user_id: str,
        page: int = 1,
        page_size: int | None = None,
        search: str | None = None,
    ) -> dict[str, Any]:
        """获取由指定审核人经手的线索列表（分页）.

        供小程序评估工作台「已处理」段使用：auditor=user_id 且状态 ∈
        pending_visit/visited/rejected/lost_to_competitor（visited 线索
        支持再次调整评估价，与 admin/leads 口径一致），audit_time 倒序全量分页；
        search 按小区名模糊过滤（与 get_list 同口径），total 为过滤后全量计数。

        Args:
            user_id: 审核人用户ID
            page: 页码
            page_size: 每页数量
            search: 小区名称搜索

        Returns:
            包含 items、total（全量计数）、page、page_size 的字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        # creator 附载 role/roles：source 判定需按创建者身份区分（见 routers/public/leads._lead_source）
        query = (
            self.db.query(Lead)
            .options(
                selectinload(Lead.creator).joinedload(User.role),
                selectinload(Lead.creator).selectinload(User.roles),
                noload(Lead.referrer),
                noload(Lead.auditor),
                noload(Lead.follow_ups),
                noload(Lead.price_history),
            )
            .filter(
                Lead.is_deleted.is_(False),
                Lead.auditor_id == user_id,
                Lead.status.in_(
                    [
                        LeadStatus.PENDING_VISIT,
                        LeadStatus.VISITED,
                        LeadStatus.REJECTED,
                        LeadStatus.LOST_TO_COMPETITOR,
                    ],
                ),
                Lead.audit_time.is_not(None),
            )
        )
        if search:
            query = query.filter(
                func.lower(Lead.community_name).like(f"%{escape_like(search).lower()}%", escape="\\"),
            )
        total = query.count()
        items = (
            query.order_by(desc(Lead.audit_time))
            .offset((page - 1) * effective_page_size)
            .limit(effective_page_size)
            .all()
        )
        return {"items": items, "total": total, "page": page, "page_size": effective_page_size}

    def count_pending_new_since(self, since: datetime) -> int:
        """统计指定时间之后创建的待评估线索数量（「今日新增」口径）.

        Args:
            since: 起始时间（timezone-aware，左闭）

        Returns:
            满足条件的线索数量

        """
        return int(
            self.db.query(func.count())
            .select_from(Lead)
            .filter(
                Lead.is_deleted.is_(False),
                Lead.status == LeadStatus.PENDING_ASSESSMENT,
                Lead.created_at >= since,
            )
            .scalar()
            or 0,
        )
