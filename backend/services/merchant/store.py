"""门店服务（V02 M01B / M02）：建档、查重、维护、状态变更、搜索与详情."""

import math
from collections.abc import Sequence
from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import func, inspect, or_, text
from sqlalchemy.orm import Session

from constants.merchant import (
    MerchantCooperationStatus,
    MerchantStoreReviewStatus,
    MerchantStoreSource,
    MerchantStoreStatus,
)
from models.lead import Lead
from models.merchant import (
    MerchantAgreement,
    MerchantBroker,
    MerchantBrokerBinding,
    MerchantCompany,
    MerchantStore,
    MerchantStoreStatusLog,
    MerchantVisit,
)
from models.property import Community
from models.system import BizDictItem
from models.user.user import User
from schemas.merchant import (
    MerchantDuplicateCandidate,
    MerchantDuplicateCheckRequest,
    MerchantDuplicateCheckResponse,
    MerchantLeadStats,
    MerchantStoreCreate,
    MerchantStoreDeleteRequest,
    MerchantStoreDetailResponse,
    MerchantStoreListResponse,
    MerchantStoreMergeRequest,
    MerchantStoreRelocateResponse,
    MerchantStoreResponse,
    MerchantStoreReviewRequest,
    MerchantStoreStatusChangeRequest,
    MerchantStoreStatusLogResponse,
    MerchantStoreUpdate,
    StorePhotoItem,
)
from services.merchant.audit import add_audit_log
from services.merchant.scope import ensure_scope_role, ensure_store_visible, store_scope_condition
from services.merchant.serializers import cooperation_label_map, store_list_item, store_response
from services.system.exceptions import (
    ConflictError,
    PermissionDeniedError,
    ResourceNotFoundError,
    ValidationError,
)
from utils.crypto import hash_phone

COOPERATION_DICT = "merchant_cooperation_status"
_CREATE_ALLOWED_COOPERATION = {
    MerchantCooperationStatus.NOT_COOPERATED.value,
    MerchantCooperationStatus.NEGOTIATING.value,
}
_DISTANCE_LIMIT_M = 500


def haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> int:
    """两坐标点直线距离（米，GCJ-02 近似球面计算）."""
    radius = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return round(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def _photo_json(photos: Sequence[StorePhotoItem]) -> list[dict]:
    """Pydantic 照片列表 → JSON 数组."""
    return [item.model_dump(mode="json") for item in photos]


class MerchantStoreService:
    """门店主数据服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # -------------------- 查重 --------------------
    def check_duplicates(self, req: MerchantDuplicateCheckRequest) -> MerchantDuplicateCheckResponse:
        """按名称、地址、500 米、电话召回疑似重复门店（只提示不阻断，D8/Q09）."""
        name = req.store_name.strip()
        address = req.address.strip()
        conditions = [
            MerchantStore.store_name.ilike(f"%{name}%"),
            MerchantStore.address.ilike(f"%{address}%"),
        ]
        phone_hash = hash_phone(req.contact_phone) if req.contact_phone else None
        if phone_hash:
            conditions.append(MerchantStore.contact_phone_hash == phone_hash)

        rows = (
            self.db.query(MerchantStore)
            .filter(
                MerchantStore.is_deleted.is_(False),
                MerchantStore.status != MerchantStoreStatus.MERGED.value,
                or_(*conditions),
            )
            .order_by(MerchantStore.updated_at.desc())
            .limit(100)
            .all()
        )

        candidates: list[MerchantDuplicateCandidate] = []
        for store in rows:
            matched_by: list[str] = []
            if name and (name in store.store_name or store.store_name in name):
                matched_by.append("name")
            if address and (address in store.address or store.address in address):
                matched_by.append("address")
            if phone_hash and store.contact_phone_hash == phone_hash:
                matched_by.append("phone")
            distance = None
            if req.lng is not None and req.lat is not None:
                distance = haversine_m(float(req.lng), float(req.lat), float(store.lng), float(store.lat))
                if distance <= _DISTANCE_LIMIT_M:
                    matched_by.append("distance")
            if not matched_by:
                continue
            labels = cooperation_label_map(self.db)
            candidates.append(
                MerchantDuplicateCandidate(
                    id=str(store.id),
                    store_name=store.store_name,
                    address=store.address,
                    contact_name=store.contact_name,
                    cooperation_status=store.cooperation_status,
                    cooperation_status_label=labels.get(store.cooperation_status, store.cooperation_status),
                    distance_m=distance,
                    matched_by=matched_by,
                ),
            )

        candidates.sort(key=lambda c: (-len(c.matched_by), c.distance_m if c.distance_m is not None else 999999))
        return MerchantDuplicateCheckResponse(candidates=candidates[:20], completed=True)

    # -------------------- 创建 --------------------
    def create(
        self,
        req: MerchantStoreCreate,
        *,
        actor_id: str | None,
        source: str,
        is_privileged: bool,
        created_by_broker_id: str | None = None,
        request: Request | None = None,
    ) -> tuple[MerchantStore, list[MerchantDuplicateCandidate], MerchantVisit | None]:
        """创建门店（员工/后台/经纪人共用；员工现场建档必须携带首访）."""
        company = self._active_company(req.company_id)
        self._validate_dict_code(COOPERATION_DICT, req.cooperation_status)
        if req.cooperation_status not in _CREATE_ALLOWED_COOPERATION:
            msg = "新建门店不得直接选择已合作/暂停/终止，请先签署协议或由运营变更"
            raise ValidationError(msg)

        duplicates = self.check_duplicates(
            MerchantDuplicateCheckRequest(
                store_name=req.store_name,
                address=req.address,
                lng=req.lng,
                lat=req.lat,
                contact_phone=req.contact_phone,
            ),
        ).candidates
        if duplicates and not (req.force_create_reason or "").strip():
            msg = "存在疑似重复门店，请选择已有门店拜访，或填写强制新建理由"
            raise ValidationError(msg)

        if source == MerchantStoreSource.EMPLOYEE.value and req.first_visit is None:
            msg = "员工现场新建门店必须同时登记首访"
            raise ValidationError(msg)
        if source == MerchantStoreSource.EMPLOYEE.value and actor_id is None:
            msg = "缺少拜访员工身份"
            raise PermissionDeniedError(msg)

        owner_id = self._resolve_owner(req, source=source, actor_id=actor_id, is_privileged=is_privileged)
        review_status = (
            MerchantStoreReviewStatus.PENDING.value
            if source == MerchantStoreSource.BROKER.value
            else MerchantStoreReviewStatus.APPROVED.value
        )

        store = MerchantStore(
            company_id=company.id,
            company_name=company.company_name,
            store_name=req.store_name.strip(),
            province=req.province.strip(),
            city=req.city.strip(),
            district=req.district.strip(),
            business_circle=req.business_circle.strip(),
            address=req.address.strip(),
            lng=req.lng,
            lat=req.lat,
            coordinate_system="gcj02",
            contact_name=req.contact_name.strip(),
            contact_phone=req.contact_phone.strip(),
            contact_phone_hash=hash_phone(req.contact_phone.strip()),
            cooperation_status=req.cooperation_status,
            source=source,
            owner_employee_id=owner_id,
            status=MerchantStoreStatus.NORMAL.value,
            review_status=review_status,
            created_by_broker_id=created_by_broker_id,
            photos=_photo_json(req.photos),
            remark=req.remark,
        )
        self.db.add(store)
        self.db.flush()

        first_visit: MerchantVisit | None = None
        if source == MerchantStoreSource.EMPLOYEE.value:
            from services.merchant.visit import MerchantVisitService

            try:
                first_visit = MerchantVisitService(self.db).create_for_store(
                    store,
                    employee_id=actor_id,
                    req=req.first_visit,
                    source="first",
                    request=request,
                    commit=False,
                )
            except Exception:
                self.db.rollback()
                raise

        add_audit_log(
            self.db,
            user_id=actor_id,
            action="create",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=None,
            after=self._snapshot(store) | {"force_create_reason": req.force_create_reason},
            request=request,
        )
        self.db.commit()
        self.db.refresh(store)
        return store, duplicates, first_visit

    # -------------------- 查询 --------------------
    def search(
        self,
        user: User,
        *,
        page: int,
        page_size: int,
        keyword: str | None = None,
        province: str | None = None,
        city: str | None = None,
        district: str | None = None,
        business_circle: str | None = None,
        cooperation_status: str | None = None,
        review_status: str | None = None,
        owner_employee_id: str | None = None,
        status: str | None = None,
    ) -> MerchantStoreListResponse:
        """门店分页搜索（按数据范围过滤，默认排除已合并/已搬迁/已删除）."""
        ensure_scope_role(user)
        labels = cooperation_label_map(self.db)
        owner_name = func.coalesce(User.nickname, User.username)

        query = self.db.query(MerchantStore, owner_name).outerjoin(
            User,
            User.id == MerchantStore.owner_employee_id,
        )
        query = query.filter(MerchantStore.is_deleted.is_(False))
        scope = store_scope_condition(self.db, user)
        if scope is not None:
            query = query.filter(scope)

        if status:
            query = query.filter(MerchantStore.status == status)
        else:
            query = query.filter(
                MerchantStore.status.in_(
                    [MerchantStoreStatus.NORMAL.value, MerchantStoreStatus.DISABLED.value],
                ),
            )

        keyword = (keyword or "").strip()
        if keyword:
            conditions = [
                MerchantStore.store_name.ilike(f"%{keyword}%"),
                MerchantStore.address.ilike(f"%{keyword}%"),
                MerchantStore.company_name.ilike(f"%{keyword}%"),
            ]
            if keyword.isdigit():
                conditions.append(MerchantStore.contact_phone_hash == hash_phone(keyword))
            query = query.filter(or_(*conditions))
        if province:
            query = query.filter(MerchantStore.province == province)
        if city:
            query = query.filter(MerchantStore.city == city)
        if district:
            query = query.filter(MerchantStore.district == district)
        if business_circle:
            query = query.filter(MerchantStore.business_circle == business_circle)
        if cooperation_status:
            query = query.filter(MerchantStore.cooperation_status == cooperation_status)
        if review_status:
            query = query.filter(MerchantStore.review_status == review_status)
        if owner_employee_id:
            query = query.filter(MerchantStore.owner_employee_id == owner_employee_id)

        total = query.count()
        rows = (
            query.order_by(MerchantStore.updated_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return MerchantStoreListResponse(
            items=[store_list_item(store, labels, owner_employee_name=name) for store, name in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get(self, user: User, store_id: str) -> MerchantStoreResponse:
        """门店详情（越权返回 403，不泄露是否存在）."""
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        return store_response(store, cooperation_label_map(self.db))

    def status_logs(self, user: User, store_id: str) -> list[MerchantStoreStatusLogResponse]:
        """门店合作状态变更时间线（倒序）."""
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        rows = (
            self.db.query(MerchantStoreStatusLog)
            .filter(MerchantStoreStatusLog.store_id == store.id)
            .order_by(MerchantStoreStatusLog.created_at.desc())
            .all()
        )
        return [
            MerchantStoreStatusLogResponse(
                id=str(row.id),
                from_status=row.from_status,
                to_status=row.to_status,
                reason=row.reason,
                operator_id=row.operator_id,
                created_at=row.created_at,
            )
            for row in rows
        ]

    # -------------------- 更新 --------------------
    def update(
        self,
        user: User,
        store_id: str,
        req: MerchantStoreUpdate,
        *,
        request: Request | None = None,
    ) -> MerchantStoreResponse | MerchantStoreRelocateResponse:
        """更新门店；地址/坐标变化必须选择纠错或搬迁（Q12）."""
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        if store.status == MerchantStoreStatus.MERGED.value:
            msg = "已合并门店只读，不可编辑"
            raise ValidationError(msg)

        if req.change_type == "relocate":
            return self._relocate(store, req, user=user, request=request)

        address_changed = (
            (req.address is not None and req.address.strip() != store.address)
            or (req.lng is not None and float(req.lng) != float(store.lng))
            or (req.lat is not None and float(req.lat) != float(store.lat))
            or (req.district is not None and req.district.strip() != store.district)
        )
        if address_changed and req.change_type == "edit":
            msg = "地址或坐标发生变化，请选择地址纠错或门店搬迁"
            raise ValidationError(msg)

        before = self._snapshot(store)
        updated = False

        if req.company_id is not None and req.company_id != store.company_id:
            company = self._active_company(req.company_id)
            store.company_id = company.id
            store.company_name = company.company_name
            updated = True
        if req.store_name is not None:
            store.store_name = req.store_name.strip()
            updated = True
        if req.province is not None:
            store.province = req.province.strip()
            updated = True
        if req.city is not None:
            store.city = req.city.strip()
            updated = True
        if req.district is not None:
            store.district = req.district.strip()
            updated = True
        if req.business_circle is not None:
            store.business_circle = req.business_circle.strip()
            updated = True
        if req.address is not None:
            store.address = req.address.strip()
            updated = True
        if req.lng is not None:
            store.lng = req.lng
            updated = True
        if req.lat is not None:
            store.lat = req.lat
            updated = True
        if req.contact_name is not None:
            store.contact_name = req.contact_name.strip()
            updated = True
        if req.contact_phone is not None:
            phone = req.contact_phone.strip()
            store.contact_phone = phone
            store.contact_phone_hash = hash_phone(phone)
            updated = True
        if req.owner_employee_id is not None:
            if not ensure_scope_role(user):
                msg = "仅管理员/运营可调整门店负责人"
                raise PermissionDeniedError(msg)
            store.owner_employee_id = req.owner_employee_id
            updated = True
        if req.photos is not None:
            store.photos = _photo_json(req.photos)
            updated = True
        if req.remark is not None:
            store.remark = req.remark
            updated = True

        if not updated:
            msg = "没有需要更新的字段"
            raise ConflictError(msg)

        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="update",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store) | {"change_type": req.change_type, "change_reason": req.change_reason},
            request=request,
        )
        self.db.commit()
        self.db.refresh(store)
        return store_response(store, cooperation_label_map(self.db))

    def _relocate(
        self,
        store: MerchantStore,
        req: MerchantStoreUpdate,
        *,
        user: User,
        request: Request | None,
    ) -> MerchantStoreRelocateResponse:
        """搬迁：原门店标记已搬迁 + 新建门店，历史拜访/协议/线索保留在原门店."""
        if req.address is None or req.lng is None or req.lat is None:
            msg = "门店搬迁必须提供新地址与坐标"
            raise ValidationError(msg)

        before_old = self._snapshot(store)
        new_store = MerchantStore(
            company_id=store.company_id,
            company_name=store.company_name,
            store_name=(req.store_name or store.store_name).strip(),
            province=(req.province or store.province).strip(),
            city=(req.city or store.city).strip(),
            district=(req.district or store.district).strip(),
            business_circle=(req.business_circle or store.business_circle).strip(),
            address=req.address.strip(),
            lng=req.lng,
            lat=req.lat,
            coordinate_system="gcj02",
            contact_name=(req.contact_name or store.contact_name).strip(),
            contact_phone=(req.contact_phone or store.contact_phone).strip(),
            contact_phone_hash=hash_phone((req.contact_phone or store.contact_phone).strip()),
            cooperation_status=MerchantCooperationStatus.NOT_COOPERATED.value,
            source=store.source,
            owner_employee_id=store.owner_employee_id,
            status=MerchantStoreStatus.NORMAL.value,
            review_status=MerchantStoreReviewStatus.APPROVED.value,
            photos=_photo_json(req.photos) if req.photos is not None else store.photos,
            remark=req.remark if req.remark is not None else store.remark,
        )
        self.db.add(new_store)
        self.db.flush()

        store.status = MerchantStoreStatus.RELOCATED.value
        store.relocated_to_store_id = new_store.id
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="update",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before_old,
            after=self._snapshot(store) | {"change_reason": req.change_reason, "relocated_to_store_id": new_store.id},
            request=request,
        )
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="create",
            resource_type="merchant_store",
            resource_id=str(new_store.id),
            before=None,
            after=self._snapshot(new_store) | {"relocated_from_store_id": store.id},
            request=request,
        )
        self.db.commit()
        self.db.refresh(new_store)
        return MerchantStoreRelocateResponse(
            old_store_id=str(store.id),
            new_store=store_response(new_store, cooperation_label_map(self.db)),
        )

    # -------------------- 后台删除/合并/审核 --------------------
    def soft_delete(
        self,
        user: User,
        store_id: str,
        req: MerchantStoreDeleteRequest,
        *,
        request: Request | None = None,
    ) -> None:
        """门店软删除：存在拜访/绑定/线索/协议关联时拒绝（Q44）."""
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        relations = (
            (
                self.db.query(MerchantVisit.id)
                .filter(MerchantVisit.store_id == store.id, MerchantVisit.is_deleted.is_(False))
                .count(),
                "拜访记录",
            ),
            (
                self.db.query(MerchantBrokerBinding.id)
                .filter(MerchantBrokerBinding.store_id == store.id)
                .count(),
                "经纪人绑定",
            ),
            (
                self.db.query(Lead.id)
                .filter(Lead.store_id == store.id, Lead.is_deleted.is_(False))
                .count(),
                "线索",
            ),
            (
                self.db.query(MerchantAgreement.id)
                .filter(MerchantAgreement.store_id == store.id)
                .count(),
                "协议",
            ),
        )
        blocked = [label for count, label in relations if count > 0]
        if blocked:
            msg = f"门店存在关联数据（{'、'.join(blocked)}），不能删除，请改用停用"
            raise ConflictError(msg)

        before = self._snapshot(store)
        store.is_deleted = True
        store.deleted_at = datetime.now(timezone.utc)
        store.deleted_by = str(user.id)
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="delete",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store) | {"reason": req.reason},
            request=request,
        )
        self.db.commit()

    def merge_stores(
        self,
        user: User,
        req: MerchantStoreMergeRequest,
        *,
        request: Request | None = None,
    ) -> dict[str, int]:
        """门店合并：迁移拜访/绑定/经纪人/线索/协议，原门店标记已合并."""
        keep = self._get_store(req.keep_store_id)
        merged = self._get_store(req.merged_store_id)
        if keep.id == merged.id:
            msg = "保留门店与被合并门店不能相同"
            raise ValidationError(msg)
        if merged.status == MerchantStoreStatus.MERGED.value:
            msg = "被合并门店已是已合并状态"
            raise ValidationError(msg)
        if keep.company_id != merged.company_id:
            msg = "不允许跨公司合并门店"
            raise ValidationError(msg)

        visit_count = (
            self.db.query(MerchantVisit)
            .filter(MerchantVisit.store_id == merged.id)
            .update({MerchantVisit.store_id: keep.id}, synchronize_session=False)
        )
        lead_count = (
            self.db.query(Lead)
            .filter(Lead.store_id == merged.id)
            .update({Lead.store_id: keep.id}, synchronize_session=False)
        )
        agreement_count = (
            self.db.query(MerchantAgreement)
            .filter(MerchantAgreement.store_id == merged.id)
            .update({MerchantAgreement.store_id: keep.id}, synchronize_session=False)
        )

        merged_bindings = (
            self.db.query(MerchantBrokerBinding)
            .filter(
                MerchantBrokerBinding.store_id == merged.id,
                MerchantBrokerBinding.status == "active",
            )
            .all()
        )
        for binding in merged_bindings:
            broker = self.db.query(MerchantBroker).filter(MerchantBroker.id == binding.broker_id).first()
            if broker is not None and broker.store_id == keep.id:
                binding.status = "unbound"
                binding.unbound_at = datetime.now(timezone.utc)
        binding_count = (
            self.db.query(MerchantBrokerBinding)
            .filter(MerchantBrokerBinding.store_id == merged.id)
            .update({MerchantBrokerBinding.store_id: keep.id}, synchronize_session=False)
        )
        broker_count = (
            self.db.query(MerchantBroker)
            .filter(MerchantBroker.store_id == merged.id)
            .update({MerchantBroker.store_id: keep.id}, synchronize_session=False)
        )

        before = self._snapshot(merged)
        merged.status = MerchantStoreStatus.MERGED.value
        merged.review_status = MerchantStoreReviewStatus.MERGED.value
        merged.merged_to_store_id = keep.id
        merged.former_store_no = merged.store_name
        merged.is_deleted = False

        max_visit = (
            self.db.query(func.max(MerchantVisit.visited_at))
            .filter(MerchantVisit.store_id == keep.id, MerchantVisit.is_deleted.is_(False))
            .scalar()
        )
        keep.last_visit_at = max_visit

        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="merge",
            resource_type="merchant_store",
            resource_id=str(merged.id),
            before=before,
            after=self._snapshot(merged) | {"keep_store_id": str(keep.id), "reason": req.reason},
            request=request,
        )
        self.db.commit()
        return {
            "visits": int(visit_count),
            "leads": int(lead_count),
            "agreements": int(agreement_count),
            "bindings": int(binding_count),
            "brokers": int(broker_count),
        }

    def review_broker_store(
        self,
        user: User,
        store_id: str,
        req: MerchantStoreReviewRequest,
        *,
        request: Request | None = None,
    ) -> MerchantStoreResponse:
        """经纪人自建门店转正/合并（m02721；仅 admin 在路由层校验）."""
        store = self._get_store(store_id)
        if store.review_status != MerchantStoreReviewStatus.PENDING.value:
            msg = "仅未审核门店可执行审核"
            raise ValidationError(msg)
        if req.action == "merge":
            if not req.target_store_id:
                msg = "合并必须选择保留门店"
                raise ValidationError(msg)
            self.merge_stores(
                user,
                MerchantStoreMergeRequest(
                    keep_store_id=req.target_store_id,
                    merged_store_id=store.id,
                    reason=req.remark or "经纪人自建门店合并",
                ),
                request=request,
            )
            self.db.refresh(store)
            return store_response(store, cooperation_label_map(self.db))

        before = self._snapshot(store)
        store.review_status = MerchantStoreReviewStatus.APPROVED.value
        if store.created_by_broker_id:
            broker = self.db.query(MerchantBroker).filter(MerchantBroker.id == store.created_by_broker_id).first()
            if broker is not None and broker.store_id is None and broker.bind_status != "disabled":
                self.db.add(
                    MerchantBrokerBinding(
                        broker_id=broker.id,
                        store_id=store.id,
                        status="active",
                        approved_at=datetime.now(timezone.utc),
                        approved_by=str(user.id),
                        bind_source="backoffice",
                        store_name_snapshot=store.store_name,
                    ),
                )
                broker.store_id = store.id
                broker.bind_status = "bound"
                broker.bound_at = datetime.now(timezone.utc)
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="update",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store) | {"review_remark": req.remark},
            request=request,
        )
        self.db.commit()
        self.db.refresh(store)
        return store_response(store, cooperation_label_map(self.db))

    def detail(self, user: User, store_id: str) -> MerchantStoreDetailResponse:
        """门店详情聚合（Q39）."""
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        from services.merchant.agreement import MerchantAgreementService
        from services.merchant.broker import MerchantBrokerService
        from services.merchant.serializers import broker_response
        from services.merchant.visit import MerchantVisitService

        brokers = [
            broker_response(row, store_name=store.store_name)
            for row in MerchantBrokerService(self.db).effective_brokers_for_store(str(store.id))
        ]
        visits = MerchantVisitService(self.db).list_store_visits(
            user,
            store_id,
            page=1,
            page_size=20,
        )
        agreements = []
        if ensure_scope_role(user):
            agreements = [
                item.model_dump(mode="json")
                for item in MerchantAgreementService(self.db)
                .search(
                    user,
                    page=1,
                    page_size=20,
                    store_id=str(store.id),
                )
                .items
            ]

        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        total = self.db.query(Lead.id).filter(Lead.store_id == store.id, Lead.is_deleted.is_(False)).count()
        month_new = (
            self.db.query(Lead.id)
            .filter(
                Lead.store_id == store.id,
                Lead.is_deleted.is_(False),
                Lead.created_at >= month_start,
            )
            .count()
        )
        return MerchantStoreDetailResponse(
            store=store_response(store, cooperation_label_map(self.db)),
            brokers=[item.model_dump(mode="json") for item in brokers],
            visits=visits,
            agreements=agreements,
            lead_stats=MerchantLeadStats(total=int(total), month_new=int(month_new)),
            status_logs=self.status_logs(user, store_id),
        )

    # -------------------- 合作状态 --------------------
    def change_cooperation_status(
        self,
        user: User,
        store_id: str,
        req: MerchantStoreStatusChangeRequest,
        *,
        request: Request | None = None,
    ) -> MerchantStoreResponse:
        """合作状态变更（Q19：员工仅可改洽谈中；已合作必须有已签协议）."""
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        if store.status in {MerchantStoreStatus.MERGED.value, MerchantStoreStatus.RELOCATED.value}:
            msg = "当前门店状态不允许变更合作状态"
            raise ValidationError(msg)

        target = req.target_status
        self._validate_dict_code(COOPERATION_DICT, target)
        if target == store.cooperation_status:
            msg = "合作状态未发生变化"
            raise ConflictError(msg)

        privileged = ensure_scope_role(user)
        if not privileged and target != MerchantCooperationStatus.NEGOTIATING.value:
            msg = "员工仅可将合作状态改为洽谈中"
            raise PermissionDeniedError(msg)

        if target == MerchantCooperationStatus.COOPERATED.value and not self._has_signed_agreement(store.id):
            msg = "改为已合作前必须先签署电子合作协议"
            raise ValidationError(msg)

        before = self._snapshot(store)
        log = MerchantStoreStatusLog(
            store_id=store.id,
            from_status=store.cooperation_status,
            to_status=target,
            reason=req.reason.strip(),
            operator_id=str(user.id),
        )
        self.db.add(log)
        store.cooperation_status = target
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="update",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store) | {"reason": req.reason.strip()},
            request=request,
        )
        self.db.commit()
        self.db.refresh(store)
        return store_response(store, cooperation_label_map(self.db))

    def set_cooperation_status_system(
        self,
        store: MerchantStore,
        target: str,
        *,
        reason: str,
        operator_id: str | None = None,
        request: Request | None = None,
    ) -> None:
        """系统/协议联动变更合作状态（不校验员工手动权限，不提交事务）.

        V05 协议签署完成后联动门店为“已合作”（BR-M04-011）。
        """
        if store.cooperation_status == target:
            return
        before = self._snapshot(store)
        self.db.add(
            MerchantStoreStatusLog(
                store_id=store.id,
                from_status=store.cooperation_status,
                to_status=target,
                reason=reason,
                operator_id=operator_id,
            ),
        )
        store.cooperation_status = target
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store) | {"reason": reason},
            request=request,
        )

    # -------------------- 照片 --------------------
    def update_photos(
        self,
        user: User,
        store_id: str,
        photos: Sequence[StorePhotoItem],
        *,
        request: Request | None = None,
    ) -> MerchantStoreResponse:
        """门店照片补录/替换（全部选拍，不强制，Q06）."""
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        before = self._snapshot(store)
        store.photos = _photo_json(photos)
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="update",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store),
            request=request,
        )
        self.db.commit()
        self.db.refresh(store)
        return store_response(store, cooperation_label_map(self.db))

    # -------------------- 商圈建议 --------------------
    def business_circles(self, *, district: str | None = None) -> list[str]:
        """商圈建议：小区商圈优先 + 已建门店商圈兜底（Q03）."""
        values: list[str] = []
        query = self.db.query(Community.business_circle).filter(Community.business_circle.isnot(None))
        if district:
            query = query.filter(Community.district == district)
        values.extend(row[0] for row in query.distinct().limit(50).all())

        store_query = self.db.query(MerchantStore.business_circle).filter(MerchantStore.is_deleted.is_(False))
        if district:
            store_query = store_query.filter(MerchantStore.district == district)
        values.extend(row[0] for row in store_query.distinct().limit(50).all())

        deduped = sorted({value for value in values if value})
        return deduped[:30]

    # -------------------- 内部辅助 --------------------
    def _get_store(self, store_id: str) -> MerchantStore:
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        return store

    def _active_company(self, company_id: str) -> MerchantCompany:
        company = self.db.query(MerchantCompany).filter(MerchantCompany.id == company_id).first()
        if company is None:
            msg = "公司不存在"
            raise ResourceNotFoundError(msg)
        if company.status != "normal":
            msg = "公司已停用，不可新建门店"
            raise ValidationError(msg)
        return company

    def _resolve_owner(
        self,
        req: MerchantStoreCreate,
        *,
        source: str,
        actor_id: str | None,
        is_privileged: bool,
    ) -> str | None:
        if source == MerchantStoreSource.EMPLOYEE.value:
            return actor_id
        if source == MerchantStoreSource.BACKOFFICE.value:
            return req.owner_employee_id
        if source == MerchantStoreSource.BROKER.value:
            return req.owner_employee_id
        return req.owner_employee_id if is_privileged else actor_id

    def _validate_dict_code(self, dict_code: str, code: str | None) -> None:
        if not code:
            return
        exists = (
            self.db.query(BizDictItem.id)
            .filter(
                BizDictItem.dict_code == dict_code,
                BizDictItem.code == code,
                BizDictItem.enabled.is_(True),
            )
            .first()
        )
        if exists is None:
            msg = f"无效的字典值: {dict_code}={code}"
            raise ValidationError(msg)

    def _has_signed_agreement(self, store_id: str) -> bool:
        """已签署协议前置校验（V05 表未上线前按无协议处理）."""
        inspector = inspect(self.db.get_bind())
        if "merchant_agreements" not in inspector.get_table_names():
            return False
        columns = {col["name"] for col in inspector.get_columns("merchant_agreements")}
        if "store_id" not in columns or "status" not in columns:
            return False
        count = self.db.execute(
            text(
                'SELECT COUNT(*) FROM "merchant_agreements" '
                'WHERE "store_id" = :store_id AND "status" = :status',
            ),
            {"store_id": store_id, "status": "signed"},
        ).scalar_one()
        return int(count) > 0

    @staticmethod
    def _snapshot(store: MerchantStore) -> dict:
        return {
            "company_id": str(store.company_id),
            "company_name": store.company_name,
            "store_name": store.store_name,
            "province": store.province,
            "city": store.city,
            "district": store.district,
            "business_circle": store.business_circle,
            "address": store.address,
            "lng": float(store.lng) if store.lng is not None else None,
            "lat": float(store.lat) if store.lat is not None else None,
            "contact_name": store.contact_name,
            "contact_phone": store.contact_phone,
            "cooperation_status": store.cooperation_status,
            "source": store.source,
            "owner_employee_id": store.owner_employee_id,
            "status": store.status,
            "review_status": store.review_status,
            "merged_to_store_id": store.merged_to_store_id,
            "relocated_to_store_id": store.relocated_to_store_id,
            "photos": store.photos or [],
            "remark": store.remark,
        }


__all__ = ["MerchantStoreService", "haversine_m"]
