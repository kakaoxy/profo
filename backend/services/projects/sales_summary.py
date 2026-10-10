"""销售指标 hero 区聚合 + 跨项目记录明细流 Service（小程序员工端 /projects/sales-*）.

设计稿 docs/2026-10-10-带看项目列表-指标hero区-高保真设计稿.html 口径⑤⑥：
主通道 GET /projects 分页 20 条/页导致前端聚合已加载项数字不完整，需后端按
全量可见项目聚合；明细页需跨项目时间降序记录流端点。

权限口径（与列表双通道一致，resolve_scope 收敛）：
- 主通道：持 project:read 权限（admin/operator）→ 全部在售项目；
- 回退通道：无 project:read → 业务身份（装修对接负责人/销售三角色）负责的在售项目。
只读不落库；周期窗口复用 key_access.cycle_period（周二 00:00 → 下周一 24:00，
与小程序带看角标 / 钥匙 summary 同口径）。
"""

from datetime import timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from models import Project, ProjectInteraction, ProjectRenovation, ProjectSale, ProjectStatus, User
from models.common import RecordType
from schemas.project.sales import (
    SalesRecordFlowItem,
    SalesRecordFlowResponse,
    SalesSummaryPeriod,
    SalesSummaryResponse,
)
from services.projects.key_access import cycle_period, format_period_text
from services.system.permission import permission_service

# 统计目标项目状态：与带看项目列表主通道 status=selling 过滤一致
_TARGET_STATUS = ProjectStatus.SELLING.value

# 明细流默认每页条数（与主通道列表 PAGE_SIZE 对齐，触底翻页）
_FLOW_PAGE_SIZE_DEFAULT = 20

# 周期窗口日期归一时区：东八区（与 format_period_text / key_summary 同口径，
# cycle_period 返回 tz-aware UTC，直接 .date() 会偏移一天）
_CST = ZoneInfo("Asia/Shanghai")

# 明细流允许的 record_type 过滤值（非法值忽略，等同不过滤）
_FLOW_TYPES: set[str] = {t.value for t in RecordType}

# 项目展示名兜底链（与小程序 toDisplay 同源：address ?? community_name ?? 未命名项目）
_UNNAMED = "未命名项目"


def _project_display_name(project: Project) -> str:
    """项目展示名（address 兜底 community_name 兜底「未命名项目」）."""
    return project.address or project.community_name or _UNNAMED


