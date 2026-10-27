"""线索核心 CRUD 路由."""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Request
from sqlalchemy.orm import Session

from dependencies.auth import (
    DbSessionDep,
    LeadCreatePermDep,
    LeadReadPermDep,
    LeadWritePermDep,
)
from dependencies.common import PaginationDep
from models.common import LeadStatus
from models.lead import Lead
from schemas.community_image import CommunityImageListResponse
from schemas.lead import (
    LeadAssessmentBacklogResponse,
    LeadCreate,
    LeadFollowUpSummary,
    LeadFunnelResponse,
    LeadListItem,
    LeadResponse,
    LeadStatsResponse,
    LeadUpdate,
    PaginatedLeadListResponse,
)
from services.leads import LeadService
from services.market.community_image_service import CommunityImageService
from services.property.dict_read_service import BuildingDictReadService
from services.property.doc_dict_resolver import DocDictKey, DocDictNames
from services.system.exceptions import ResourceNotFoundError
from utils.common import RateLimits, limiter

router = APIRouter()

_MAX_IMAGE_LENGTH = 500


def _dict_names_update(lead: Lead, names: dict[str, DocDictNames]) -> dict[str, Any]:
    """字典解析名称 → LeadListItem/LeadResponse 补充字段（单条）.

    Args:
        lead: Lead ORM 实例（取 doc_id 作为解析键）
        names: resolve_doc_names 返回的 doc_id 到 DocDictNames 映射，可为空 dict

    """
    n = names.get(str(lead.id))
    if n is None:
        return {}
    return {"building_no": n.building_no, "room_no": n.room_no, "floor": n.floor}


def _lead_dict_key(lead: Lead) -> DocDictKey:
    """Lead ORM → 解析键."""
    return DocDictKey(
        doc_id=str(lead.id),
        community_id=lead.community_id,
        building_id=lead.building_id,
        room_id=lead.room_id,
        dict_status=lead.dict_status,
        source_type="lead",
    )


