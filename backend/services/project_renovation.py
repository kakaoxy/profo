"""
项目装修业务服务
负责：装修阶段流转、照片上传与管理
"""
from typing import Optional, List
from datetime import datetime
from sqlalchemy.orm import Session
from fastapi import HTTPException, status

from models import Project, RenovationPhoto
from models.base import ProjectStatus
from schemas.project_renovation import RenovationUpdate

class ProjectRenovationService:
    def __init__(self, db: Session):
        self.db = db

    def _get_project(self, project_id: str) -> Project:
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        return project

    def update_renovation_stage(self, project_id: str, renovation_data: RenovationUpdate) -> Project:
        """更新改造阶段"""
        project = self._get_project(project_id)

        # 验证当前状态：允许在改造、在售、已售阶段更新改造子阶段 (用于补录信息)
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value
        ]
        if project.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前状态不允许更新改造进度"
            )

        project.renovation_stage = renovation_data.renovation_stage.value
        project.stage_completed_at = renovation_data.stage_completed_at

        self.db.commit()
        self.db.refresh(project)
        return project

    def add_renovation_photo(self, project_id: str, stage: str, url: str,
                           filename: Optional[str] = None,
                           description: Optional[str] = None) -> RenovationPhoto:
        """添加改造阶段照片"""
        project = self._get_project(project_id)

        # 同样允许后续阶段补传照片
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value
        ]
        if project.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前状态不允许上传装修照片"
            )

        photo = RenovationPhoto(
            project_id=project_id,
            stage=stage,
            url=url,
            filename=filename,
            description=description
        )
        self.db.add(photo)
        self.db.commit()
        self.db.refresh(photo)
        return photo

    def get_renovation_photos(self, project_id: str, stage: Optional[str] = None) -> List[RenovationPhoto]:
        """获取改造阶段照片"""
        # 只查询未被软删除的照片
        query = self.db.query(RenovationPhoto).filter(
            RenovationPhoto.project_id == project_id,
            RenovationPhoto.deleted_at.is_(None)
        )
        if stage:
            query = query.filter(RenovationPhoto.stage == stage)
        return query.order_by(RenovationPhoto.created_at.desc()).all()

    def delete_renovation_photo(self, project_id: str, photo_id: str) -> None:
        """删除改造阶段照片 (软删除)"""
        photo = self.db.query(RenovationPhoto).filter(
            RenovationPhoto.id == photo_id,
            RenovationPhoto.project_id == project_id
        ).first()

        if not photo:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="照片不存在"
            )

        photo.deleted_at = datetime.utcnow()
        self.db.commit()