"""项目核心业务服务.

负责：项目创建、列表查询、基础信息更新、状态流转.

注意：此服务已适配新的规范化表结构。
项目基础信息在 projects 表，签约/业主/销售等信息在关联的子表中。
"""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Project, ProjectContract
from models.common import BusinessForm, ProjectStatus
from schemas.project import ProjectCreate, ProjectResponse, ProjectStatusUpdate, ProjectUpdate
from settings import settings

from .internal import (
    ContractNumberGenerator,
    ProjectCreator,
    ProjectQueryService,
    ProjectResponseBuilder,
    ProjectStateManager,
    ProjectUpdater,
)
from .internal.owners import get_bank_card_number


class ProjectCoreService:
    """项目核心业务服务 (Facade 模式).

    负责项目的全生命周期管理，包括创建、查询、更新、删除和状态流转。
    采用组件化设计，内部通过组合方式使用各子服务模块。

    Attributes:
        db: SQLAlchemy数据库会话
        query_service: 项目查询服务
        response_builder: 响应数据构建器
        state_manager: 状态管理器
        creator: 项目创建服务
        updater: 项目更新服务
        contract_generator: 合同编号生成器

    """

    def __init__(self, db: Session) -> None:
        """初始化核心业务服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db
        self.query_service = ProjectQueryService(db)
        self.response_builder = ProjectResponseBuilder(db)
        self.state_manager = ProjectStateManager(db)
        self.creator = ProjectCreator(db)
        self.updater = ProjectUpdater(db)
        self.contract_generator = ContractNumberGenerator(db)

    def generate_contract_no(self, business_form: str, max_retries: int = 3) -> str:
        """生成下一个合同编号（线程安全）.

        格式: SH + 4位自增序号 + - + 后缀
        - agent(代理美化) -> SG，如 SH0028-SG
        - wholesale(收购美化) -> DL，如 SH0028-DL

        Args:
            business_form: 业务形式，agent 或 wholesale
            max_retries: 最大重试次数，防止无限循环

        Returns:
            新生成的合同编号

        """
        # 临时更新最大重试次数
        original_retries = self.contract_generator.max_retries
        self.contract_generator.max_retries = max_retries
        try:
            return self.contract_generator.generate(business_form)
        finally:
            self.contract_generator.max_retries = original_retries

    def get_owner_bank_card_number(self, owner_id: str, operator_id: str | None = None) -> str | None:
        """获取业主未脱敏银行卡号.

        Args:
            owner_id: 业主ID
            operator_id: 调用方用户ID，用于审计日志

        Returns:
            未脱敏银行卡号；业主不存在、已删除或所属项目已软删时返回 None

        """
        return get_bank_card_number(self.db, owner_id, operator_id=operator_id)

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """创建项目.

        Args:
            project_data: 项目创建数据

        Returns:
            创建成功的项目响应数据

        """
        project = self.creator.create(project_data)
        # 重新查询以预加载 builder 所需的所有关联（create 已 commit，关联已 expire）
        project = self.query_service.get_by_id(project.id, include_all=False)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_project(self, project_id: str, *, include_all: bool = False) -> ProjectResponse | None:
        """获取项目详情.

        Args:
            project_id: 项目ID
            include_all: 是否加载所有关联数据

        Returns:
            项目响应数据，不存在时返回None

        """
        project = self.query_service.get_by_id(project_id, include_all=include_all)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def exists(self, project_id: str) -> bool:
        """检查项目是否存在.

        Args:
            project_id: 项目ID

        Returns:
            项目存在返回True，否则返回False

        """
        return self.query_service.exists(project_id)

    def get_projects(
        self,
        status_filter: str | None = None,
        community_name: str | None = None,
        business_form: BusinessForm | None = None,
        page: int = 1,
        page_size: int | None = None,
        *,
        include_interactions: bool = False,
        monitor_sort: bool = False,
    ) -> dict[str, Any]:
        """获取项目列表.

        Args:
            status_filter: 状态筛选条件
            community_name: 小区名称筛选条件
            business_form: 业务形式筛选条件
            page: 页码
            page_size: 每页数量
            include_interactions: 是否在 slim 列表响应中包含互动记录(sales_records)，
                供工作台重点监控卡片展示项目动态(带看/出价)
            monitor_sort: 工作台重点监控排序（状态优先级 + 创建时间升序），
                需在分页前应用

        Returns:
            包含项目列表和分页信息的字典

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        result = self.query_service.get_by_status(
            status=status_filter,
            community_name=community_name,
            business_form=business_form,
            page=page,
            page_size=effective_page_size,
            include_interactions=include_interactions,
            monitor_sort=monitor_sort,
        )

        items = [
            ProjectResponse.model_validate(
                self.response_builder.build(p, slim=True, include_interactions=include_interactions),
            )
            for p in result["items"]
        ]

        return {
            "items": items,
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"],
        }

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> ProjectResponse:
        """更新项目信息.

        Args:
            project_id: 项目ID
            update_data: 更新数据

        Returns:
            更新后的项目响应数据

        Raises:
            ResourceNotFoundError: 项目不存在时抛出

        """
        project = self.query_service.get_by_id(project_id, include_all=False)

        update_dict = update_data.model_dump(exclude_unset=True)
        project = self.updater.update(project, update_dict)

        # update 已 commit，重新查询以预加载 builder 所需关联
        project = self.query_service.get_by_id(project_id, include_all=False)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def delete_project(self, project_id: str) -> None:
        """删除项目 (软删除).

        同时软删除关联的合同记录，释放合同编号供复用。

        Args:
            project_id: 项目ID

        Raises:
            ResourceNotFoundError: 项目不存在时抛出

        """
        project = self.query_service.get_by_id(project_id, include_all=False)

        project.is_deleted = True
        project.status = ProjectStatus.DELETED.value
        project.updated_at = datetime.now(timezone.utc)

        # 同步软删除合同记录，释放合同编号（idx_contract_no 为部分唯一索引，仅约束 is_deleted=false 的记录）
        now = datetime.now(timezone.utc)
        self.db.query(ProjectContract).filter(
            ProjectContract.project_id == project_id,
            ProjectContract.is_deleted.is_(False),
        ).update(
            {
                "is_deleted": True,
                "updated_at": now,
            },
            synchronize_session=False,
        )

        self.db.commit()

    def update_status(self, project_id: str, status_update: ProjectStatusUpdate) -> ProjectResponse:
        """更新项目状态.

        Args:
            project_id: 项目ID
            status_update: 状态更新数据

        Returns:
            更新后的项目响应数据

        Raises:
            ResourceNotFoundError: 项目不存在时抛出

        """
        project = self.query_service.get_by_id(project_id, include_all=False)

        project = self.state_manager.update_status(project, status_update)

        # update_status 已 commit，重新查询以预加载 builder 所需关联
        project = self.query_service.get_by_id(project_id, include_all=False)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_project_stats(self) -> dict[str, int]:
        """获取项目统计.

        Returns:
            各状态项目数量的字典

        """
        stats = (
            self.db.query(
                Project.status,
                func.count(Project.id),
            )
            .filter(Project.is_deleted.is_(False))
            .group_by(Project.status)
            .all()
        )

        result = {
            "signing": 0,
            "renovating": 0,
            "selling": 0,
            "sold": 0,
        }

        for status, count in stats:
            status_key = status.value if hasattr(status, "value") else str(status)
            if status_key in result:
                result[status_key] = count

        return result