class SalesSummaryService:
    """销售指标 hero 区聚合与跨项目记录明细流（只读）."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def resolve_scope(self, user: User) -> list[Project]:
        """解析当前用户可见的「在售」项目集合（与列表双通道同口径）.

        主通道：持 project:read（admin/operator）→ 全部在售项目；
        回退通道：无 project:read → 业务身份（装修对接负责人/销售三角色）
        负责的在售项目（get_by_business_identity 同口径五字段，只取 SELLING）。
        与小程序列表「主通道 403 回退 my-responsible」最终可见范围一致。
        """
        perms = permission_service.get_user_permission_codes(self.db, user)
        if "project:read" in perms:
            return self.db.query(Project).filter(Project.is_deleted.is_(False), Project.status == _TARGET_STATUS).all()
        uid = str(user.id)
        renovation_ids = self.db.query(ProjectRenovation.project_id).filter(
            ProjectRenovation.is_deleted.is_(False), ProjectRenovation.contact_person_id == uid
        )
        sale_ids = self.db.query(ProjectSale.project_id).filter(
            ProjectSale.is_deleted.is_(False),
            (ProjectSale.channel_manager_id == uid)
            | (ProjectSale.property_agent_id == uid)
            | (ProjectSale.negotiator_id == uid),
        )
        union_ids = renovation_ids.union(sale_ids).subquery()
        return (
            self.db.query(Project)
            .filter(
                Project.id.in_(union_ids),
                Project.is_deleted.is_(False),
                Project.status == _TARGET_STATUS,
            )
            .all()
        )

    def get_summary(self, user: User) -> SalesSummaryResponse:
        """销售指标 hero 区聚合（三指标总量 + 周二周期新增，只读）.

        三指标 = 可见在售项目的销售记录按 record_type 计数（与项目卡
        card-counts 同源同短名：不过滤价格——非法价出价也计入，与卡片口径一致）。
        周期新增 = interaction_at ∈ [周期起点, 现在窗口上界)（与卡片周期角标
        同一 cycleStart 口径；窗口上界取 cycle_period 终点，未来时间不预支计入）。
        """
        projects = self.resolve_scope(user)
        start, end = cycle_period()
        period = SalesSummaryPeriod(
            start=start.astimezone(_CST).date(),
            end=(end - timedelta(days=1)).astimezone(_CST).date(),
            text=format_period_text(start, end),
        )
        if not projects:
            return SalesSummaryResponse(period=period)
        project_ids = [p.id for p in projects]

        # 单条 GROUP BY 同时取三类型总量与周期新增（interaction_at 索引覆盖）
        rows = (
            self.db.query(
                ProjectInteraction.record_type,
                func.count(ProjectInteraction.id),
                func.count(ProjectInteraction.id).filter(
                    ProjectInteraction.interaction_at >= start,
                    ProjectInteraction.interaction_at < end,
                ),
            )
            .filter(
                ProjectInteraction.project_id.in_(project_ids),
                ProjectInteraction.is_deleted.is_(False),
            )
            .group_by(ProjectInteraction.record_type)
            .all()
        )
        totals = {str(r[0].value if isinstance(r[0], RecordType) else r[0]): int(r[1]) for r in rows}
        period_news = {str(r[0].value if isinstance(r[0], RecordType) else r[0]): int(r[2]) for r in rows}

        return SalesSummaryResponse(
            viewing_total=totals.get(RecordType.VIEWING.value, 0),
            offer_total=totals.get(RecordType.OFFER.value, 0),
            negotiation_total=totals.get(RecordType.NEGOTIATION.value, 0),
            period_new_viewing=period_news.get(RecordType.VIEWING.value, 0),
            period_new_offer=period_news.get(RecordType.OFFER.value, 0),
            period_new_negotiation=period_news.get(RecordType.NEGOTIATION.value, 0),
            period=period,
        )

    def get_record_flow(
        self,
        user: User,
        *,
        page: int = 1,
        page_size: int = _FLOW_PAGE_SIZE_DEFAULT,
        record_type: str | None = None,
    ) -> SalesRecordFlowResponse:
        """跨项目销售记录明细流（record_date 降序、同日 created_at 降序，分页）.

        可见范围与 get_summary 完全同口径（resolve_scope 复用），不泄露无关项目
        记录。project_name 后端拼好直出，前端不做项目信息二次请求。
        """
        projects = self.resolve_scope(user)
        project_ids = [p.id for p in projects]
        if not project_ids:
            return SalesRecordFlowResponse(items=[], total=0, page=page, page_size=page_size)

        base = self.db.query(ProjectInteraction).filter(
            ProjectInteraction.project_id.in_(project_ids),
            ProjectInteraction.is_deleted.is_(False),
        )
        if record_type and record_type in _FLOW_TYPES:
            base = base.filter(ProjectInteraction.record_type == record_type)

        total = base.count()
        rows = (
            base.options(selectinload(ProjectInteraction.operator))
            .order_by(ProjectInteraction.interaction_at.desc(), ProjectInteraction.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        # 项目名批量映射（一条 in 查询，避免 N+1）
        names = {
            p.id: _project_display_name(p)
            for p in self.db.query(Project.id, Project.address, Project.community_name)
            .filter(Project.id.in_(project_ids))
            .all()
        }

        items = [
            SalesRecordFlowItem(
                id=r.id,
                record_type=r.record_type,
                record_date=r.interaction_at,
                price=r.price,
                # related_agent 真源字段暂缺（ProjectInteraction 无渠道列），恒为 None，
                # 前端按「渠道缺失整体省略括注」渲染（设计稿 ROW ANATOMY 兜底口径）
                related_agent=None,
                # customer_name 真源 = interaction_target（新增记录表单填写的
                # 带看人/机构、出价人、面谈对象，与详情页 customer_name 同一数据）
                customer_name=r.interaction_target,
                operator_name=(r.operator.nickname or r.operator.username) if r.operator else None,
                project_id=r.project_id,
                project_name=names.get(r.project_id, _UNNAMED),
            )
            for r in rows
        ]
        return SalesRecordFlowResponse(items=items, total=total, page=page, page_size=page_size)
