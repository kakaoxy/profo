"""项目业务逻辑聚合服务 (Facade).

这是一个兼容层。为了解决 "God Class" 问题，具体的业务逻辑已被拆分到：
- core.py (核心 CRUD)
- renovation.py (装修)
- sales.py (销售)
- finance.py (财务)

建议：
后续修改 Router 层时，应改为直接依赖具体的子 Service，最终删除此文件。
目前保留此类是为了让现有的 Router 代码无需修改即可运行。
"""

from typing import Any

from sqlalchemy.orm import Session

# 导入模型和 Schema 类型
from models import ProjectInteraction, ProjectRenovation, RenovationPhoto
from schemas.project import ProjectCreate, ProjectResponse, ProjectUpdate, StatusUpdate
from schemas.project.renovation import RenovationContractUpdate, RenovationUpdate
from schemas.project.sales import (
    ProjectCompleteRequest,
    SalesRecordCreate,
    SalesRolesUpdate,
)

# 导入拆分后的子服务
from .core import ProjectCoreService
from .finance import FinanceService
from .renovation import RenovationService
from .sales import SalesService


class ProjectService:
    """聚合服务类 (Facade模式).

    通过组合方式，聚合了 Core, Renovation, Sales, Finance 的所有方法。

    设计说明：
    - 使用组合替代多重继承，避免初始化顺序和属性覆盖问题
    - 所有方法调用委托给对应的具体服务实例
    - 保持与原有 Router 代码的兼容性
    """

    def __init__(self, db: Session) -> None:
        """初始化聚合服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db
        # 使用组合模式初始化各子服务
        self._core_service = ProjectCoreService(db)
        self._renovation_service = RenovationService(db)
        self._sales_service = SalesService(db)
        self._finance_service = FinanceService(db)

    # ========== ProjectCoreService 方法委托 ==========

    def create_project(self, project_data: ProjectCreate) -> ProjectResponse:
        """创建项目."""
        return self._core_service.create_project(project_data)

    def get_project(self, project_id: str, include_all: bool = False) -> ProjectResponse | None:  # noqa: FBT001, FBT002
        """获取项目详情."""
        return self._core_service.get_project(project_id, include_all=include_all)

    def get_projects(
        self,
        status_filter: str | None = None,
        community_name: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict[str, Any]:
        """获取项目列表."""
        return self._core_service.get_projects(status_filter, community_name, page, page_size)

    def update_project(self, project_id: str, update_data: ProjectUpdate) -> ProjectResponse:
        """更新项目."""
        return self._core_service.update_project(project_id, update_data)

    def delete_project(self, project_id: str) -> None:
        """删除项目."""
        return self._core_service.delete_project(project_id)

    def update_status(self, project_id: str, status_update: StatusUpdate) -> ProjectResponse:
        """更新项目状态."""
        return self._core_service.update_status(project_id, status_update)

    def get_project_stats(self) -> dict[str, int]:
        """获取项目统计."""
        return self._core_service.get_project_stats()

    def generate_contract_no(self) -> str:
        """生成合同编号."""
        return self._core_service.generate_contract_no()

    # ========== RenovationService 方法委托 ==========

    def update_renovation_stage(self, project_id: str, renovation_data: RenovationUpdate) -> ProjectResponse:
        """更新装修阶段."""
        project = self._renovation_service.update_stage(project_id, renovation_data)
        from .internal import ProjectResponseBuilder  # noqa: PLC0415

        return ProjectResponse.model_validate(ProjectResponseBuilder(self.db).build(project))

    def get_renovation_info(self, project_id: str) -> ProjectResponse | None:
        """获取装修信息."""
        renovation = self._renovation_service.get_info(project_id)
        if not renovation:
            return None
        return self._core_service.get_project(project_id, include_all=False)

    def update_renovation_info(self, project_id: str, renovation_data: dict[str, Any]) -> ProjectResponse:
        """更新装修信息."""
        self._renovation_service.update_info(project_id, renovation_data)
        return self._core_service.get_project(project_id, include_all=False)

    def add_renovation_photo(
        self,
        project_id: str,
        stage: str,
        url: str,
        filename: str | None = None,
        description: str | None = None,
    ) -> RenovationPhoto:
        """添加装修照片."""
        return self._renovation_service.add_photo(project_id, stage, url, filename, description)

    def get_renovation_photos(self, project_id: str, stage: str | None = None) -> list[RenovationPhoto]:
        """获取装修照片."""
        return self._renovation_service.get_photos(project_id, stage)

    def delete_renovation_photo(self, project_id: str, photo_id: str) -> None:
        """删除装修照片."""
        return self._renovation_service.delete_photo(project_id, photo_id)

    def get_renovation_contract(self, project_id: str) -> ProjectRenovation:
        """获取装修合同."""
        return self._renovation_service.get_contract(project_id)

    def update_renovation_contract(
        self,
        project_id: str,
        contract_data: RenovationContractUpdate,
    ) -> ProjectRenovation:
        """更新装修合同."""
        return self._renovation_service.update_contract(project_id, contract_data)

    # ========== SalesService 方法委托 ==========

    def update_sales_roles(self, project_id: str, roles_data: SalesRolesUpdate) -> ProjectResponse:
        """更新销售角色."""
        return self._sales_service.update_roles(project_id, roles_data)

    def create_sales_record(self, project_id: str, record_data: SalesRecordCreate) -> ProjectInteraction:
        """创建销售记录."""
        return self._sales_service.create_record(project_id, record_data)

    def get_sales_records(
        self,
        project_id: str,
        record_type: str | None = None,
    ) -> list[dict[str, Any]]:
        """获取销售记录."""
        return self._sales_service.get_records(project_id, record_type)

    def delete_sales_record(self, project_id: str, record_id: str) -> None:
        """删除销售记录."""
        return self._sales_service.delete_record(project_id, record_id)

    def complete_project(self, project_id: str, complete_data: ProjectCompleteRequest) -> ProjectResponse:
        """完成项目（标记已售）."""
        return self._sales_service.complete_project(project_id, complete_data)

    # ========== FinanceService 方法委托 ==========

    def sync_project_financials(self, project_id: str) -> None:
        """同步项目财务数据."""
        return self._finance_service.sync_financials(project_id)

    def get_project_report(self, project_id: str) -> dict[str, Any]:
        """获取项目财务报告."""
        return self._finance_service.get_report(project_id)
