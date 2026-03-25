"""
L4 市场营销层服务
职责: 营销项目管理、媒体资源管理、顾问管理
"""
from typing import List, Tuple, Optional, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select, and_, desc, asc
from fastapi import HTTPException, status

from models import (
    L4MarketingProject,
    L4MarketingMedia,
    L4Consultant,
    MarketingProjectStatus,
    Project,
    ProjectStatus,
    RenovationPhoto,
)
from schemas.l4_marketing import (
    L4MarketingProjectCreate,
    L4MarketingProjectUpdate,
    L4MarketingMediaCreate,
    L4MarketingMediaUpdate,
    L4ConsultantCreate,
    L4ConsultantUpdate,
)


class L4MarketingProjectService:
    """L4 营销项目服务"""

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def get_projects(
        self,
        skip: int = 0,
        limit: int = 20,
        is_published: Optional[bool] = None,
        project_status: Optional[str] = None,
        consultant_id: Optional[str] = None
    ) -> Tuple[List[L4MarketingProject], int]:
        """
        获取营销项目列表

        Args:
            skip: 跳过记录数
            limit: 返回记录数
            is_published: 是否已发布筛选
            project_status: 项目状态筛选
            consultant_id: 顾问ID筛选

        Returns:
            (项目列表, 总记录数)
        """
        query = self.db.query(L4MarketingProject).filter(
            L4MarketingProject.is_deleted == False
        )

        if is_published is not None:
            query = query.filter(L4MarketingProject.is_published == is_published)

        if project_status is not None:
            query = query.filter(L4MarketingProject.project_status == project_status)

        if consultant_id is not None:
            query = query.filter(L4MarketingProject.consultant_id == consultant_id)

        total: int = query.count()

        items: List[L4MarketingProject] = query.options(
            joinedload(L4MarketingProject.consultant),
            joinedload(L4MarketingProject.media_files)
        ).order_by(
            desc(L4MarketingProject.sort_order),
            desc(L4MarketingProject.published_at),
            desc(L4MarketingProject.created_at)
        ).offset(skip).limit(limit).all()

        return items, total

    def get_project(self, project_id: str) -> Optional[L4MarketingProject]:
        """
        获取单个营销项目详情

        Args:
            project_id: 营销项目ID

        Returns:
            营销项目对象或None
        """
        return self.db.query(L4MarketingProject).options(
            joinedload(L4MarketingProject.consultant),
            joinedload(L4MarketingProject.media_files)
        ).filter(
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
        project_id: str,
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

        # 自动设置发布时间
        if update_data.get('is_published') and not db_obj.published_at:
            db_obj.published_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def delete_project(self, project_id: str) -> bool:
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

    def sync_from_l3_project(self, l3_project_id: str) -> Optional[L4MarketingProject]:
        """
        从 L3 项目同步创建营销项目

        Args:
            l3_project_id: L3 项目ID

        Returns:
            创建的营销项目或None
        """
        project: Optional[Project] = self.db.query(Project).filter(
            and_(
                Project.id == l3_project_id,
                Project.is_deleted == False,
                Project.status != ProjectStatus.DELETED
            )
        ).first()

        if not project:
            return None

        # 构建户型字符串
        layout: Optional[str] = project.layout
        if layout is None and project.rooms is not None:
            parts: List[str] = [f"{project.rooms}室"]
            if project.halls is not None:
                parts.append(f"{project.halls}厅")
            if project.baths is not None:
                parts.append(f"{project.baths}卫")
            layout = "".join(parts)

        # 构建地址
        address: str = ""
        if project.community_name:
            address = f"{project.community_name} {project.address}"
        else:
            address = project.address or ""

        db_obj = L4MarketingProject(
            project_id=project.id,
            title=project.name,
            address=address,
            area=project.area,
            price=None,  # L3 项目没有直接的 price 字段
            layout=layout,
            orientation=project.orientation,
            project_status=MarketingProjectStatus.IN_PROGRESS,
            is_published=False
        )

        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def sync_all_from_l3(self) -> int:
        """
        批量同步所有未同步的 L3 项目

        Returns:
            同步数量
        """
        # 获取已同步的 L3 项目ID
        existing_ids: set[str] = set(
            row[0] for row in self.db.query(L4MarketingProject.project_id).filter(
                L4MarketingProject.project_id.isnot(None)
            ).all()
        )

        # 获取未同步且未删除的 L3 项目
        new_projects: List[Project] = self.db.query(Project).filter(
            and_(
                Project.id.notin_(existing_ids) if existing_ids else True,
                Project.is_deleted == False,
                Project.status != ProjectStatus.DELETED
            )
        ).all()

        count: int = 0
        for project in new_projects:
            if self.sync_from_l3_project(project.id):
                count += 1

        return count

    def refresh_hard_fields(self, project_id: str) -> bool:
        """
        刷新硬字段（从 L3 项目重新复制）

        Args:
            project_id: 营销项目ID

        Returns:
            是否刷新成功
        """
        marketing_project: Optional[L4MarketingProject] = self.get_project(project_id)
        if not marketing_project or not marketing_project.project_id:
            return False

        project: Optional[Project] = self.db.query(Project).filter(
            Project.id == marketing_project.project_id
        ).first()

        if not project:
            return False

        # 刷新硬字段
        address: str = ""
        if project.community_name:
            address = f"{project.community_name} {project.address}"
        else:
            address = project.address or ""

        marketing_project.address = address
        marketing_project.area = project.area

        # 构建户型
        layout: Optional[str] = project.layout
        if layout is None and project.rooms is not None:
            parts: List[str] = [f"{project.rooms}室"]
            if project.halls is not None:
                parts.append(f"{project.halls}厅")
            if project.baths is not None:
                parts.append(f"{project.baths}卫")
            layout = "".join(parts)

        marketing_project.layout = layout
        marketing_project.orientation = project.orientation

        self.db.commit()
        self.db.refresh(marketing_project)
        return True


class L4MarketingMediaService:
    """L4 营销媒体服务"""

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def get_media_list(
        self,
        marketing_project_id: str,
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

    def get_media(self, media_id: str) -> Optional[L4MarketingMedia]:
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
        marketing_project_id: str
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
        media_id: str,
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

    def delete_media(self, media_id: str) -> bool:
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

    def get_source_photos(self, marketing_project_id: str) -> List[RenovationPhoto]:
        """
        获取来源照片（从关联的 L3 项目）

        Args:
            marketing_project_id: 营销项目ID

        Returns:
            照片列表
        """
        marketing_project: Optional[L4MarketingProject] = self.db.query(
            L4MarketingProject
        ).filter(
            L4MarketingProject.id == marketing_project_id
        ).first()

        if not marketing_project or not marketing_project.project_id:
            return []

        photos: List[RenovationPhoto] = self.db.query(RenovationPhoto).filter(
            and_(
                RenovationPhoto.project_id == marketing_project.project_id,
                RenovationPhoto.is_deleted == False
            )
        ).all()

        return photos


class L4ConsultantService:
    """L4 顾问服务"""

    def __init__(self, db: Session) -> None:
        self.db: Session = db

    def get_consultants(
        self,
        skip: int = 0,
        limit: int = 20,
        is_active: Optional[bool] = None
    ) -> Tuple[List[L4Consultant], int]:
        """
        获取顾问列表

        Args:
            skip: 跳过记录数
            limit: 返回记录数
            is_active: 是否在职筛选

        Returns:
            (顾问列表, 总记录数)
        """
        query = self.db.query(L4Consultant).filter(
            L4Consultant.is_deleted == False
        )

        if is_active is not None:
            query = query.filter(L4Consultant.is_active == is_active)

        total: int = query.count()
        items: List[L4Consultant] = query.order_by(
            desc(L4Consultant.created_at)
        ).offset(skip).limit(limit).all()

        return items, total

    def get_consultant(self, consultant_id: str) -> Optional[L4Consultant]:
        """
        获取单个顾问

        Args:
            consultant_id: 顾问ID

        Returns:
            顾问对象或None
        """
        return self.db.query(L4Consultant).filter(
            and_(
                L4Consultant.id == consultant_id,
                L4Consultant.is_deleted == False
            )
        ).first()

    def create_consultant(self, data: L4ConsultantCreate) -> L4Consultant:
        """
        创建顾问

        Args:
            data: 创建数据

        Returns:
            创建的顾问
        """
        db_obj = L4Consultant(**data.model_dump())
        self.db.add(db_obj)
        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def update_consultant(
        self,
        consultant_id: str,
        data: L4ConsultantUpdate
    ) -> Optional[L4Consultant]:
        """
        更新顾问

        Args:
            consultant_id: 顾问ID
            data: 更新数据

        Returns:
            更新后的顾问或None
        """
        db_obj = self.get_consultant(consultant_id)
        if not db_obj:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_obj, field, value)

        self.db.commit()
        self.db.refresh(db_obj)
        return db_obj

    def delete_consultant(self, consultant_id: str) -> bool:
        """
        逻辑删除顾问

        Args:
            consultant_id: 顾问ID

        Returns:
            是否删除成功
        """
        db_obj = self.get_consultant(consultant_id)
        if not db_obj:
            return False

        db_obj.is_deleted = True
        self.db.commit()
        return True
