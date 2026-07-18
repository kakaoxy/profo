"""项目查询模块.

负责项目数据的查询和加载.
"""

from sqlalchemy import case, func, text
from sqlalchemy.orm import Session, contains_eager, joinedload, selectinload

from models import Project, ProjectContract, ProjectInteraction
from models.common import BusinessForm, ProjectStatus
from services.system.exceptions import ResourceNotFoundError
from settings import settings
from utils.formatters import escape_like


class ProjectQueryService:
    """项目查询服务.

    负责项目数据的查询、加载和存在性验证。
    支持灵活的数据加载策略（完整加载或简化加载）。

    Attributes:
        db: SQLAlchemy数据库会话

    """

    def __init__(self, db: Session) -> None:
        """初始化查询服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def get_by_id(self, project_id: str, *, include_all: bool = False) -> Project:
        """根据ID获取项目详情.

        根据include_all参数决定加载策略：
        - include_all=True: 完整加载所有关联数据（合同、业主、销售、照片、互动、财务、日志）
        - include_all=False: 简化加载，仅加载必要关联（合同、业主、销售）

        Args:
            project_id: 项目唯一标识符
            include_all: 是否加载所有关联数据，默认为False

        Returns:
            Project模型实例

        Raises:
            ResourceNotFoundError: 项目不存在时抛出404错误

        """
        query = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False))

        if include_all:
            # 完整加载：预加载所有关联关系
            # joinedload 用于多对一/一对一关系（uselist=False），减少查询数
            # selectinload 用于一对多关系，避免笛卡尔积
            query = query.options(
                joinedload(Project.contract),
                selectinload(Project.owners),
                joinedload(Project.sale),
                selectinload(Project.renovation_photos),
                selectinload(Project.interactions).selectinload(ProjectInteraction.operator),
                selectinload(Project.finance_records),
                joinedload(Project.renovation),
                selectinload(Project.status_logs),
                selectinload(Project.project_manager),
            )
        else:
            # 标准加载：预加载 builder.build(slim=False) 访问的所有关联
            # 含 contract/owners/sale/project_manager/renovation_photos/finance_records/interactions/renovation
            # interactions.operator 预加载用于构建销售记录操作人嵌套对象
            query = query.options(
                joinedload(Project.contract),
                selectinload(Project.owners),
                joinedload(Project.sale),
                selectinload(Project.project_manager),
                selectinload(Project.renovation_photos),
                selectinload(Project.finance_records),
                selectinload(Project.interactions).selectinload(ProjectInteraction.operator),
                joinedload(Project.renovation),
            )

        project = query.first()

        if not project:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        return project

    def exists(self, project_id: str) -> bool:
        """检查项目是否存在.

        Args:
            project_id: 项目唯一标识符

        Returns:
            项目存在返回True，否则返回False

        """
        return (
            self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first() is not None
        )

    def get_by_status(
        self,
        status: str | None = None,
        community_name: str | None = None,
        business_form: BusinessForm | None = None,
        page: int = 1,
        page_size: int | None = None,
        *,
        include_interactions: bool = False,
        monitor_sort: bool = False,
    ) -> list[Project]:
        """分页获取项目列表.

        支持按状态和小区名称筛选，预加载关联数据。

        Args:
            status: 项目状态筛选条件
            community_name: 小区名称筛选条件（模糊匹配）
            business_form: 业务形式筛选条件（精确匹配）
            page: 页码，从1开始
            page_size: 每页数量
            include_interactions: 是否包含互动记录（sales_records）
            monitor_sort: 工作台重点监控排序，状态优先级(在售→装修→签约→已售)
                + 创建时间升序，需在 LIMIT 前应用以保证返回优先级最高的项目

        Returns:
            包含项目列表和分页信息的字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        query = self.db.query(Project).filter(Project.is_deleted.is_(False))

        if status:
            query = query.filter(Project.status == status)

        if community_name:
            query = query.filter(
                func.lower(Project.community_name).like(f"%{escape_like(community_name).lower()}%", escape="\\"),
            )

        if business_form:
            query = query.filter(Project.business_form == business_form)

        # 预加载关联数据（列表页所需：contract/owners/sale/project_manager/renovation_photos/finance_records）
        options: list = [
            selectinload(Project.owners),
            joinedload(Project.sale),
            selectinload(Project.project_manager),
            selectinload(Project.renovation_photos),
            selectinload(Project.finance_records),
        ]
        if include_interactions:
            # 工作台重点监控卡片需展示项目动态(带看/出价)，预加载互动记录避免 N+1
            # 同时预加载 operator 关系以构建销售记录操作人嵌套对象
            options.append(selectinload(Project.interactions).selectinload(ProjectInteraction.operator))

        if monitor_sort:
            # 工作台重点监控：显式 join contract 用于排序，用 contains_eager 复用
            # 此 join 同时承担预加载，避免 joinedload 产生重复 join
            query = query.outerjoin(ProjectContract, ProjectContract.project_id == Project.id)
            options.append(contains_eager(Project.contract))
        else:
            options.append(joinedload(Project.contract))
        query = query.options(*options)

        total = query.count()

        if monitor_sort:
            # 状态优先级(在售→装修→签约→已售)
            # 在售阶段：按到期时间(signing_date + 合同周期天 + 顺延期天)升序，
            #   缺 signing_date 或 signing_period 的排到在售组末尾
            # 其他阶段：保持 created_at 升序
            # 到期时间 = 签约日期 + (合同周期 + 顺延期) 天
            expiration_expr = ProjectContract.signing_date + (
                func.coalesce(ProjectContract.signing_period, 0) + func.coalesce(ProjectContract.extension_period, 0)
            ) * text("INTERVAL '1 day'")

            # 在售项目缺少到期计算所需数据时为 1(排末尾)，否则 0；其他阶段固定 0
            selling_missing = case(
                (
                    Project.status == ProjectStatus.SELLING,
                    case(
                        (
                            (ProjectContract.signing_date.is_(None)) | (ProjectContract.signing_period.is_(None)),
                            1,
                        ),
                        else_=0,
                    ),
                ),
                else_=0,
            )

            status_priority = case(
                (Project.status == ProjectStatus.SELLING, 1),
                (Project.status == ProjectStatus.RENOVATING, 2),
                (Project.status == ProjectStatus.SIGNING, 3),
                (Project.status == ProjectStatus.SOLD, 4),
                else_=99,
            )

            order_clause = (
                status_priority,
                selling_missing,
                expiration_expr.asc().nulls_last(),
                Project.created_at.asc(),
            )
        else:
            order_clause = (Project.created_at.desc(),)

        projects = (
            query.order_by(*order_clause).offset((page - 1) * effective_page_size).limit(effective_page_size).all()
        )

        return {
            "items": projects,
            "total": total,
            "page": page,
            "page_size": effective_page_size,
        }

    def get_by_business_identity(self, user_id: str) -> list[Project]:
        """查询当前用户作为业务身份（装修对接负责人或销售团队成员）负责的项目.

        业务身份匹配规则（任一即命中）：
        - ProjectRenovation.contact_person_id == user_id
        - ProjectSale.channel_manager_id == user_id
        - ProjectSale.property_agent_id == user_id
        - ProjectSale.negotiator_id == user_id

        已软删除的项目/装修记录/销售记录不参与匹配。结果按 created_at 降序。

        Args:
            user_id: 当前用户ID

        Returns:
            项目列表（已预加载 builder 所需关联）

        """
        from models import ProjectRenovation, ProjectSale  # noqa: PLC0415

        # 通过 UNION 合并两类业务身份对应的项目 ID（去重），再回查 Project
        # 使用 distinct() 防止一个项目同时命中装修 + 销售身份时返回重复行
        renovation_proj_ids = self.db.query(ProjectRenovation.project_id.label("pid")).filter(
            ProjectRenovation.contact_person_id == user_id,
            ProjectRenovation.is_deleted.is_(False),
        )
        sale_proj_ids = self.db.query(ProjectSale.project_id.label("pid")).filter(
            ProjectSale.is_deleted.is_(False),
            (ProjectSale.channel_manager_id == user_id)
            | (ProjectSale.property_agent_id == user_id)
            | (ProjectSale.negotiator_id == user_id),
        )
        union_ids = renovation_proj_ids.union(sale_proj_ids).subquery()

        return (
            self.db.query(Project)
            .filter(Project.id.in_(union_ids), Project.is_deleted.is_(False))
            .options(
                joinedload(Project.contract),
                selectinload(Project.owners),
                joinedload(Project.sale),
                selectinload(Project.project_manager),
                selectinload(Project.renovation_photos),
                selectinload(Project.finance_records),
                joinedload(Project.renovation),
            )
            .order_by(Project.created_at.desc())
            .all()
        )
