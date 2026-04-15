"""
L4 市场营销层查询服务
负责L3项目查询和可关联项目列表获取
"""
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, desc

from models import Project
from schemas.l4_project_import import L3ProjectBriefResponse


class L4MarketingQueryService:
    """L4营销查询服务
    
    负责查询可用于关联的L3项目列表
    以及获取L3项目详情用于数据导入
    """

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def get_available_l3_projects(
        self,
        community_name: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[L3ProjectBriefResponse], int]:
        """获取可用于关联的L3项目列表
        
        Args:
            community_name: 小区名称筛选（模糊匹配）
            status: 项目状态筛选
            page: 页码，从1开始
            page_size: 每页数量
            
        Returns:
            (项目列表, 总记录数)
        """
        query = self.db.query(Project).filter(
            Project.is_deleted == False
        )

        # 小区名称筛选
        if community_name:
            query = query.filter(
                Project.community_name.contains(community_name)
            )

        # 状态筛选
        if status:
            query = query.filter(Project.status == status)

        # 计算总数
        total: int = query.count()

        # 分页查询
        projects: List[Project] = query.order_by(
            desc(Project.created_at)
        ).offset((page - 1) * page_size).limit(page_size).all()

        # 转换为响应模型
        items = [
            L3ProjectBriefResponse(
                id=project.id,
                name=project.name or "未命名项目",
                community_name=project.community_name or "",
                address=project.address or "",
                area=project.area,
                layout=project.layout,
                orientation=project.orientation,
                status=project.status.value if hasattr(project.status, 'value') else str(project.status)
            )
            for project in projects
        ]

        return items, total

    def get_l3_project_for_import(
        self,
        project_id: str
    ) -> Optional[Project]:
        """获取用于导入的L3项目详情
        
        Args:
            project_id: L3项目ID
            
        Returns:
            Project对象或None（不存在或已删除）
        """
        return self.db.query(Project).filter(
            and_(
                Project.id == project_id,
                Project.is_deleted == False
            )
        ).first()

    def check_project_exists(self, project_id: str) -> bool:
        """检查项目是否存在
        
        Args:
            project_id: 项目ID
            
        Returns:
            存在返回True，否则False
        """
        return self.db.query(Project).filter(
            and_(
                Project.id == project_id,
                Project.is_deleted == False
            )
        ).first() is not None
