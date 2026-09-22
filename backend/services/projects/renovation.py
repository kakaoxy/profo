"""项目装修业务服务.

负责：装修阶段流转、照片上传与管理.

注意：已适配新的规范化表结构，装修信息使用 ProjectRenovation 表
"""

import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import Request
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from models import Project, ProjectRenovation, RenovationPhoto
from models.common import ProjectStatus, RenovationStage
from schemas.project.renovation import RenovationContractUpdate, RenovationUpdate
from services.projects.core import attachment_url_in_use
from services.system.exceptions import BusinessLogicError, ResourceNotFoundError
from services.system.operation_log import operation_log_service
from utils.storage import extract_storage_key, get_storage_backend

logger = logging.getLogger(__name__)

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


def _delete_storage_file(url: str) -> None:
    """删除存储中的物理文件（best-effort：解析失败或删除失败仅记日志，不抛异常）.

    用于软装明细附件被移除/替换后清理旧文件，避免孤儿文件堆积。
    """
    key = extract_storage_key(url)
    if key is None:
        logger.warning("装修合同：无法从附件 URL 反解存储键，跳过删除: %s", url)
        return
    try:
        get_storage_backend().delete_file(key)
    except Exception:
        logger.exception("装修合同：删除旧附件文件失败（不影响保存结果）: %s", key)


def _snapshot_value(value: Any) -> Any:
    """审计快照值 JSON 安全化：datetime/Decimal 等非原生 JSON 类型转为字符串."""
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def _stage_snapshot(project: Project, renovation: ProjectRenovation) -> dict[str, Any]:
    """装修阶段进度快照（审计日志用，含主阶段/各阶段完成时间/实际开竣工时间）."""
    return {
        "renovation_stage": project.renovation_stage,
        "stage_completed_dates": (dict(renovation.stage_completed_dates) if renovation.stage_completed_dates else None),
        "actual_start_date": _snapshot_value(renovation.actual_start_date),
        "actual_end_date": _snapshot_value(renovation.actual_end_date),
    }


def _renovation_contract_snapshot(renovation: ProjectRenovation) -> dict[str, Any]:
    """装修合同关键字段快照（审计日志用，覆盖更新白名单全部字段）."""
    return {field: _snapshot_value(getattr(renovation, field, None)) for field in _RENOVATION_ALLOWED_FIELDS}


