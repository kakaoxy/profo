"""项目文书签收管理服务模块.

负责项目文书清单的查询、增删改、初始化与业务形式变更同步。
"""

import uuid
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from constants.documents import get_documents_for_business_form
from models.common import BusinessForm, DocumentSignoffStatus
from models.project._project_base import Project
from models.project._project_document import ProjectDocument
from schemas.project.document import DocumentCreate, DocumentUpdate
from services.system.exceptions import ResourceNotFoundError
from services.system.operation_log import operation_log_service


def assert_project_exists(db: Session, project_id: uuid.UUID) -> Project:
    """校验项目存在且未软删除，不存在抛 404.

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID

    Returns:
        项目模型实例

    Raises:
        ResourceNotFoundError: 项目不存在或已软删除

    """
    project = db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
    if project is None:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)
    return project


def list_documents(db: Session, project_id: uuid.UUID) -> list[ProjectDocument]:
    """列出项目下未删除的文书，按 display_order 升序.

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID

    Returns:
        未删除的文书列表（按 display_order 升序）

    """
    return (
        db.query(ProjectDocument)
        .filter(
            ProjectDocument.project_id == project_id,
            ProjectDocument.is_deleted.is_(False),
        )
        .order_by(ProjectDocument.display_order.asc())
        .all()
    )


def _document_snapshot(doc: ProjectDocument) -> dict[str, str | int | None]:
    """文书关键字段快照（审计日志用，值均为 JSON 安全类型）."""
    return {
        "document_name": doc.document_name,
        "signoff_status": doc.signoff_status,
        "archive_date": doc.archive_date,
        "display_order": doc.display_order,
        "category": doc.category,
    }


