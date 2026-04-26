"""
项目查询模块
负责项目数据的查询和加载
"""

from typing import Optional

from sqlalchemy.orm import Session, selectinload

from models import Project
from services.system.exceptions import ResourceNotFoundError


class ProjectQueryService:
    """
    项目查询服务

    负责项目数据的查询、加载和存在性验证。
    支持灵活的数据加载策略（完整加载或简化加载）。

    Attributes:
        db: SQLAlchemy数据库会话
    """

    def __init__(self, db: Session):
        """
        初始化查询服务

        Args:
            db: SQLAlchemy数据库会话
        """
        self.db = db

    def get_by_id(self, project_id: str, include_all: bool = False) -> Project:
        """
        根据ID获取项目详情

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
        query = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted == False)

        if include_all:
            # 完整加载：预加载所有关联关系
            query = query.options(
                selectinload(Project.contract),
                selectinload(Project.owners),
                selectinload(Project.sale),
                selectinload(Project.renovation_photos),
                selectinload(Project.interactions),
                selectinload(Project.finance_records),
                selectinload(Project.status_logs),
                selectinload(Project.project_manager),
            )
        else:
            # 简化加载：只加载必要的关系
            query = query.options(
                selectinload(Project.contract),
                selectinload(Project.owners),
                selectinload(Project.sale),
                selectinload(Project.project_manager),
            )

        project = query.first()

        if not project:
            raise ResourceNotFoundError("项目不存在")

        return project

    def exists(self, project_id: str) -> bool:
        """
        检查项目是否存在

        Args:
            project_id: 项目唯一标识符

        Returns:
            项目存在返回True，否则返回False
        """
        return self.db.query(Project).filter(Project.id == project_id, Project.is_deleted == False).first() is not None

    def get_by_status(
        self,
        status: Optional[str] = None,
        community_name: Optional[str] = None,
        page: int = 1,
        page_size: int = 50
    ):
        """
        分页获取项目列表

        支持按状态和小区名称筛选，预加载关联数据。

        Args:
            status: 项目状态筛选条件
            community_name: 小区名称筛选条件（模糊匹配）
            page: 页码，从1开始
            page_size: 每页数量

        Returns:
            包含项目列表和分页信息的字典
        """
        query = self.db.query(Project).filter(Project.is_deleted == False)

        if status:
            query = query.filter(Project.status == status)

        if community_name:
            query = query.filter(Project.community_name.contains(community_name))

        # 预加载关联数据
        query = query.options(
            selectinload(Project.contract),
            selectinload(Project.owners),
            selectinload(Project.sale),
            selectinload(Project.project_manager),
        )

        total = query.count()

        projects = query.order_by(
            Project.created_at.desc()
        ).offset((page - 1) * page_size).limit(page_size).all()

        return {
            "items": projects,
            "total": total,
            "page": page,
            "page_size": page_size
        }
