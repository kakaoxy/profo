"""商户域响应序列化（ORM → Pydantic，统一脱敏与字典展示名）."""

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from models.merchant import (
    MerchantBroker,
    MerchantBrokerBinding,
    MerchantCompany,
    MerchantStore,
    MerchantVisit,
)
from models.system import BizDictItem
from schemas.merchant import (
    BrokerBindingResponse,
    BrokerListItem,
    BrokerMyStoreResponse,
    BrokerResponse,
    MerchantCompanyResponse,
    MerchantStoreListItem,
    MerchantStoreResponse,
    MerchantVisitResponse,
    StorePhotoItem,
)
from utils.formatters import mask_phone

COOPERATION_DICT = "merchant_cooperation_status"
VISIT_RESULT_DICT = "merchant_visit_result"


def cooperation_label_map(db: Session) -> dict[str, str]:
    """合作状态 {code: label}（含停用项，历史值可展示）."""
    rows = db.query(BizDictItem.code, BizDictItem.label).filter(BizDictItem.dict_code == COOPERATION_DICT).all()
    return dict(rows)


def visit_result_label_map(db: Session) -> dict[str, str]:
    """拜访结果 {code: label}（含停用项）."""
    rows = db.query(BizDictItem.code, BizDictItem.label).filter(BizDictItem.dict_code == VISIT_RESULT_DICT).all()
    return dict(rows)


def photo_items(photos: list[dict[str, Any]] | None) -> list[StorePhotoItem]:
    """JSON 照片数组 → 响应模型."""
    return [StorePhotoItem.model_validate(item) for item in (photos or [])]


def company_response(company: MerchantCompany) -> MerchantCompanyResponse:
    """公司响应（手机号仅返回脱敏值）."""
    return MerchantCompanyResponse(
        id=str(company.id),
        company_name=company.company_name,
        status=company.status,
        contact_name=company.contact_name,
        contact_phone_masked=mask_phone(company.contact_phone),
        remark=company.remark,
        created_at=company.created_at,
        updated_at=company.updated_at,
    )


def store_response(store: MerchantStore, labels: dict[str, str]) -> MerchantStoreResponse:
    """门店详情响应."""
    return MerchantStoreResponse(
        id=str(store.id),
        company_id=str(store.company_id),
        company_name=store.company_name,
        store_name=store.store_name,
        province=store.province,
        city=store.city,
        district=store.district,
        business_circle=store.business_circle,
        address=store.address,
        lng=float(store.lng) if store.lng is not None else None,
        lat=float(store.lat) if store.lat is not None else None,
        coordinate_system=store.coordinate_system,
        contact_name=store.contact_name,
        contact_phone=store.contact_phone or "",
        cooperation_status=store.cooperation_status,
        cooperation_status_label=labels.get(store.cooperation_status, store.cooperation_status),
        source=store.source,
        owner_employee_id=store.owner_employee_id,
        last_visit_at=store.last_visit_at,
        status=store.status,
        review_status=store.review_status,
        created_by_broker_id=store.created_by_broker_id,
        merged_to_store_id=store.merged_to_store_id,
        former_store_no=store.former_store_no,
        relocated_to_store_id=store.relocated_to_store_id,
        photos=photo_items(store.photos),
        remark=store.remark,
        created_at=store.created_at,
        updated_at=store.updated_at,
    )


def store_list_item(
    store: MerchantStore,
    labels: dict[str, str],
    *,
    owner_employee_name: str | None = None,
    broker_count: int = 0,
    distance_m: float | None = None,
) -> MerchantStoreListItem:
    """门店列表项（手机号脱敏，可带与查询原点的距离）."""
    return MerchantStoreListItem(
        id=str(store.id),
        company_name=store.company_name,
        store_name=store.store_name,
        province=store.province,
        city=store.city,
        district=store.district,
        business_circle=store.business_circle,
        address=store.address,
        contact_name=store.contact_name,
        contact_phone_masked=mask_phone(store.contact_phone),
        cooperation_status=store.cooperation_status,
        cooperation_status_label=labels.get(store.cooperation_status, store.cooperation_status),
        source=store.source,
        review_status=store.review_status,
        owner_employee_id=store.owner_employee_id,
        owner_employee_name=owner_employee_name,
        last_visit_at=store.last_visit_at,
        broker_count=broker_count,
        status=store.status,
        distance_m=distance_m,
        created_at=store.created_at,
        updated_at=store.updated_at,
    )


