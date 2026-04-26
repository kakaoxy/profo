"""
项目核心业务服务
负责：项目创建、列表查询、基础信息更新、状态流转

注意：此服务已适配新的规范化表结构。
项目基础信息在 projects 表，签约/业主/销售等信息在关联的子表中。
"""

from typing import Optional, Dict, Any
from datetime import datetime

from sqlalchemy.orm import Session
from sqlalchemy import func

from models import Project
from models.common import ProjectStatus
from schemas.project import ProjectCreate, ProjectUpdate, StatusUpdate, ProjectResponse
from services.system.exceptions import ResourceNotFoundError
from .internal import (
    ProjectQueryService,
    ProjectResponseBuilder,
    ProjectStateManager,
    ProjectCreator,
    ProjectUpdater,
    ContractNumberGenerator,
)


class ProjectCoreService:
    """
    项目核心业务服务 (Facade 模式)

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

    def __init__(self, db: Session):
        """
        初始化核心业务服务

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

    def generate_contract_no(self, max_retries: int = 3) -> str:
        """
        生成下一个合同编号（线程安全）

        格式: MFB-年月-4位自增序号，如 MFB-202604-0001

        Args:
            max_retries: 最大重试次数，防止无限循环

        Returns:
            新生成的合同编号
        """
        # 临时更新最大重试次数
        original_retries = self.contract_generator.max_retries
        self.contract_generator.max_retries = max_retries
        try:
            return self.contract_generator.generate()
        finally:
            self.contract_generator.max_retries = original_retries

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """
        创建项目

        Args:
            project_data: 项目创建数据

        Returns:
            创建成功的项目响应数据
        """
        project = self.creator.create(project_data)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_project(self, project_id: str, include_all: bool = False) -> Optional[ProjectResponse]:
        """
        获取项目详情

        Args:
            project_id: 项目ID
            include_all: 是否加载所有关联数据

        Returns:
            项目响应数据，不存在时返回None
        """
        project = self.query_service.get_by_id(project_id, include_all)
        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_projects(
        self,
        status_filter: Optional[str] = None,
        community_name: Optional[str] = None,
        page: int = 1,
        page_size: int = 50
    ) -> Dict[str, Any]:
        """
        获取项目列表

        Args:
            status_filter: 状态筛选条件
            community_name: 小区名称筛选条件
            page: 页码
            page_size: 每页数量

        Returns:
            包含项目列表和分页信息的字典
        """
        result = self.query_service.get_by_status(
            status=status_filter,
            community_name=community_name,
            page=page,
            page_size=page_size
        )

        items = [
            ProjectResponse.model_validate(self.response_builder.build(p))
            for p in result["items"]
        ]

        return {
            "items": items,
            "total": result["total"],
            "page": result["page"],
            "page_size": result["page_size"]
        }

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> ProjectResponse:
        """
        更新项目信息

        Args:
            project_id: 项目ID
            update_data: 更新数据

        Returns:
            更新后的项目响应数据

        Raises:
            ResourceNotFoundError: 项目不存在时抛出
        """
        project = self.db.query(Project).filter(
            Project.id == project_id,
            Project.is_deleted == False
        ).first()

        if not project:
            raise ResourceNotFoundError("项目不存在")

        update_dict = update_data.model_dump(exclude_unset=True)
        project = self.updater.update(project, update_dict)

        return ProjectResponse.model_validate(self.response_builder.build(project))

    def delete_project(self, project_id: str) -> None:
        """
        删除项目 (软删除)

        Args:
            project_id: 项目ID

        Raises:
            ResourceNotFoundError: 项目不存在时抛出
        """
        project = self.db.query(Project).filter(
            Project.id == project_id,
            Project.is_deleted == False
        ).first()

        if not project:
            raise ResourceNotFoundError("项目不存在")

        project.is_deleted = True
        project.status = ProjectStatus.DELETED.value
        project.updated_at = datetime.utcnow()
        self.db.commit()

    def update_status(self, project_id: str, status_update: StatusUpdate) -> ProjectResponse:
        """
        更新项目状态

        Args:
            project_id: 项目ID
            status_update: 状态更新数据

        Returns:
            更新后的项目响应数据

        Raises:
            ResourceNotFoundError: 项目不存在时抛出
        """
        project = self.db.query(Project).filter(
            Project.id == project_id,
            Project.is_deleted == False
        ).first()

        if not project:
            raise ResourceNotFoundError("项目不存在")

        project = self.state_manager.update_status(project, status_update)

        return ProjectResponse.model_validate(self.response_builder.build(project))

    def get_project_stats(self) -> Dict[str, int]:
        """
        获取项目统计

        Returns:
            各状态项目数量的字典
        """
        stats = self.db.query(
            Project.status,
            func.count(Project.id)
        ).filter(Project.is_deleted == False).group_by(Project.status).all()

        result = {
            "signing": 0,
            "renovating": 0,
            "selling": 0,
            "sold": 0
        }

        for status, count in stats:
            if status in result:
                result[status] = count

        return result
