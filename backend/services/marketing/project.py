"""
L4 市场营销层项目服务
职责: 营销项目管理
"""
from typing import List, Tuple, Optional
from sqlalchemy.orm import Session, Query
from sqlalchemy import and_, desc

from models import L4MarketingProject, L4MarketingMedia
from schemas.l4_marketing import L4MarketingProjectCreate, L4MarketingProjectUpdate, L4MarketingProjectSummary
from schemas.l4_marketing.enums import PublishStatus, MarketingProjectStatus


class MarketingProjectService:
    """L4 营销项目服务"""

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def _build_base_query(
        self,
        publish_status: Optional[PublishStatus] = None,
        project_status: Optional[MarketingProjectStatus] = None,
        consultant_id: Optional[str] = None,
        community_id: Optional[str] = None,
    ) -> Query:
        """
        构建基础查询 - 抽离复用的筛选逻辑

        Args:
            publish_status: 发布状态筛选
            project_status: 项目状态筛选
            consultant_id: 顾问ID筛选
            community_id: 小区ID筛选

        Returns:
            基础查询对象
        """
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.is_deleted == False
        )

        if publish_status is not None:
            query = query.filter(L4MarketingProject.publish_status == publish_status.value)

        if project_status is not None:
            query = query.filter(L4MarketingProject.project_status == project_status.value)

        if consultant_id is not None:
            query = query.filter(L4MarketingProject.consultant_id == consultant_id)

        if community_id is not None:
            query = query.filter(L4MarketingProject.community_id == community_id)

        return query

    def get_projects(
        self,
        skip: int = 0,
        limit: int = 20,
        publish_status: Optional[PublishStatus] = None,
        project_status: Optional[MarketingProjectStatus] = None,
        consultant_id: Optional[str] = None,
        community_id: Optional[str] = None,
    ) -> Tuple[List[L4MarketingProject], int]:
        """
        获取营销项目列表

        Args:
            skip: 跳过记录数
            limit: 返回记录数
            publish_status: 发布状态筛选
            project_status: 项目状态筛选
            consultant_id: 顾问ID筛选
            community_id: 小区ID筛选

        Returns:
            (项目列表, 总记录数)
        """
        query = self._build_base_query(
            publish_status=publish_status,
            project_status=project_status,
            consultant_id=consultant_id,
            community_id=community_id,
        )

        total: int = query.count()

        items: List[L4MarketingProject] = query.order_by(
            desc(L4MarketingProject.sort_order),
            desc(L4MarketingProject.created_at)
        ).offset(skip).limit(limit).all()

        return items, total

    def get_projects_summary(
        self,
        publish_status: Optional[PublishStatus] = None,
        project_status: Optional[MarketingProjectStatus] = None,
        consultant_id: Optional[str] = None,
        community_id: Optional[str] = None,
    ) -> L4MarketingProjectSummary:
        """
        获取营销项目摘要统计 - 基于筛选条件的全量统计，不受分页影响

        Args:
            publish_status: 发布状态筛选
            project_status: 项目状态筛选
            consultant_id: 顾问ID筛选
            community_id: 小区ID筛选

        Returns:
            摘要统计对象
        """
        query = self._build_base_query(
            publish_status=publish_status,
            project_status=project_status,
            consultant_id=consultant_id,
            community_id=community_id,
        )

        total: int = query.count()

        published: int = query.filter(
            L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value
        ).count()

        draft: int = query.filter(
            L4MarketingProject.publish_status == PublishStatus.DRAFT.value
        ).count()

        for_sale: int = query.filter(
            L4MarketingProject.project_status == MarketingProjectStatus.FOR_SALE.value
        ).count()

        sold: int = query.filter(
            L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value
        ).count()

        in_progress: int = query.filter(
            L4MarketingProject.project_status == MarketingProjectStatus.IN_PROGRESS.value
        ).count()

        return L4MarketingProjectSummary(
            total=total,
            published=published,
            draft=draft,
            for_sale=for_sale,
            sold=sold,
            in_progress=in_progress,
        )

    def get_project(self, project_id: int) -> Optional[L4MarketingProject]:
        """
        获取单个营销项目详情

        Args:
            project_id: 营销项目ID

        Returns:
            营销项目对象或None
        """
        return self.db.query(L4MarketingProject).filter(
            and_(
                L4MarketingProject.id == project_id,
                L4MarketingProject.is_deleted == False
            )
        ).first()

    def create_project(
        self,
        data: L4MarketingProjectCreate
    ) -> L4MarketingProject:
        """
        创建独立营销项目

        项目和媒体文件在同一个事务中创建，确保数据一致性。

        Args:
            data: 创建数据，可包含媒体文件列表

        Returns:
            创建的营销项目
        """
        media_files = data.media_files

        project_data = data.model_dump(exclude={'media_files'})
        db_obj = L4MarketingProject(**project_data)
        self.db.add(db_obj)

        if media_files:
            for idx, media_data in enumerate(media_files):
                media_obj = L4MarketingMedia(
                    marketing_project_id=db_obj.id,
                    file_url=media_data.file_url,
                    thumbnail_url=media_data.thumbnail_url,
                    media_type=media_data.media_type,
                    photo_category=media_data.photo_category,
                    renovation_stage=media_data.renovation_stage,
                    description=media_data.description,
                    sort_order=media_data.sort_order if media_data.sort_order is not None else idx,
                    origin_media_id=media_data.origin_media_id
                )
                self.db.add(media_obj)

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def update_project(
        self,
        project_id: int,
        data: L4MarketingProjectUpdate
    ) -> Optional[L4MarketingProject]:
        """
        更新营销项目

        Args:
            project_id: 营销项目ID
            data: 更新数据

        Returns:
            更新后的营销项目或None
        """
        db_obj = self.get_project(project_id)
        if not db_obj:
            return None

        update_data = data.model_dump(exclude_unset=True)
        allowed_fields = {
            'community_id', 'community_name', 'layout', 'orientation',
            'floor_info', 'area', 'total_price', 'title', 'images',
            'sort_order', 'tags', 'decoration_style', 'publish_status',
            'project_status', 'project_id', 'consultant_id'
        }
        # unit_price 由 area 和 total_price 自动计算，不允许直接修改

        for field, value in update_data.items():
            if field in allowed_fields:
                setattr(db_obj, field, value)

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def delete_project(self, project_id: int) -> bool:
        """
        逻辑删除营销项目

        Args:
            project_id: 营销项目ID

        Returns:
            是否删除成功
        """
        db_obj = self.get_project(project_id)
        if not db_obj:
            return False

        db_obj.is_deleted = True
        self.db.commit()
        return True


# 向后兼容的别名
L4MarketingProjectService = MarketingProjectService