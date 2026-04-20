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


class MarketingProjectService:
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
            data: 创建数据，可包含媒体文件列表

        Returns:
            创建的营销项目
        """
        # 提取媒体文件数据（如果有）
        media_files = data.media_files

        # 创建项目对象（不包含 media_files）
        project_data = data.model_dump(exclude={'media_files'})
        db_obj = L4MarketingProject(**project_data)
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        
        # 如果有媒体文件，批量创建媒体记录
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


class MarketingMediaService:
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

    def batch_update_sort_order(
        self,
        project_id: int,
        sort_updates: List[dict]
    ) -> int:
        """
        批量更新媒体排序

        Args:
            project_id: 营销项目ID
            sort_updates: 排序更新列表，每项包含 media_id 和 sort_order

        Returns:
            更新成功的记录数
        """
        if not sort_updates:
            return 0

        # 构建 media_id -> sort_order 映射
        update_map = {
            u.get("media_id"): u.get("sort_order")
            for u in sort_updates
            if u.get("media_id") is not None and u.get("sort_order") is not None
        }

        if not update_map:
            return 0

        # 一次性查询所有需要更新的媒体记录
        media_ids = list(update_map.keys())
        media_list = self.db.query(L4MarketingMedia).filter(
            and_(
                L4MarketingMedia.id.in_(media_ids),
                L4MarketingMedia.marketing_project_id == project_id,
                L4MarketingMedia.is_deleted == False
            )
        ).all()

        # 更新排序值
        updated_count = 0
        for media in media_list:
            media.sort_order = update_map[media.id]
            updated_count += 1

        if updated_count > 0:
            self.db.commit()

        return updated_count


# 向后兼容的别名
L4MarketingProjectService = MarketingProjectService
L4MarketingMediaService = MarketingMediaService
