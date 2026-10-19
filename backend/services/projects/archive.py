"""项目归档 / 反归档服务.

归档是独立于 ``ProjectStatus`` 生命周期状态机的写锁标记：
归档后项目所有写接口（更新、状态流转、文书、装修、销售、删除）统一 400，
反归档后恢复可写。审计日志由 OperationLog 承载（归档日期/说明、反归档原因）。

与 ``services/projects/finance/settlement.py``（结算/反结算）同构，
但权限复用 ``project:write``，不新增权限码。
"""

import logging
import uuid

from fastapi import Request
from sqlalchemy.orm import Session

from models import Project
from models.common import ProjectStatus
from schemas.project import ProjectResponse
from schemas.project.archive import ProjectArchiveRequest, ProjectUnarchiveRequest
from services.system.exceptions import ResourceNotFoundError, ServiceException, ValidationError
from services.system.operation_log import operation_log_service

logger = logging.getLogger(__name__)

# 可归档的项目状态：已售 / 已下架（业务确认的收口口径）
ARCHIVABLE_STATUSES = (ProjectStatus.SOLD.value, ProjectStatus.ENDED.value)


def assert_project_not_archived(project: Project) -> None:
    """归档写锁：已归档项目拒绝一切写操作（Fail Loud，不静默）.

    Raises:
        ValidationError: 项目已归档（HTTP 400）

    """
    if project.is_archived:
        msg = "项目已归档，请先反归档后再操作"
        raise ValidationError(msg)


class ProjectArchiveService:
    """项目归档服务."""

    def __init__(self, db: Session) -> None:
        """初始化归档服务.

        Args:
            db: SQLAlchemy 数据库会话

        """
        # 延迟导入：internal 子包（updater/state/documents 等）在模块级引用本模块的写锁
        # helper，此处若顶层导入 internal 会形成循环导入
        from .internal import ProjectQueryService, ProjectResponseBuilder

        self.db = db
        self.query_service = ProjectQueryService(db)
        self.response_builder = ProjectResponseBuilder(db)

    def archive_project(
        self,
        project_id: uuid.UUID,
        data: ProjectArchiveRequest,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> ProjectResponse:
        """归档项目：sold/ended → 已归档，记录归档日期与说明，写审计日志.

        Raises:
            ResourceNotFoundError: 项目不存在
            ValidationError: 状态不可归档 / 已归档
            ServiceException: 审计日志写入失败（归档变更已一并回滚）

        """
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.is_deleted.is_(False))
            .with_for_update()
            .populate_existing()
            .first()
        )
        if project is None:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        if project.status not in ARCHIVABLE_STATUSES:
            msg = "仅已售或已下架项目可归档"
            raise ValidationError(msg)
        if project.is_archived:
            msg = "项目已归档，无需重复归档"
            raise ValidationError(msg)

        project.is_archived = True
        project.archived_at = data.archived_at
        project.archived_note = data.archived_note

        # 审计日志与归档变更同一事务提交：log_action 内部 commit 将项目变更与日志
        # 一并原子落库；写入失败时其内部 rollback 连带回滚归档变更，此处 Fail Loud，
        # 避免「已归档但审计日志缺失」的不可追溯状态
        log_entry = operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="project",
            resource_id=str(project_id),
            after={
                "archived": True,
                "archived_at": data.archived_at.isoformat(),
                "archived_note": data.archived_note,
            },
            request=request,
        )
        if log_entry is None:
            msg = "审计日志写入失败，归档操作未生效，请重试"
            raise ServiceException(msg)

        logger.info("项目 %s 已归档", project_id)
        return self._build_response(project_id)

    def unarchive_project(
        self,
        project_id: uuid.UUID,
        data: ProjectUnarchiveRequest,
        *,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> ProjectResponse:
        """反归档项目：已归档 → 未归档，清空归档字段，写审计日志（原因必填）.

        Raises:
            ResourceNotFoundError: 项目不存在
            ValidationError: 项目未归档
            ServiceException: 审计日志写入失败（反归档变更已一并回滚）

        """
        # 行锁串行化并发反归档：避免双请求同时通过 is_archived 检查
        project = (
            self.db.query(Project)
            .filter(Project.id == project_id, Project.is_deleted.is_(False))
            .with_for_update()
            .populate_existing()
            .first()
        )
        if project is None:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        if not project.is_archived:
            msg = "项目未归档，无需反归档"
            raise ValidationError(msg)

        project.is_archived = False
        project.archived_at = None
        project.archived_note = None

        # 审计日志与反归档变更同一事务提交（同 archive_project，见该处注释）
        log_entry = operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="project",
            resource_id=str(project_id),
            after={"archived": False, "reason": data.reason},
            request=request,
        )
        if log_entry is None:
            msg = "审计日志写入失败，反归档操作未生效，请重试"
            raise ServiceException(msg)

        logger.info("项目 %s 已反归档", project_id)
        return self._build_response(project_id)

    def _build_response(self, project_id: uuid.UUID) -> ProjectResponse:
        """Commit 后重新查询并构建响应（预加载 builder 所需关联）."""
        project = self.query_service.get_by_id(project_id, include_all=False)
        return ProjectResponse.model_validate(self.response_builder.build(project))