def _lead_to_list_item(
    lead: Lead,
    names: dict[str, Any] | None = None,
    db: Session | None = None,
    verdict: dict[str, Any] | None = None,
    followup: dict[str, Any] | None = None,
) -> LeadListItem:
    """将 Lead ORM 对象转换为 LeadListItem.

    Args:
        lead: Lead ORM 实例
        names: 字典解析名称映射（doc_id → DocDictNames）；列表路径由调用方批量传入避免 N+1
        db: 数据库会话；names 为 None 时单条现场解析用（非列表路径）
        verdict: 最新评估结论（condition_score / expected_sale_days）；列表路径由调用方批量传入
        followup: 最近一条跟进摘要（get_latest_follow_ups 的单行结果）；
            列表路径由调用方批量传入，无跟进为 None（不得伪造）

    """
    safe_images = [img for img in (lead.images or []) if isinstance(img, str) and len(img) < _MAX_IMAGE_LENGTH]

    if names is None and db is not None:
        names = BuildingDictReadService().resolve_doc_names(db, [_lead_dict_key(lead)])
    dict_fields = _dict_names_update(lead, names or {})
    verdict_fields = verdict or {}

    return LeadListItem(
        id=lead.id,
        community_name=lead.community_name,
        community_id=lead.community_id,
        building_id=lead.building_id,
        room_id=lead.room_id,
        dict_status=lead.dict_status,
        **dict_fields,
        is_hot=lead.is_hot or 0,
        layout=lead.layout,
        orientation=lead.orientation,
        floor_info=lead.floor_info,
        area=float(lead.area) if lead.area else None,
        total_price=float(lead.total_price) if lead.total_price else None,
        unit_price=float(lead.unit_price) if lead.unit_price else None,
        eval_price=float(lead.eval_price) if lead.eval_price is not None else None,
        expected_price=float(lead.expected_price) if lead.expected_price is not None else None,
        condition_score=verdict_fields.get("condition_score"),
        expected_sale_days=verdict_fields.get("expected_sale_days"),
        status=lead.status,
        audit_reason=lead.audit_reason,
        auditor_id=lead.auditor_id,
        audit_time=lead.audit_time,
        images=safe_images,
        district=lead.district,
        business_area=lead.business_area,
        remarks=lead.remarks,
        creator_id=lead.creator_id,
        creator_name=lead.creator.nickname if lead.creator else None,
        referrer_id=lead.referrer_id,
        referrer_name=lead.referrer.nickname if lead.referrer else None,
        source_property_id=lead.source_property_id,
        last_follow_up_at=lead.last_follow_up_at,
        latest_follow_up=(
            LeadFollowUpSummary(
                method=followup["method"],
                content=followup["content"],
                conclusion=followup["conclusion"],
                followed_at=followup["followed_at"],
                created_by_name=followup["created_by_name"],
            )
            if followup
            else None
        ),
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


@router.get("")
def get_leads(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
    pagination: PaginationDep,
    search: Annotated[str | None, Query(max_length=100, description="小区名称搜索")] = None,
    statuses: Annotated[list[LeadStatus] | None, Query(description="状态筛选")] = None,
    district: Annotated[str | None, Query(max_length=100, description="行政区筛选")] = None,
    creator_id: Annotated[str | None, Query(max_length=100, description="创建人筛选")] = None,
    layout: Annotated[str | None, Query(max_length=100, description="户型筛选")] = None,
    floor: Annotated[str | None, Query(max_length=100, description="楼层筛选")] = None,
) -> PaginatedLeadListResponse:
    """获取线索列表.

    使用手动序列化避免 ORM 关系遍历导致的性能问题.
    """
    service = LeadService(db)
    result = service.get_leads(
        page=pagination.page,
        page_size=pagination.page_size,
        search=search,
        statuses=statuses,
        district=district,
        creator_id=creator_id,
        layout=layout,
        floor=floor,
    )

    # 字典名称批量解析（单次两查询，无 N+1）
    dict_names = BuildingDictReadService().resolve_doc_names(db, [_lead_dict_key(lead) for lead in result["items"]])
    # 最新评估结论批量解析（单次窗口函数查询，无 N+1）
    verdicts = service.query_service.get_latest_eval_verdicts([lead.id for lead in result["items"]])
    # 最近一条跟进摘要批量解析（单次窗口函数查询，无 N+1）
    followups = service.query_service.get_latest_follow_ups([lead.id for lead in result["items"]])
    items = [
        _lead_to_list_item(
            lead,
            names=dict_names,
            verdict=verdicts.get(lead.id),
            followup=followups.get(lead.id),
        )
        for lead in result["items"]
    ]

    return PaginatedLeadListResponse(
        items=items,
        total=result["total"],
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post("", status_code=201)
@limiter.limit(RateLimits.LEAD_UPDATE)
def create_lead(
    request: Request,
    db: DbSessionDep,
    current_user: LeadCreatePermDep,
    lead_in: LeadCreate,
) -> LeadResponse:
    """创建线索.

    权限：lead:create（普通员工录入）或 lead:write（admin/operator 全权）。
    """
    service = LeadService(db)
    return _lead_response_with_names(
        db,
        service.create_lead(lead_in, current_user.id, creator=current_user),
        with_verdict=False,
    )


def _lead_response_with_names(
    db: Session,
    lead: Lead,
    service: LeadService | None = None,
    *,
    with_verdict: bool = True,
) -> LeadResponse:
    """Lead ORM → LeadResponse（含字典解析名称与最新评估结论，创建/更新/详情响应同口径）.

    评估结论两字段不来自 Lead 列（Lead 无该列），必须显式取最新一条评估记录回填。

    Args:
        db: 数据库会话
        lead: 线索对象
        service: 可复用的 Service 实例（避免重复构造）
        with_verdict: 是否回填评估结论。**新建/刚更新的线索传 False**：
            该线索当前不可能已有评估记录，查一次必然返回空（纯浪费一次 SELECT）。

    """
    dict_names = BuildingDictReadService().resolve_doc_names(db, [_lead_dict_key(lead)])
    resp = LeadResponse.model_validate(lead, from_attributes=True)
    for field, value in _dict_names_update(lead, dict_names).items():
        setattr(resp, field, value)
    if with_verdict:
        svc = service or LeadService(db)
        verdict = svc.query_service.get_latest_eval_verdicts([lead.id]).get(lead.id, {})
        resp.condition_score = verdict.get("condition_score")
        resp.expected_sale_days = verdict.get("expected_sale_days")
    return resp


@router.get("/stats")
def get_leads_stats(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
) -> LeadStatsResponse:
    """获取线索状态统计（不受分页影响）."""
    service = LeadService(db)
    return LeadStatsResponse(**service.get_stats())


@router.get("/{lead_id}")
def get_lead(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
) -> LeadResponse:
    """获取单个线索详情.

    字典解析名称（building_no/room_no/floor）随响应下发；LeadResponse 含
    building_id/room_id/dict_status，手动补齐解析字段后返回。
    """
    service = LeadService(db)
    lead = service.get_lead_or_404(lead_id)
    return _lead_response_with_names(db, lead, service=service)


@router.get("/{lead_id}/community-images")
def get_lead_community_images(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    pagination: PaginationDep,
) -> CommunityImageListResponse:
    """获取线索关联小区的户型图列表.

    供前端创建/编辑线索时从户型图库选择户型图。
    """
    lead_service = LeadService(db)
    lead = lead_service.get_lead(lead_id)
    if lead is None:
        msg = "线索不存在"
        raise ResourceNotFoundError(msg)

    # community_id 为空时返回空列表（前端提示"请先选择小区"）
    if not lead.community_id:
        return CommunityImageListResponse(total=0, items=[])

    return CommunityImageService.list_by_community(
        db=db,
        community_id=lead.community_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.put("/{lead_id}")
@limiter.limit(RateLimits.LEAD_UPDATE)
def update_lead(
    request: Request,
    db: DbSessionDep,
    current_user: LeadWritePermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    lead_in: LeadUpdate,
) -> LeadResponse:
    """更新线索.

    速率限制：100次/小时.
    """
    service = LeadService(db)
    return _lead_response_with_names(
        db,
        service.update_lead(lead_id, lead_in, current_user.id, creator=current_user),
        with_verdict=False,
    )


@router.delete("/{lead_id}", status_code=204)
@limiter.limit(RateLimits.LEAD_DELETE)
def delete_lead(
    request: Request,
    db: DbSessionDep,
    _current_user: LeadWritePermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
) -> None:
    """删除线索.

    速率限制：20次/小时.
    """
    service = LeadService(db)
    service.delete_lead(lead_id)


@router.get("/stats/assessment-backlog")
def get_leads_assessment_backlog(
    db: DbSessionDep,
    _current_user: LeadWritePermDep,
) -> LeadAssessmentBacklogResponse:
    """待评估积压（工作台 alert_card：数量 / 最久等待 / 涉及负责人）.

    权限沿用 ``lead:write``（与设计稿 alert_card 的 perm 声明一致）；
    三项指标均可由现有数据计算，不引入新业务概念。
    """
    service = LeadService(db)
    return LeadAssessmentBacklogResponse(**service.get_assessment_backlog())


@router.get("/stats/funnel")
def get_leads_funnel(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
) -> LeadFunnelResponse:
    """获取线索漏斗统计数据."""
    service = LeadService(db)
    stats = service.query_service.get_funnel_stats()
    return LeadFunnelResponse(**stats)
