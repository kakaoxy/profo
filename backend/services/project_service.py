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

class ProjectService(
    ProjectCoreService,
    ProjectRenovationService,
    ProjectSalesService,
    ProjectFinanceService
):
    """
    聚合服务类
    通过多重继承，集合了 Core, Renovation, Sales, Finance 的所有方法。
    """
    
    def __init__(self, db: Session):
        # 统一初始化数据库会话
        # 由于所有父类的 __init__ 都是接收 db，这里统一处理即可
        self.db = db
        
        # 理论上不需要调用 super().__init__(db)，因为我们在这里已经设置了 self.db
        # 且所有子服务的方法都依赖 self.db