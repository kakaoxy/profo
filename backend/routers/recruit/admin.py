"""区域伙伴招募计划后台管理路由.

前缀 ``/admin/recruit``，读端点受 ``recruit:read``、写端点受 ``recruit:write`` 权限控制。
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Path, Query, status

from dependencies.auth import DbSessionDep, RecruitReadPermDep, RecruitWritePermDep
from dependencies.common import PaginationDep
from models.recruit import RecruitLeadSource, RecruitLeadStatus
from schemas.recruit import (
    RecruitCampaignCreate,
    RecruitCampaignResponse,
    RecruitCampaignUpdate,
    RecruitFunnelResponse,
    RecruitLeadListItem,
    RecruitLeadListResponse,
    RecruitLeadStatusUpdate,
)
from services.recruit import RecruitCampaignService, RecruitFunnelService, RecruitLeadService
from utils.formatters import mask_phone

router = APIRouter(prefix="/admin/recruit", tags=["recruit"])


@router.post(
    "/campaigns",
    status_code=status.HTTP_201_CREATED,
    summary="新建招募活动",
)
def create_campaign(
    body: RecruitCampaignCreate,
    db: DbSessionDep,
    _current_user: RecruitWritePermDep,
) -> RecruitCampaignResponse:
    """新建招募活动."""
    campaign = RecruitCampaignService(db).create(body)
    return RecruitCampaignResponse.model_validate(campaign)


@router.put(
    "/campaigns/{campaign_id}",
    summary="编辑招募活动",
)
def update_campaign(
    campaign_id: Annotated[str, Path(description="活动ID")],
    body: RecruitCampaignUpdate,
    db: DbSessionDep,
    _current_user: RecruitWritePermDep,
) -> RecruitCampaignResponse:
    """编辑招募活动."""
    campaign = RecruitCampaignService(db).update(campaign_id, body)
    return RecruitCampaignResponse.model_validate(campaign)


@router.get(
    "/campaigns",
    summary="招募活动列表",
)
def list_campaigns(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
) -> list[RecruitCampaignResponse]:
    """招募活动列表."""
    campaigns = RecruitCampaignService(db).list_all()
    return [RecruitCampaignResponse.model_validate(c) for c in campaigns]


@router.get(
    "/leads",
    summary="招募线索列表",
    description="分页 + 员工/状态/来源/主营商圈筛选，手机号脱敏",
)
def list_leads(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    pagination: PaginationDep,
    employee_id: Annotated[str | None, Query(max_length=36, description="归属员工ID")] = None,
    status: Annotated[RecruitLeadStatus | None, Query(description="跟进状态")] = None,
    source: Annotated[RecruitLeadSource | None, Query(description="来源渠道")] = None,
    business_area: Annotated[str | None, Query(max_length=50, description="主营商圈（精确匹配）")] = None,
    campaign_id: Annotated[str | None, Query(max_length=36, description="活动ID")] = None,
    start_date: Annotated[date | None, Query(description="留资开始日期（YYYY-MM-DD，含）")] = None,
    end_date: Annotated[date | None, Query(description="留资结束日期（YYYY-MM-DD，含）")] = None,
    search: Annotated[str | None, Query(max_length=50, description="主营商圈关键词搜索（模糊匹配）")] = None,
) -> RecruitLeadListResponse:
    """招募线索列表."""
    service = RecruitLeadService(db)
    result = service.list(
        page=pagination.page,
        page_size=pagination.page_size,
        employee_id=employee_id,
        status=status,
        source=source,
        business_area=business_area,
        campaign_id=campaign_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )

    items = [
        RecruitLeadListItem(
            id=lead.id,
            phone_masked=mask_phone(lead.phone),
            main_business_area=lead.main_business_area,
            campaign_id=lead.campaign_id,
            source=lead.source,
            referrer_employee_id=lead.referrer_employee_id,
            referrer_name=nickname,
            status=lead.status,
            is_internal=lead.is_internal,
            created_at=lead.created_at,
            updated_at=lead.updated_at,
        )
        for lead, nickname in result["items"]
    ]

    return RecruitLeadListResponse(
        items=items,
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.put(
    "/leads/{lead_id}/status",
    summary="招募线索跟进状态流转",
)
def update_lead_status(
    lead_id: Annotated[str, Path(description="线索ID")],
    body: RecruitLeadStatusUpdate,
    db: DbSessionDep,
    _current_user: RecruitWritePermDep,
) -> RecruitLeadListItem:
    """跟进状态流转."""
    lead, referrer_name = RecruitLeadService(db).update_status(lead_id, body)
    return RecruitLeadListItem(
        id=lead.id,
        phone_masked=mask_phone(lead.phone),
        main_business_area=lead.main_business_area,
        campaign_id=lead.campaign_id,
        source=lead.source,
        referrer_employee_id=lead.referrer_employee_id,
        referrer_name=referrer_name,
        status=lead.status,
        is_internal=lead.is_internal,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


@router.get(
    "/leads/funnel",
    summary="招募 6 级漏斗统计",
    description="分享次数 → PV/UV → 深度浏览 → 点击授权 → 授权成功 → 有效新客",
)
def get_funnel(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    campaign_id: Annotated[str | None, Query(max_length=36, description="活动ID")] = None,
    employee_id: Annotated[str | None, Query(max_length=36, description="员工维度下钻")] = None,
    start_date: Annotated[date | None, Query(description="开始日期")] = None,
    end_date: Annotated[date | None, Query(description="结束日期")] = None,
) -> RecruitFunnelResponse:
    """招募 6 级漏斗统计."""
    data = RecruitFunnelService(db).compute(
        campaign_id=campaign_id,
        employee_id=employee_id,
        start_date=start_date,
        end_date=end_date,
    )
    return RecruitFunnelResponse(**data)
