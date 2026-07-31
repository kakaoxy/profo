"""项目装修业务服务.

负责：装修阶段流转、照片上传与管理.

注意：已适配新的规范化表结构，装修信息使用 ProjectRenovation 表
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from models import Project, ProjectRenovation, RenovationPhoto
from models.common import ProjectStatus, RenovationStage
from schemas.project.renovation import RenovationContractUpdate, RenovationUpdate
from services.system.exceptions import BusinessLogicError, ResourceNotFoundError

# 允许更新的装修字段白名单（防止设置 id/is_deleted 等敏感字段）
_RENOVATION_ALLOWED_FIELDS = {
    "renovation_company",
    "contact_person_id",
    "contract_start_date",
    "contract_end_date",
    "actual_start_date",
    "actual_end_date",
    "hard_contract_amount",
    "payment_node_1",
    "payment_ratio_1",
    "payment_node_2",
    "payment_ratio_2",
    "payment_node_3",
    "payment_ratio_3",
    "payment_node_4",
    "payment_ratio_4",
    "soft_budget",
    "soft_detail_attachment",
    "custom_cabinet_amount",
    "window_amount",
    "wall_treatment_amount",
    "design_fee",
    "demolition_fee",
    "garbage_fee",
    "other_extra_fee",
    "other_fee_reason",
}


class RenovationService:
    """项目装修服务."""

    def __init__(self, db: Session) -> None:
        """初始化装修服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def _get_project(self, project_id: str) -> Project:
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
        return project

    def _get_or_create_renovation(self, project_id: str) -> ProjectRenovation:
        """获取或创建装修记录."""
        renovation = (
            self.db.query(ProjectRenovation)
            .filter(
                ProjectRenovation.project_id == project_id,
                ProjectRenovation.is_deleted.is_(False),
            )
            .first()
        )

        if not renovation:
            renovation = ProjectRenovation(
                id=str(uuid.uuid4()),
                project_id=project_id,
                is_deleted=False,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            self.db.add(renovation)
            self.db.commit()
            self.db.refresh(renovation)

        return renovation

    @staticmethod
    def _derive_stage_from_completed_dates(dates: dict[str, str]) -> str:
        """根据已完成的阶段日期推导当前主阶段.

        按枚举顺序找到最后一个已完成的实际阶段作为当前主阶段；
        若无任何已完成阶段，回退到首个阶段（拆除）。

        Args:
            dates: stage_completed_dates 映射（阶段值 -> 日期字符串）

        Returns:
            当前主阶段值（RenovationStage 的 value）

        """
        real_stages = [s for s in RenovationStage if s != RenovationStage.COMPLETED]
        last_completed = real_stages[0]  # 默认回退到首个阶段（拆除）
        for stage in real_stages:
            if stage.value in dates:
                last_completed = stage
        return last_completed.value

    def update_stage(self, project_id: str, renovation_data: RenovationUpdate) -> Project:
        """更新改造阶段.

        权限校验由 Router 层 ProjectRenovationCompleteStagePermDep 注入，
        Service 层不再重复校验。
        """
        project = self._get_project(project_id)

        # 验证当前状态
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value,
        ]
        if project.status not in allowed_statuses:
            msg = "当前状态不允许更新改造进度"
            raise BusinessLogicError(msg)

        # 获取或创建装修记录
        renovation = self._get_or_create_renovation(project_id)

        # 记录指定阶段的完成时间（支持无序完成）
        current_stage = project.renovation_stage
        stage_to_record = renovation_data.completed_stage or renovation_data.renovation_stage or current_stage
        auto_completed = False  # 标记是否触发自动竣工，避免被后续显式 renovation_stage 覆盖
        if stage_to_record and renovation_data.stage_completed_at:
            if not renovation.stage_completed_dates:
                renovation.stage_completed_dates = {}

            dates = dict(renovation.stage_completed_dates)
            dates[stage_to_record.value] = renovation_data.stage_completed_at.strftime("%Y-%m-%d")
            renovation.stage_completed_dates = dates

            flag_modified(renovation, "stage_completed_dates")

            # 无序完成后自动检测：若所有实际阶段均已标记完成，自动设置竣工时间与终态
            real_stage_values = {s.value for s in RenovationStage if s != RenovationStage.COMPLETED}
            if real_stage_values.issubset(dates.keys()) and not renovation.actual_end_date:
                renovation.actual_end_date = renovation_data.stage_completed_at
                project.renovation_stage = RenovationStage.COMPLETED.value
                auto_completed = True

        # 仅在传入 renovation_stage 且未触发自动竣工时流转（避免覆盖自动竣工结果）
        target_stage = renovation_data.renovation_stage
        if target_stage and not auto_completed:
            project.renovation_stage = target_stage.value

        # 如果有实际开始日期，更新到装修记录
        if stage_to_record == RenovationStage.DEMOLITION and not renovation.actual_start_date:
            renovation.actual_start_date = datetime.now(timezone.utc)

        renovation.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(project)
        return project

    def update_stage_date(
        self,
        project_id: str,
        stage: RenovationStage,
        stage_completed_at: datetime | None,
    ) -> Project:
        """修改/清空已完成阶段的完成时间（仅管理员）.

        权限校验由 Router 层 CurrentAdminUserDep 注入（仅 admin 可调用），
        Service 层不再重复校验角色。
        不流转 project.renovation_stage 主阶段，仅修改 stage_completed_dates。
        清空日期时根据剩余已完成阶段回退主阶段，避免硬编码。

        Args:
            project_id: 项目ID
            stage: 要修改的阶段
            stage_completed_at: 新完成时间；None 表示清空回退未完成

        Raises:
            ResourceNotFoundError: 项目不存在
            BusinessLogicError: 项目状态不允许（非 renovating/selling/sold）

        """
        project = self._get_project(project_id)

        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value,
        ]
        if project.status not in allowed_statuses:
            msg = "当前状态不允许修改改造进度"
            raise BusinessLogicError(msg)

        renovation = self._get_or_create_renovation(project_id)

        dates = {} if not renovation.stage_completed_dates else dict(renovation.stage_completed_dates)

        if stage_completed_at is None:
            # 清空回退
            dates.pop(stage.value, None)
            # 联动清理实际开工/竣工时间
            if stage == RenovationStage.DEMOLITION:
                renovation.actual_start_date = None
            elif stage == RenovationStage.COMPLETED:
                renovation.actual_end_date = None

            # 清空阶段日期后，若不再满足全部完成条件，根据剩余已完成阶段回退主阶段
            real_stage_values = {s.value for s in RenovationStage if s != RenovationStage.COMPLETED}
            if project.renovation_stage == RenovationStage.COMPLETED.value and not real_stage_values.issubset(
                dates.keys()
            ):
                project.renovation_stage = self._derive_stage_from_completed_dates(dates)
        else:
            # 修改日期
            dates[stage.value] = stage_completed_at.strftime("%Y-%m-%d")
            # 联动：拆除/已完成 的实际时间同步更新
            if stage == RenovationStage.DEMOLITION:
                renovation.actual_start_date = stage_completed_at
            elif stage == RenovationStage.COMPLETED:
                renovation.actual_end_date = stage_completed_at

        renovation.stage_completed_dates = dates or None
        flag_modified(renovation, "stage_completed_dates")
        renovation.updated_at = datetime.now(timezone.utc)

        self.db.commit()
        self.db.refresh(project)
        return project

    def get_info(self, project_id: str) -> ProjectRenovation | None:
        """获取装修信息."""
        return (
            self.db.query(ProjectRenovation)
            .filter(
                ProjectRenovation.project_id == project_id,
                ProjectRenovation.is_deleted.is_(False),
            )
            .first()
        )

    def update_info(self, project_id: str, renovation_data: dict[str, Any]) -> ProjectRenovation:
        """更新装修信息."""
        project = self._get_project(project_id)

        # 验证状态
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value,
        ]
        if project.status not in allowed_statuses:
            msg = "当前状态不允许更新装修信息"
            raise BusinessLogicError(msg)

        renovation = self._get_or_create_renovation(project_id)

        # 更新字段（使用白名单过滤，防止设置敏感字段）
        for field, value in renovation_data.items():
            if field in _RENOVATION_ALLOWED_FIELDS and value is not None:
                setattr(renovation, field, value)

        renovation.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(renovation)

        return renovation

    def add_photo(
        self,
        project_id: str,
        stage: str,
        url: str,
        filename: str | None = None,
        description: str | None = None,
        thumbnail_url: str | None = None,
        media_type: str = "image",
    ) -> RenovationPhoto:
        """添加改造阶段照片.

        权限校验由 Router 层 ProjectRenovationUploadPhotoPermDep 注入（业务身份双通道），
        Service 层不再重复校验。
        """
        project = self._get_project(project_id)

        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value,
        ]
        if project.status not in allowed_statuses:
            msg = "当前状态不允许上传装修照片"
            raise BusinessLogicError(msg)

        # 获取装修记录ID
        renovation = (
            self.db.query(ProjectRenovation)
            .filter(
                ProjectRenovation.project_id == project_id,
                ProjectRenovation.is_deleted.is_(False),
            )
            .first()
        )

        photo = RenovationPhoto(
            project_id=project_id,
            renovation_id=renovation.id if renovation else None,
            stage=stage,
            url=url,
            filename=filename,
            description=description,
            thumbnail_url=thumbnail_url,
            media_type=media_type,
        )
        self.db.add(photo)
        self.db.commit()
        self.db.refresh(photo)
        return photo

    def get_photos(self, project_id: str, stage: str | None = None) -> list[RenovationPhoto]:
        """获取改造阶段照片."""
        query = self.db.query(RenovationPhoto).filter(
            RenovationPhoto.project_id == project_id,
            RenovationPhoto.is_deleted.is_(False),
        )
        if stage:
            query = query.filter(RenovationPhoto.stage == stage)
        return query.order_by(RenovationPhoto.created_at.desc()).all()

    def delete_photo(self, project_id: str, photo_id: str) -> None:
        """删除改造阶段照片 (软删除).

        权限校验由 Router 层 ProjectRenovationUploadPhotoPermDep 注入。
        """
        photo = (
            self.db.query(RenovationPhoto)
            .filter(
                RenovationPhoto.id == photo_id,
                RenovationPhoto.project_id == project_id,
            )
            .first()
        )

        if not photo:
            msg = "照片不存在"
            raise ResourceNotFoundError(msg)

        photo.is_deleted = True
        self.db.commit()

    def get_contract(self, project_id: str) -> ProjectRenovation:
        """获取装修合同信息."""
        self._get_project(project_id)
        return self._get_or_create_renovation(project_id)

    def update_contract(
        self,
        project_id: str,
        contract_data: RenovationContractUpdate,
    ) -> ProjectRenovation:
        """更新装修合同信息."""
        project = self._get_project(project_id)

        # 验证状态
        allowed_statuses = [
            ProjectStatus.RENOVATING.value,
            ProjectStatus.SELLING.value,
            ProjectStatus.SOLD.value,
        ]
        if project.status not in allowed_statuses:
            msg = "当前状态不允许更新装修合同信息"
            raise BusinessLogicError(msg)

        renovation = self._get_or_create_renovation(project_id)

        # 更新字段（使用白名单过滤，防止设置敏感字段）
        update_data = contract_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field in _RENOVATION_ALLOWED_FIELDS and value is not None:
                setattr(renovation, field, value)

        renovation.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(renovation)

        return renovation


# 保持向后兼容的别名
ProjectRenovationService = RenovationService
