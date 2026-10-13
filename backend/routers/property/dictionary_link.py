"""存量数据绑定路由（R9 / FR-12，四类统一）.

端点（SRS §9）：
- ``PUT  /admin/projects/{id}/dictionary-link`` / DELETE
- ``PUT  /admin/leads/{id}/dictionary-link`` / DELETE
- ``PUT  /admin/marketing/projects/{id}/dictionary-link`` / DELETE
- ``PUT  /admin/properties/{id}/dictionary-link`` / DELETE（仅小区级）

权限：对应单据可编辑者（project:write / lead:write / marketing 写 / property:write）。
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from dependencies.auth import (
    DbSessionDep,
    L4MarketingWritePermDep,
    LeadWritePermDep,
    ProjectWritePermDep,
    PropertyWritePermDep,
)
from schemas.building_dict import DictionaryLinkRequest, DictionaryLinkResponse
from services.property.dictionary_link_service import get_dictionary_link_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin", tags=["dictionary-link"])

LinkServiceDep = Annotated[object, Depends(get_dictionary_link_service)]


def _ok(status: str, message: str) -> DictionaryLinkResponse:
    return DictionaryLinkResponse(success=True, dict_status=status, message=message)


# ---------- 项目（ProjectWritePermDep） ----------


@router.put("/projects/{project_id}/dictionary-link")
def link_project(
    project_id: Annotated[str, Path(description="项目ID")],
    body: DictionaryLinkRequest,
    db: DbSessionDep,
    _current_user: ProjectWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量项目绑定字典（building_id/room_id 落库且 address 不变）."""
    svc = get_dictionary_link_service()
    _, status, message = svc.link(
        db,
        biz_type="project",
        biz_id=project_id,
        body=body,
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)


@router.delete("/projects/{project_id}/dictionary-link")
def unlink_project(
    project_id: Annotated[str, Path(description="项目ID")],
    db: DbSessionDep,
    _current_user: ProjectWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量项目解除字典关联."""
    svc = get_dictionary_link_service()
    _, status, message = svc.unlink(
        db,
        biz_type="project",
        biz_id=project_id,
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)


# ---------- 线索（LeadWritePermDep） ----------


@router.put("/leads/{lead_id}/dictionary-link")
def link_lead(
    lead_id: Annotated[str, Path(description="线索ID")],
    body: DictionaryLinkRequest,
    db: DbSessionDep,
    _current_user: LeadWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量线索绑定字典."""
    svc = get_dictionary_link_service()
    _, status, message = svc.link(
        db,
        biz_type="lead",
        biz_id=lead_id,
        body=body,
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)


@router.delete("/leads/{lead_id}/dictionary-link")
def unlink_lead(
    lead_id: Annotated[str, Path(description="线索ID")],
    db: DbSessionDep,
    _current_user: LeadWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量线索解除字典关联."""
    svc = get_dictionary_link_service()
    _, status, message = svc.unlink(
        db,
        biz_type="lead",
        biz_id=lead_id,
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)


# ---------- 营销房源（marketing 写权限） ----------


@router.put("/marketing/projects/{project_id}/dictionary-link")
def link_marketing(
    project_id: Annotated[int, Path(description="营销项目ID")],
    body: DictionaryLinkRequest,
    db: DbSessionDep,
    _current_user: L4MarketingWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量营销房源绑定字典."""
    svc = get_dictionary_link_service()
    _, status, message = svc.link(
        db,
        biz_type="marketing",
        biz_id=str(project_id),
        body=body,
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)


@router.delete("/marketing/projects/{project_id}/dictionary-link")
def unlink_marketing(
    project_id: Annotated[int, Path(description="营销项目ID")],
    db: DbSessionDep,
    _current_user: L4MarketingWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量营销房源解除字典关联."""
    svc = get_dictionary_link_service()
    _, status, message = svc.unlink(
        db,
        biz_type="marketing",
        biz_id=str(project_id),
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)


# ---------- 机器链路房源（仅小区级，PropertyWritePermDep） ----------


@router.put("/properties/{property_id}/dictionary-link")
def link_property(
    property_id: Annotated[str, Path(description="房源标识(data_source:source_property_id)")],
    body: DictionaryLinkRequest,
    db: DbSessionDep,
    _current_user: PropertyWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量机器链路房源绑定字典（仅小区级）."""
    svc = get_dictionary_link_service()
    _, status, message = svc.link(
        db,
        biz_type="property",
        biz_id=property_id,
        body=body,
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)


@router.delete("/properties/{property_id}/dictionary-link")
def unlink_property(
    property_id: Annotated[str, Path(description="房源标识(data_source:source_property_id)")],
    db: DbSessionDep,
    _current_user: PropertyWritePermDep,
    request: Request,
) -> DictionaryLinkResponse:
    """存量机器链路房源解除字典关联."""
    svc = get_dictionary_link_service()
    _, status, message = svc.unlink(
        db,
        biz_type="property",
        biz_id=property_id,
        operator_id=_current_user.id,
        request=request,
    )
    return _ok(status, message)
