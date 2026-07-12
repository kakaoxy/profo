"""项目文书签收管理路由."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Request
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import CurrentInternalUserDep
from models.common import BusinessForm
from models.project import Project
from schemas.project import (
    DocumentCreate,
    DocumentInitializeResponse,
    DocumentResponse,
    DocumentUpdate,
)
from services.projects.internal import documents as documents_service
from utils.common import RateLimits, limiter

router = APIRouter()

_get_db_dep = Depends(get_db)


def _get_project(db: Session, project_id: str) -> Project:
    """获取项目，不存在抛 404."""
    project = db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
    if project is None:
        raise HTTPException(status_code=404, detail={"message": "项目不存在"})
    return project


@router.get("/{project_id}/documents")
def list_documents(
    db: Annotated[Session, _get_db_dep],
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> list[DocumentResponse]:
    """获取项目文书签收列表."""
    _get_project(db, project_id)
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
    _get_project(db, project_id)
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
    _get_project(db, project_id)
    doc = documents_service.update_document(db, project_id, document_id, payload)
    if doc is None:
        raise HTTPException(status_code=404, detail={"message": "文书不存在"})
    return DocumentResponse.model_validate(doc)


@router.delete("/{project_id}/documents/{document_id}", status_code=204)
def delete_document(
    db: Annotated[Session, _get_db_dep],
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
    document_id: Annotated[str, Path(description="文书ID")],
) -> None:
    """删除文书（逻辑删除）."""
    _get_project(db, project_id)
    ok = documents_service.delete_document(db, project_id, document_id)
    if not ok:
        raise HTTPException(status_code=404, detail={"message": "文书不存在"})


@router.post("/{project_id}/documents/initialize")
@limiter.limit(RateLimits.PROJECT_UPDATE)
def initialize_documents(
    request: Request,
    db: Annotated[Session, _get_db_dep],
    _current_user: CurrentInternalUserDep,
    project_id: Annotated[str, Path(description="项目ID")],
) -> DocumentInitializeResponse:
    """初始化默认文书清单（幂等）。business_form=None 抛 400."""
    project = _get_project(db, project_id)
    business_form = project.business_form
    if business_form is None:
        raise HTTPException(status_code=400, detail={"message": "请先设置业务形式"})
    try:
        business_form_enum = BusinessForm(business_form)
    except ValueError:
        raise HTTPException(status_code=400, detail={"message": "请先设置业务形式"}) from None
    count = documents_service.initialize_documents(db, project_id, business_form_enum)
    return DocumentInitializeResponse(initialized_count=count)