def visit_response(
    visit: MerchantVisit,
    *,
    store_name: str | None = None,
    employee_name: str | None = None,
) -> MerchantVisitResponse:
    """拜访记录响应."""
    return MerchantVisitResponse(
        id=str(visit.id),
        store_id=str(visit.store_id),
        store_name=store_name,
        employee_id=str(visit.employee_id),
        employee_name=employee_name,
        visited_at=visit.visited_at,
        contact_name=visit.contact_name,
        contact_phone=visit.contact_phone,
        photos=photo_items(visit.photos),
        lng=float(visit.lng) if visit.lng is not None else None,
        lat=float(visit.lat) if visit.lat is not None else None,
        distance_m=visit.distance_m,
        distance_abnormal_reason=visit.distance_abnormal_reason,
        location_failure_reason=visit.location_failure_reason,
        location_failure_type=visit.location_failure_type,
        location_status=visit.location_status,
        visit_source=visit.visit_source,
        address=visit.address,
        result=visit.result,
        remark=visit.remark,
        is_backfill=visit.is_backfill,
        created_at=visit.created_at,
    )


def broker_response(broker: MerchantBroker, *, store_name: str | None = None) -> BrokerResponse:
    """经纪人档案响应（手机号脱敏）."""
    return BrokerResponse(
        id=str(broker.id),
        user_id=str(broker.user_id) if broker.user_id else None,
        name=broker.name,
        phone_masked=mask_phone(broker.phone) or "",
        store_id=str(broker.store_id) if broker.store_id else None,
        store_name=store_name,
        bind_status=broker.bind_status,
        source=broker.source,
        inviter_employee_id=str(broker.inviter_employee_id) if broker.inviter_employee_id else None,
        bind_source=broker.bind_source,
        bound_at=broker.bound_at,
        unbound_at=broker.unbound_at,
        remark=broker.remark,
        recruit_lead_id=str(broker.recruit_lead_id) if broker.recruit_lead_id else None,
        created_at=broker.created_at,
        updated_at=broker.updated_at,
    )


def broker_binding_response(row: MerchantBrokerBinding, *, broker_name: str | None = None) -> BrokerBindingResponse:
    """绑定历史响应."""
    return BrokerBindingResponse(
        id=str(row.id),
        broker_id=str(row.broker_id),
        broker_name=broker_name,
        store_id=str(row.store_id),
        store_name=row.store_name_snapshot,
        status=row.status,
        applied_at=row.applied_at,
        approved_at=row.approved_at,
        unbound_at=row.unbound_at,
        reason=row.reason,
        bind_source=row.bind_source,
        inviter_employee_id=str(row.inviter_employee_id) if row.inviter_employee_id else None,
    )


def broker_my_store(
    store: MerchantStore,
    labels: dict[str, str],
    *,
    bind_status: str,
    bound_at: datetime | None,
) -> BrokerMyStoreResponse:
    """经纪人“我的门店”响应（不暴露内部联系人/电话/拜访信息）."""
    return BrokerMyStoreResponse(
        id=str(store.id),
        store_name=store.store_name,
        company_name=store.company_name,
        address=store.address,
        district=store.district,
        business_circle=store.business_circle,
        cooperation_status=store.cooperation_status,
        cooperation_status_label=labels.get(store.cooperation_status, store.cooperation_status),
        review_status=store.review_status,
        photos=store.photos or [],
        bind_status=bind_status,
        bound_at=bound_at,
    )


def broker_list_item(
    broker: MerchantBroker,
    *,
    store_name: str | None,
    recommendation_count: int,
) -> BrokerListItem:
    """后台经纪人列表项."""
    return BrokerListItem(
        id=str(broker.id),
        name=broker.name,
        phone_masked=mask_phone(broker.phone) or "",
        store_id=str(broker.store_id) if broker.store_id else None,
        store_name=store_name,
        bind_status=broker.bind_status,
        source=broker.source,
        inviter_employee_id=str(broker.inviter_employee_id) if broker.inviter_employee_id else None,
        recruit_lead_id=str(broker.recruit_lead_id) if broker.recruit_lead_id else None,
        recommendation_count=recommendation_count,
        updated_at=broker.updated_at,
    )


__all__ = [
    "broker_binding_response",
    "broker_list_item",
    "broker_my_store",
    "broker_response",
    "company_response",
    "cooperation_label_map",
    "photo_items",
    "store_list_item",
    "store_response",
    "visit_response",
    "visit_result_label_map",
]
