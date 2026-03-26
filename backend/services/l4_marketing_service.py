"""
L4 市场营销层服务
职责: 营销项目管理、媒体资源管理
"""
from typing import List, Tuple, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, desc, asc, func

from models import (
    L4MarketingProject,
    L4MarketingMedia,
    PublishStatus,
    MarketingProjectStatus,
)
from schemas.l4_marketing import (
    L4MarketingProjectCreate,
    L4MarketingProjectUpdate,
    L4MarketingMediaCreate,
    L4MarketingMediaUpdate,
)


class L4MarketingProjectService:
    """L4 营销项目服务"""

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def get_projects(
        self,
        skip: int = 0,
        limit: int = 20,
        publish_status: Optional[str] = None,
        project_status: Optional[str] = None,
        consultant_id: Optional[int] = None,
        community_id: Optional[int] = None,
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
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.is_deleted == False
        )

        if publish_status is not None:
            query = query.filter(L4MarketingProject.publish_status == publish_status)

        if project_status is not None:
            query = query.filter(L4MarketingProject.project_status == project_status)

        if consultant_id is not None:
            query = query.filter(L4MarketingProject.consultant_id == consultant_id)

        if community_id is not None:
            query = query.filter(L4MarketingProject.community_id == community_id)

        total: int = query.count()

        items: List[L4MarketingProject] = query.order_by(
            desc(L4MarketingProject.sort_order),
            desc(L4MarketingProject.created_at)
        ).offset(skip).limit(limit).all()

        return items, total

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

        Args:
            data: 创建数据

        Returns:
            创建的营销项目
        """
        db_obj = L4MarketingProject(**data.model_dump())
        self.db.add(db_obj)
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

        for field, value in update_data.items():
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


class L4MarketingMediaService:
    """L4 营销媒体服务"""

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def get_media_list(
        self,
        marketing_project_id: int,
        skip: int = 0,
        limit: int = 100
    ) -> Tuple[List[L4MarketingMedia], int]:
        """
        获取媒体列表

        Args:
            marketing_project_id: 营销项目ID
            skip: 跳过记录数
            limit: 返回记录数

        Returns:
            (媒体列表, 总记录数)
        """
        query = self.db.query(L4MarketingMedia).filter(
            and_(
                L4MarketingMedia.marketing_project_id == marketing_project_id,
                L4MarketingMedia.is_deleted == False
            )
        )

        total: int = query.count()
        items: List[L4MarketingMedia] = query.order_by(
            asc(L4MarketingMedia.sort_order),
            desc(L4MarketingMedia.created_at)
        ).offset(skip).limit(limit).all()

        return items, total

    def get_media(self, media_id: int) -> Optional[L4MarketingMedia]:
        """
        获取单个媒体

        Args:
            media_id: 媒体ID

        Returns:
            媒体对象或None
        """
        return self.db.query(L4MarketingMedia).filter(
            and_(
                L4MarketingMedia.id == media_id,
                L4MarketingMedia.is_deleted == False
            )
        ).first()

    def create_media(
        self,
        data: L4MarketingMediaCreate,
        marketing_project_id: int
    ) -> L4MarketingMedia:
        """
        创建媒体记录

        Args:
            data: 创建数据
            marketing_project_id: 营销项目ID

        Returns:
            创建的媒体
        """
        db_obj = L4MarketingMedia(
            **data.model_dump(),
            marketing_project_id=marketing_project_id
        )
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def update_media(
        self,
        media_id: int,
        data: L4MarketingMediaUpdate
    ) -> Optional[L4MarketingMedia]:
        """
        更新媒体

        Args:
            media_id: 媒体ID
            data: 更新数据

        Returns:
            更新后的媒体或None
        """
        db_obj = self.get_media(media_id)
        if not db_obj:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def delete_media(self, media_id: int) -> bool:
        """
        逻辑删除媒体

        Args:
            media_id: 媒体ID

        Returns:
            是否删除成功
        """
        db_obj = self.get_media(media_id)
        if not db_obj:
            return False

        db_obj.is_deleted = True
        self.db.commit()
        return True
