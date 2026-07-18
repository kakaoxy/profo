"""项目文书签收管理路由."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import CurrentInternalUserDep, ProjectReadPermDep
from models.common import BusinessForm
from schemas.project import (
    DocumentCreate,
    DocumentInitializeResponse,
    DocumentResponse,
    DocumentUpdate,
)
from services.projects.internal import documents as documents_service
from services.system.exceptions import ResourceNotFoundError, ValidationError
from utils.common import RateLimits, limiter

router = APIRouter()

_get_db_dep = Depends(get_db)


@router.get("/{project_id}/documents")
def list_documents(
    db: Annotated[Session, _get_db_dep],
    _current_user: ProjectReadPermDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> list[DocumentResponse]:
    """获取项目文书签收列表.

    使用 ProjectReadPermDep 基于权限码校验（需 project:read）.
    """
    documents_service.assert_project_exists(db, project_id)
    docs = documents_service.list_documents(db, project_id)
    return [DocumentResponse.model_validate(d) for d in docs]


@router.post("/{project_id}/documents", status_code=201)
@limiter.limit(RateLimits.PROJECT_UPDATE)
def create_document(
    request: Request,
    payload: DocumentCreate,
    db: Annotated[Session, _get_db_dep],
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> DocumentResponse:
    """新增文书."""
    documents_service.assert_project_exists(db, project_id)
    doc = documents_service.create_document(db, project_id, payload)
    return DocumentResponse.model_validate(doc)


@router.patch("/{project_id}/documents/{document_id}")
@limiter.limit(RateLimits.PROJECT_UPDATE)
def update_document(
    request: Request,
    payload: DocumentUpdate,
    db: Annotated[Session, _get_db_dep],
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
    document_id: Annotated[str, Path(description="文书ID")],
) -> DocumentResponse:
    """更新文书签收状态/归档日期/名称."""
    documents_service.assert_project_exists(db, project_id)
    doc = documents_service.update_document(db, project_id, document_id, payload)
    if doc is None:
        msg = "文书不存在"
        raise ResourceNotFoundError(msg)
    return DocumentResponse.model_validate(doc)


@router.delete("/{project_id}/documents/{document_id}", status_code=204)
def delete_document(
    db: Annotated[Session, _get_db_dep],
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
    document_id: Annotated[str, Path(description="文书ID")],
) -> None:
    """删除文书（逻辑删除）."""
    documents_service.assert_project_exists(db, project_id)
    ok = documents_service.delete_document(db, project_id, document_id)
    if not ok:
        msg = "文书不存在"
        raise ResourceNotFoundError(msg)


@router.post("/{project_id}/documents/initialize")
@limiter.limit(RateLimits.PROJECT_UPDATE)
def initialize_documents(
    request: Request,
    db: Annotated[Session, _get_db_dep],
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> DocumentInitializeResponse:
    """初始化默认文书清单（幂等）。business_form=None 抛 400."""
    project = documents_service.assert_project_exists(db, project_id)
    business_form = project.business_form
    if business_form is None:
        msg = "请先设置业务形式"
        raise ValidationError(msg)
    try:
        business_form_enum = BusinessForm(business_form)
    except ValueError:
        msg = "请先设置业务形式"
        raise ValidationError(msg) from None
    count = documents_service.initialize_documents(db, project_id, business_form_enum)
    return DocumentInitializeResponse(initialized_count=count)
