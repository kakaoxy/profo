"""
项目装修业务服务
负责：装修阶段流转、照片上传与管理

注意：已适配新的规范化表结构，装修信息使用 ProjectRenovation 表
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from fastapi import HTTPException, status
import uuid

from models import Project, ProjectRenovation, RenovationPhoto
from models.base import ProjectStatus
from schemas.project_renovation import RenovationUpdate, RenovationContractUpdate


class ProjectRenovationService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def _get_project(self, project_id: str) -> Project:
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="项目不存在")
        return project

    def _get_or_create_renovation(self, project_id: str) -> ProjectRenovation:
        """获取或创建装修记录"""
        renovation = self.db.query(ProjectRenovation).filter(
            ProjectRenovation.project_id == project_id,
            ProjectRenovation.is_deleted == False
        ).first()

        if not renovation:
            renovation = ProjectRenovation(
                id=str(uuid.uuid4()),
                project_id=project_id,
                is_deleted=False,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
            self.db.add(renovation)
            self.db.commit()
            self.db.refresh(renovation)

        return renovation

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

        # 获取或创建装修记录
        renovation = self._get_or_create_renovation(project_id)

        # 记录当前阶段的完成时间
        current_stage = project.renovation_stage
        if current_stage and renovation_data.stage_completed_at:
            # 更新装修记录的时间记录
            if not renovation.stage_completed_dates:
                renovation.stage_completed_dates = {}

            dates = dict(renovation.stage_completed_dates)
            dates[current_stage] = renovation_data.stage_completed_at.strftime("%Y-%m-%d")
            renovation.stage_completed_dates = dates

            flag_modified(renovation, "stage_completed_dates")

        # 更新到下一个阶段
        project.renovation_stage = renovation_data.renovation_stage.value
        project.stage_completed_at = renovation_data.stage_completed_at

        # 如果有实际开始/结束日期，更新到装修记录
        if renovation_data.renovation_stage.value == "拆除" and not renovation.actual_start_date:
            renovation.actual_start_date = datetime.utcnow()

        if renovation_data.stage_completed_at and renovation_data.renovation_stage.value == "已完成":
            renovation.actual_end_date = renovation_data.stage_completed_at

        renovation.updated_at = datetime.utcnow()

        self.db.commit()
        self.db.refresh(project)
        return project

    def get_renovation_info(self, project_id: str) -> Optional[ProjectRenovation]:
        """获取装修信息"""
        return self.db.query(ProjectRenovation).filter(
            ProjectRenovation.project_id == project_id,
            ProjectRenovation.is_deleted == False
        ).first()

    def update_renovation_info(self, project_id: str, renovation_data: Dict[str, Any]) -> ProjectRenovation:
        """更新装修信息"""
        project = self._get_project(project_id)

        # 验证状态
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value
        ]
        if project.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前状态不允许更新装修信息"
            )

        renovation = self._get_or_create_renovation(project_id)

        # 更新字段
        for field, value in renovation_data.items():
            if hasattr(renovation, field) and value is not None:
                setattr(renovation, field, value)

        renovation.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(renovation)

        return renovation

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

        # 获取装修记录ID
        renovation = self.db.query(ProjectRenovation).filter(
            ProjectRenovation.project_id == project_id,
            ProjectRenovation.is_deleted == False
        ).first()

        photo = RenovationPhoto(
            project_id=project_id,
            renovation_id=renovation.id if renovation else None,
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
            RenovationPhoto.is_deleted == False
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

        photo.is_deleted = True
        self.db.commit()

    def get_renovation_contract(self, project_id: str) -> ProjectRenovation:
        """获取装修合同信息"""
        project = self._get_project(project_id)
        renovation = self._get_or_create_renovation(project_id)
        return renovation

    def update_renovation_contract(self, project_id: str, contract_data: RenovationContractUpdate) -> ProjectRenovation:
        """更新装修合同信息"""
        project = self._get_project(project_id)

        # 验证状态：允许在装修、在售、已售阶段更新合同信息
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value
        ]
        if project.status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="当前状态不允许更新装修合同信息"
            )

        renovation = self._get_or_create_renovation(project_id)

        # 更新字段
        update_data = contract_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(renovation, field) and value is not None:
                setattr(renovation, field, value)

        renovation.updated_at = datetime.utcnow()
        self.db.commit()
        self.db.refresh(renovation)

        return renovation