class RenovationService:
    """项目装修服务."""

    def __init__(self, db: Session) -> None:
        """初始化装修服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def _get_project(self, project_id: uuid.UUID) -> Project:
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
        return project

    def _get_or_create_renovation(self, project_id: uuid.UUID) -> ProjectRenovation:
        """获取或创建装修记录.

        并发安全策略：
        - 已存在记录：with_for_update 行级锁，防止并发 update_stage 时
          stage_completed_dates 被覆盖（last-write-wins）；
        - 创建路径：首次查询无行可锁、无互斥，正确性依赖 flush 撞唯一约束后的
          IntegrityError 回退 + FOR UPDATE 重查（阻塞至竞争事务提交后返回该行）。
        """
        from sqlalchemy.exc import IntegrityError

        renovation = (
            self.db.query(ProjectRenovation)
            .filter(
                ProjectRenovation.project_id == project_id,
                ProjectRenovation.is_deleted.is_(False),
            )
            .with_for_update()
            .first()
        )

        if not renovation:
            try:
                renovation = ProjectRenovation(
                    id=uuid.uuid4(),
                    project_id=project_id,
                    is_deleted=False,
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                self.db.add(renovation)
                self.db.flush()
            except IntegrityError:
                # 并发创建：另一个事务已插入，回退到查询（带锁）
                self.db.rollback()
                renovation = (
                    self.db.query(ProjectRenovation)
                    .filter(
                        ProjectRenovation.project_id == project_id,
                        ProjectRenovation.is_deleted.is_(False),
                    )
                    .with_for_update()
                    .first()
                )
                if not renovation:
                    msg = "装修记录创建失败"
                    raise BusinessLogicError(msg) from None

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

    def update_stage(
        self,
        project_id: uuid.UUID,
        renovation_data: RenovationUpdate,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> Project:
        """更新改造阶段.

        权限校验由 Router 层 ProjectRenovationCompleteStagePermDep 注入，
        Service 层不再重复校验。

        Args:
            project_id: 项目ID
            renovation_data: 阶段更新数据
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

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

        # 审计快照：变更前阶段进度（须在写操作前抓取）
        before = _stage_snapshot(project, renovation)

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
        # 审计日志在主操作成功后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="project_renovation",
            resource_id=str(renovation.id),
            before=before,
            after=_stage_snapshot(project, renovation),
            request=request,
        )
        return project

    def update_stage_date(
        self,
        project_id: uuid.UUID,
        stage: RenovationStage,
        stage_completed_at: datetime | None,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> Project:
        """修改/清空已完成阶段的完成时间.

        权限校验由 Router 层 ProjectRenovationCompleteStagePermDep 注入（双通道：
        complete_stage 子码 OR project:write OR 装修对接负责人业务身份），
        Service 层不再重复校验权限。
        不流转 project.renovation_stage 主阶段，仅修改 stage_completed_dates。
        清空日期时根据剩余已完成阶段回退主阶段，避免硬编码。

        Args:
            project_id: 项目ID
            stage: 要修改的阶段
            stage_completed_at: 新完成时间；None 表示清空回退未完成
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

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

        # 审计快照：变更前阶段与完成时间（须在写操作前抓取）
        before = _stage_snapshot(project, renovation)
        before["stage"] = stage.value
        before["stage_completed_date"] = (renovation.stage_completed_dates or {}).get(stage.value)

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
        after = _stage_snapshot(project, renovation)
        after["stage"] = stage.value
        after["stage_completed_date"] = (renovation.stage_completed_dates or {}).get(stage.value)
        # 审计日志在主操作成功后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="project_renovation",
            resource_id=str(renovation.id),
            before=before,
            after=after,
            request=request,
        )
        return project

    def get_info(self, project_id: uuid.UUID) -> ProjectRenovation | None:
        """获取装修信息."""
        return (
            self.db.query(ProjectRenovation)
            .filter(
                ProjectRenovation.project_id == project_id,
                ProjectRenovation.is_deleted.is_(False),
            )
            .first()
        )

    def update_info(self, project_id: uuid.UUID, renovation_data: dict[str, Any]) -> ProjectRenovation:
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
        project_id: uuid.UUID,
        stage: str,
        url: str,
        filename: str | None = None,
        description: str | None = None,
        thumbnail_url: str | None = None,
        media_type: str = "image",
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> RenovationPhoto:
        """添加改造阶段照片.

        权限校验由 Router 层 ProjectRenovationUploadPhotoPermDep 注入（业务身份双通道），
        Service 层不再重复校验。

        Args:
            project_id: 项目ID
            stage: 改造阶段
            url: 图片/视频 URL
            filename: 文件名（可选）
            description: 描述（可选）
            thumbnail_url: 缩略图 URL（可选）
            media_type: 媒体种类（image/video）
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

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
        # 审计日志在主操作成功后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="project_renovation",
            resource_id=str(photo.id),
            after={
                "stage": _snapshot_value(photo.stage),
                "url": photo.url,
                "media_type": _snapshot_value(photo.media_type),
                "filename": photo.filename,
                "description": photo.description,
                "thumbnail_url": photo.thumbnail_url,
            },
            request=request,
        )
        return photo

    def get_photos(self, project_id: uuid.UUID, stage: str | None = None) -> list[RenovationPhoto]:
        """获取改造阶段照片."""
        self._get_project(project_id)
        query = self.db.query(RenovationPhoto).filter(
            RenovationPhoto.project_id == project_id,
            RenovationPhoto.is_deleted.is_(False),
        )
        if stage:
            query = query.filter(RenovationPhoto.stage == stage)
        return query.order_by(RenovationPhoto.created_at.desc()).all()

    def delete_photo(
        self,
        project_id: uuid.UUID,
        photo_id: str,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> None:
        """删除改造阶段照片 (软删除).

        权限校验由 Router 层 ProjectRenovationUploadPhotoPermDep 注入。

        Args:
            project_id: 项目ID
            photo_id: 照片ID
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

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

        # 审计快照：删除前照片信息（须在软删除前抓取）
        before = {
            "stage": _snapshot_value(photo.stage),
            "url": photo.url,
            "media_type": _snapshot_value(photo.media_type),
            "filename": photo.filename,
        }
        photo.is_deleted = True
        self.db.commit()
        # 审计日志在主操作成功后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="delete",
            resource_type="project_renovation",
            resource_id=str(photo.id),
            before=before,
            request=request,
        )

    def get_contract(self, project_id: uuid.UUID) -> ProjectRenovation:
        """获取装修合同信息."""
        self._get_project(project_id)
        return self._get_or_create_renovation(project_id)

    def update_contract(
        self,
        project_id: uuid.UUID,
        contract_data: RenovationContractUpdate,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> ProjectRenovation:
        """更新装修合同信息.

        Args:
            project_id: 项目ID
            contract_data: 合同更新数据
            operator_id: 操作者用户ID（用于审计日志，可选）
            request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

        """
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

        # 审计快照：变更前合同字段（含 soft_detail_attachment，须在写操作前抓取）
        before = _renovation_contract_snapshot(renovation)

        # 更新字段（使用白名单过滤，防止设置敏感字段）
        update_data = contract_data.model_dump(exclude_unset=True)
        # 附件被移除/替换前先记下旧值，保存成功后删除其物理文件（方案 A：保存时清理）
        # 注：value is not None 过滤会让显式 null 被跳过，故此处「旧值 != 新值」不会误判
        old_attachment = renovation.soft_detail_attachment if "soft_detail_attachment" in update_data else None
        for field, value in update_data.items():
            if field in _RENOVATION_ALLOWED_FIELDS and value is not None:
                setattr(renovation, field, value)

        renovation.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(renovation)

        # 审计日志在主操作成功后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="project_renovation",
            resource_id=str(renovation.id),
            before=before,
            after=_renovation_contract_snapshot(renovation),
            request=request,
        )

        # 旧附件已不再被本字段引用 → 删除物理文件（失败只记日志，保存结果不受影响）。
        # 例外：URL 仍被附件库（signing_materials）或其它项目的软装明细附件引用时必须保留
        # ——本字段曾是手填链接，运营可能粘贴本项目/其他项目已上传文件的 URL，
        # 共享文件删除会连带弄坏对方的条目（404）。
        if old_attachment and old_attachment != renovation.soft_detail_attachment:
            if attachment_url_in_use(self.db, old_attachment):
                logger.info("装修合同：旧附件仍被项目引用，跳过物理删除: %s", old_attachment)
            else:
                _delete_storage_file(old_attachment)

        return renovation


# 保持向后兼容的别名
ProjectRenovationService = RenovationService