def create_document(
    db: Session,
    project_id: uuid.UUID,
    payload: DocumentCreate,
    *,
    operator_id: str | None = None,
    request: Request | None = None,
) -> ProjectDocument:
    """新增文书。display_order 默认追加末尾（当前 max +1）。.

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID
        payload: 文书创建数据
        operator_id: 操作者用户ID（用于审计日志，可选）
        request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

    Returns:
        创建的文书模型实例

    """
    now = datetime.now(timezone.utc)
    if payload.display_order is not None:
        display_order = payload.display_order
    else:
        max_order = (
            db.query(ProjectDocument.display_order)
            .filter(
                ProjectDocument.project_id == project_id,
                ProjectDocument.is_deleted.is_(False),
            )
            .order_by(ProjectDocument.display_order.desc())
            .first()
        )
        display_order = (max_order[0] + 1) if max_order else 1
    doc = ProjectDocument(
        id=uuid.uuid4(),
        project_id=project_id,
        document_name=payload.document_name,
        signoff_status=DocumentSignoffStatus.UNSIGNED.value,
        archive_date=None,
        display_order=display_order,
        category=payload.category,
        is_deleted=False,
        created_at=now,
        updated_at=now,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    # 审计日志在主操作成功后写入；写入失败由 OperationLogService 内部捕获，不阻塞主流程
    operation_log_service.log_action(
        db,
        user_id=operator_id,
        action="create",
        resource_type="project_document",
        resource_id=str(doc.id),
        after=_document_snapshot(doc),
        request=request,
    )
    return doc


def update_document(
    db: Session,
    project_id: uuid.UUID,
    document_id: str,
    payload: DocumentUpdate,
    *,
    operator_id: str | None = None,
    request: Request | None = None,
) -> ProjectDocument | None:
    """更新文书。含项目归属校验。状态变化时联动 archive_date。.

    - 状态回退为 unsigned 时清空 archive_date
    - 状态变 archived：payload 含 archive_date 时用 payload 值，否则自动填今天（与前端语义一致）
    - 状态变 signed 时 archive_date 保持不变

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID
        document_id: 文书ID
        payload: 文书更新数据
        operator_id: 操作者用户ID（用于审计日志，可选）
        request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

    Returns:
        更新后的文书模型实例；不存在或跨项目返回 None

    """
    doc = (
        db.query(ProjectDocument)
        .filter(
            ProjectDocument.id == document_id,
            ProjectDocument.project_id == project_id,
            ProjectDocument.is_deleted.is_(False),
        )
        .first()
    )
    if doc is None:
        return None  # router 层抛 404

    before_snapshot = _document_snapshot(doc)

    updates = payload.model_dump(exclude_unset=True)
    new_status = updates.get("signoff_status")
    if new_status is not None:
        # 状态回退为 unsigned 时清空 archive_date
        if new_status == DocumentSignoffStatus.UNSIGNED.value:
            doc.archive_date = None
        # 状态变 archived 且 payload 未提供 archive_date 时自动填今天（与前端 handleStatusChange 语义一致）
        elif new_status == DocumentSignoffStatus.ARCHIVED.value and "archive_date" not in updates:
            doc.archive_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    for field in ("document_name", "category", "signoff_status", "archive_date"):
        if field in updates and updates[field] is not None:
            setattr(doc, field, updates[field])
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    operation_log_service.log_action(
        db,
        user_id=operator_id,
        action="update",
        resource_type="project_document",
        resource_id=str(doc.id),
        before=before_snapshot,
        after=_document_snapshot(doc),
        request=request,
    )
    return doc


def delete_document(
    db: Session,
    project_id: uuid.UUID,
    document_id: str,
    *,
    operator_id: str | None = None,
    request: Request | None = None,
) -> bool:
    """逻辑删除文书。返回是否找到并删除。.

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID
        document_id: 文书ID
        operator_id: 操作者用户ID（用于审计日志，可选）
        request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

    Returns:
        是否找到并删除

    """
    doc = (
        db.query(ProjectDocument)
        .filter(
            ProjectDocument.id == document_id,
            ProjectDocument.project_id == project_id,
            ProjectDocument.is_deleted.is_(False),
        )
        .first()
    )
    if doc is None:
        return False
    before_snapshot = _document_snapshot(doc)
    doc.is_deleted = True
    doc.updated_at = datetime.now(timezone.utc)
    db.commit()
    operation_log_service.log_action(
        db,
        user_id=operator_id,
        action="delete",
        resource_type="project_document",
        resource_id=str(doc.id),
        before=before_snapshot,
        request=request,
    )
    return True


def initialize_documents(
    db: Session,
    project_id: uuid.UUID,
    business_form: BusinessForm | None,
    *,
    operator_id: str | None = None,
    request: Request | None = None,
) -> int:
    """幂等初始化文书清单。返回新增数量。business_form=None 抛 ValueError。.

    查已有 document_name 集合（未删除），仅 insert 缺失项。

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID
        business_form: 业务形式枚举
        operator_id: 操作者用户ID（用于审计日志，可选）
        request: FastAPI Request 对象（用于审计日志提取 IP/UA，可选）

    Returns:
        新增文书数量

    Raises:
        ValueError: business_form 为 None

    """
    if business_form is None:
        msg = "business_form is None"
        raise ValueError(msg)

    templates = get_documents_for_business_form(business_form)
    if not templates:
        return 0

    existing_names = {
        name
        for (name,) in db.query(ProjectDocument.document_name)
        .filter(
            ProjectDocument.project_id == project_id,
            ProjectDocument.is_deleted.is_(False),
        )
        .all()
    }

    now = datetime.now(timezone.utc)
    new_docs = []
    for tpl in templates:
        if tpl.document_name in existing_names:
            continue
        new_docs.append(
            ProjectDocument(
                id=uuid.uuid4(),
                project_id=project_id,
                document_name=tpl.document_name,
                signoff_status=DocumentSignoffStatus.UNSIGNED.value,
                archive_date=None,
                display_order=tpl.display_order,
                category=tpl.category,
                is_deleted=False,
                created_at=now,
                updated_at=now,
            ),
        )

    if new_docs:
        db.add_all(new_docs)
        db.commit()
        # 审计日志：仅在实际新增文书时记录（幂等重入返回 0 不产生日志）
        operation_log_service.log_action(
            db,
            user_id=operator_id,
            action="create",
            resource_type="project_document",
            resource_id=str(project_id),
            after={"documents": [{"document_name": d.document_name, "category": d.category} for d in new_docs]},
            request=request,
        )
    return len(new_docs)


def sync_documents_on_business_form_change(
    db: Session,
    project_id: uuid.UUID,
    old_form: BusinessForm | None,
    new_form: BusinessForm | None,
) -> None:
    """业务形式变更时追加新业务形式独有的文书（不删除已有记录）。.

    - new_form=None：不操作
    - old_form == new_form：不操作（幂等）
    - 否则：按 new_form 清单追加项目缺失的文书

    Args:
        db: SQLAlchemy 数据库会话
        project_id: 项目ID
        old_form: 变更前业务形式
        new_form: 变更后业务形式

    """
    if new_form is None or old_form == new_form:
        return
    initialize_documents(db, project_id, new_form)
