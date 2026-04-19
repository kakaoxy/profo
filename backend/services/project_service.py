"""
[已重构] 项目业务逻辑聚合服务 (Facade)

注意：
这是一个兼容层。为了解决 "God Class" 问题，具体的业务逻辑已被拆分到：
- project_core.py (核心 CRUD)
- project_renovation.py (装修)
- project_sales.py (销售)
- project_finance.py (财务)

建议：
后续修改 Router 层时，应改为直接依赖具体的子 Service，最终删除此文件。
目前保留此类是为了让现有的 Router 代码无需修改即可运行。
"""
from sqlalchemy.orm import Session

# 导入拆分后的子服务
from .project_core import ProjectCoreService
from .project_renovation import ProjectRenovationService
from .project_sales import ProjectSalesService
from .project_finance import ProjectFinanceService


class ProjectService:
    """
    聚合服务类 (Facade模式)
    通过组合方式，聚合了 Core, Renovation, Sales, Finance 的所有方法。
    
    设计说明：
    - 使用组合替代多重继承，避免初始化顺序和属性覆盖问题
    - 所有方法调用委托给对应的具体服务实例
    - 保持与原有 Router 代码的兼容性
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        # 使用组合模式初始化各子服务
        self._core_service = ProjectCoreService(db)
        self._renovation_service = ProjectRenovationService(db)
        self._sales_service = ProjectSalesService(db)
        self._finance_service = ProjectFinanceService(db)

    # ========== ProjectCoreService 方法委托 ==========

    def create_project(self, *args, **kwargs):
        return self._core_service.create_project(*args, **kwargs)

    def get_project(self, *args, **kwargs):
        return self._core_service.get_project(*args, **kwargs)

    def get_projects(self, *args, **kwargs):
        return self._core_service.get_projects(*args, **kwargs)

    def update_project(self, *args, **kwargs):
        return self._core_service.update_project(*args, **kwargs)

    def delete_project(self, *args, **kwargs):
        return self._core_service.delete_project(*args, **kwargs)

    def update_status(self, *args, **kwargs):
        return self._core_service.update_status(*args, **kwargs)

    def get_project_stats(self, *args, **kwargs):
        return self._core_service.get_project_stats(*args, **kwargs)

    # ========== ProjectRenovationService 方法委托 ==========

    def update_renovation_stage(self, *args, **kwargs):
        return self._renovation_service.update_renovation_stage(*args, **kwargs)

    def get_renovation_info(self, *args, **kwargs):
        return self._renovation_service.get_renovation_info(*args, **kwargs)

    def update_renovation_info(self, *args, **kwargs):
        return self._renovation_service.update_renovation_info(*args, **kwargs)

    def add_renovation_photo(self, *args, **kwargs):
        return self._renovation_service.add_renovation_photo(*args, **kwargs)

    def get_renovation_photos(self, *args, **kwargs):
        return self._renovation_service.get_renovation_photos(*args, **kwargs)

    def delete_renovation_photo(self, *args, **kwargs):
        return self._renovation_service.delete_renovation_photo(*args, **kwargs)

    def get_renovation_contract(self, *args, **kwargs):
        return self._renovation_service.get_renovation_contract(*args, **kwargs)

    def update_renovation_contract(self, *args, **kwargs):
        return self._renovation_service.update_renovation_contract(*args, **kwargs)

    # ========== ProjectSalesService 方法委托 ==========

    def update_sales_roles(self, *args, **kwargs):
        return self._sales_service.update_sales_roles(*args, **kwargs)

    def create_sales_record(self, *args, **kwargs):
        return self._sales_service.create_sales_record(*args, **kwargs)

    def get_sales_records(self, *args, **kwargs):
        return self._sales_service.get_sales_records(*args, **kwargs)

    def delete_sales_record(self, *args, **kwargs):
        return self._sales_service.delete_sales_record(*args, **kwargs)

    def complete_project(self, *args, **kwargs):
        return self._sales_service.complete_project(*args, **kwargs)

    # ========== ProjectFinanceService 方法委托 ==========

    def sync_project_financials(self, *args, **kwargs):
        return self._finance_service.sync_project_financials(*args, **kwargs)

    def get_project_report(self, *args, **kwargs):
        return self._finance_service.get_project_report(*args, **kwargs)