"""L4 市场营销层查询服务.

负责L3项目查询和可关联项目列表获取.
通过L3 ProjectCoreService 查询，不直接操作L3 Model.
"""

from sqlalchemy.orm import Session

from schemas.l4_marketing.import_schemas import L3ProjectBriefResponse
from services.projects.core import ProjectCoreService
from settings import settings


class MarketingQueryService:
    """L4营销查询服务.

    负责查询可用于关联的L3项目列表
    以及获取L3项目详情用于数据导入

    通过L3 ProjectCoreService 编排查询，遵循跨层级 Service 编排约束.
    """

    def __init__(self, db: Session) -> None:
        """初始化查询服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db: Session = db
        self._l3_service: ProjectCoreService = ProjectCoreService(db)

    def get_available_l3_projects(
        self,
        community_name: str | None = None,
        status: str | None = None,
        page: int = 1,
        page_size: int | None = None,
    ) -> tuple[list[L3ProjectBriefResponse], int]:
        """获取可用于关联的L3项目列表.

        Args:
            community_name: 小区名称筛选（模糊匹配）
            status: 项目状态筛选
            page: 页码，从1开始
            page_size: 每页数量

        Returns:
            (项目列表, 总记录数)

        """
        effective_page_size = page_size if page_size is not None else settings.default_page_size
        result = self._l3_service.get_projects(
            status_filter=status,
            community_name=community_name,
            page=page,
            page_size=effective_page_size,
        )

        items = [
            L3ProjectBriefResponse(
                id=project.id,
                name=project.name or "未命名项目",
                community_name=project.community_name or "",
                address=project.address or "",
                area=project.area,
                layout=project.layout,
                orientation=project.orientation,
                status=project.status,
            )
            for project in result["items"]
        ]

        return items, result["total"]

    def get_l3_project_for_import(
        self,
        project_id: str,
    ) -> L3ProjectBriefResponse:
        """获取用于导入的L3项目详情.

        Args:
            project_id: L3项目ID

        Returns:
            L3项目精简信息

        Raises:
            ResourceNotFoundError: 项目不存在或已删除时抛出404错误

        """
        project = self._l3_service.get_project(project_id)

        return L3ProjectBriefResponse(
            id=project.id,
            name=project.name or "未命名项目",
            community_name=project.community_name or "",
            address=project.address or "",
            area=project.area,
            layout=project.layout,
            orientation=project.orientation,
            status=project.status,
        )

    def check_project_exists(self, project_id: str) -> bool:
        """检查项目是否存在.

        Args:
            project_id: 项目ID

        Returns:
            存在返回True，否则False

        """
        return self._l3_service.exists(project_id)


# 向后兼容的别名
L4MarketingQueryService = MarketingQueryService
