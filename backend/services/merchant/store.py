"""门店服务（V02 M01B / M02）：建档、查重、维护、状态变更、搜索与详情."""

import math
from collections.abc import Sequence
from datetime import date, datetime, timezone

from fastapi import Request
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from constants.merchant import (
    MerchantBindStatus,
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
from models.property import Community, RegionDictType
from models.system import BizDictItem
from models.user.user import User
from schemas.merchant import (
    MerchantDuplicateCandidate,
    MerchantDuplicateCheckRequest,
    MerchantDuplicateCheckResponse,
    MerchantLeadStats,
    MerchantStoreActivationRequest,
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
    MerchantStoreStatusOption,
    MerchantStoreStatusOptionsResponse,
    MerchantStoreUpdate,
    StorePhotoItem,
)
from services.merchant.audit import add_audit_log
from services.merchant.scope import ensure_scope_role, ensure_store_visible, store_scope_condition
from services.merchant.serializers import cooperation_label_map, store_list_item, store_response
from services.property.region_dict import RegionDictService
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
# REQ-IT1-03：省市不再由前端填写，缺省统一补齐（模型列仍为 NOT NULL，报表/导出口径不变）
_DEFAULT_PROVINCE = "上海市"
_DEFAULT_CITY = "上海市"

# REQ-IT5-06：建店联系人自动建档的经纪人来源，用于识别「占位经纪人」
_STORE_CONTACT_BROKER_SOURCE = "store_contact"
_DISTANCE_LIMIT_M = 500
_RELOCATE_DISTANCE_M = 1000
# 1 度纬度约 111.32km，用于把 500m 半径换算成经纬度包围盒（仅作召回，精确距离仍用 haversine_m）
_METERS_PER_DEGREE_LAT = 111_320.0
# 查重召回上限与返回上限（超出即视为「未扫描完全部候选」）
_DUPLICATE_SCAN_LIMIT = 100
_DUPLICATE_RETURN_LIMIT = 20
# 中国大陆 GCJ-02 经纬度包络（M09-001：坐标统一 GCJ-02，越界即视为取点错误）
_GCJ02_LNG_MIN = 73.0
_GCJ02_LNG_MAX = 135.5
_GCJ02_LAT_MIN = 3.0
_GCJ02_LAT_MAX = 54.0


def haversine_m(lng1: float, lat1: float, lng2: float, lat2: float) -> int:
    """两坐标点直线距离（米，GCJ-02 近似球面计算）."""
    radius = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return round(radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)))


def distance_m_expr(origin_lng: float, origin_lat: float) -> ColumnElement[float]:
    """构造 SQL 侧 Haversine 距离表达式（米），用于 ORDER BY（REQ-IT4-02）.

    距离排序必须在数据库完成：只在 Python 里排当前页会让翻页顺序错乱。
    门店坐标为空（存量门店可能没取点）时表达式结果为 NULL，由调用方 `.nullslast()` 排到末尾。
    """
    radius = 6371000.0
    lat_rad = func.radians(MerchantStore.lat)
    d_lat = lat_rad - math.radians(origin_lat)
    d_lng = func.radians(MerchantStore.lng) - math.radians(origin_lng)
    cos_lat = math.cos(math.radians(origin_lat))
    a = func.power(func.sin(d_lat / 2), 2) + cos_lat * func.cos(lat_rad) * func.power(func.sin(d_lng / 2), 2)
    # least(...,1) 兜住浮点误差导致的 asin 域外值；PostgreSQL 的 LEAST 会忽略 NULL 返回 1.0，
    # 因此缺坐标时必须显式置 NULL，否则会被算成半个地球周长而不是排到末尾。
    distance = 2 * radius * func.asin(func.sqrt(func.least(a, 1.0)))
    return case(
        (MerchantStore.lng.is_(None) | MerchantStore.lat.is_(None), None),
        else_=distance,
    )


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
        # 500m 作为独立召回信号：名称/地址/电话都不相似的近距离门店也必须进入候选
        if req.lng is not None and req.lat is not None:
            lat_delta = _DISTANCE_LIMIT_M / _METERS_PER_DEGREE_LAT
            cos_lat = max(math.cos(math.radians(req.lat)), 0.2)
            lng_delta = _DISTANCE_LIMIT_M / (_METERS_PER_DEGREE_LAT * cos_lat)
            conditions.append(
                and_(
                    MerchantStore.lng.isnot(None),
                    MerchantStore.lat.isnot(None),
                    MerchantStore.lng >= req.lng - lng_delta,
                    MerchantStore.lng <= req.lng + lng_delta,
                    MerchantStore.lat >= req.lat - lat_delta,
                    MerchantStore.lat <= req.lat + lat_delta,
                ),
            )

        rows = (
            self.db.query(MerchantStore)
            .filter(
                MerchantStore.is_deleted.is_(False),
                MerchantStore.status != MerchantStoreStatus.MERGED.value,
                or_(*conditions),
            )
            .order_by(MerchantStore.updated_at.desc())
            .limit(_DUPLICATE_SCAN_LIMIT)
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
            # 存量门店坐标可空（迁移 v110），缺坐标时跳过距离维度，不能让 float(None) 抛 500
            if req.lng is not None and req.lat is not None and store.lng is not None and store.lat is not None:
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
        # completed 表示「已扫描完全部候选」：召回被 limit 截断或候选被截到 20 条时为 False
        completed = len(rows) < _DUPLICATE_SCAN_LIMIT and len(candidates) <= _DUPLICATE_RETURN_LIMIT
        return MerchantDuplicateCheckResponse(candidates=candidates[:_DUPLICATE_RETURN_LIMIT], completed=completed)

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
        commit: bool = True,
    ) -> tuple[MerchantStore, list[MerchantDuplicateCandidate], MerchantVisit | None]:
        """创建门店（员工/后台/经纪人共用；首访改为可选，不再强制建档时登记）."""
        self._validate_gcj02(req.lng, req.lat)
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
            province=(req.province or "").strip() or _DEFAULT_PROVINCE,
            city=(req.city or "").strip() or _DEFAULT_CITY,
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
        # REQ-IT2-02：首访改为可选，仅在前端显式提交时登记
        if source == MerchantStoreSource.EMPLOYEE.value and req.first_visit is not None:
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
            after=self._snapshot(store)
            | {
                "force_create_reason": req.force_create_reason,
                "duplicates": [{"id": item.id, "matched_by": item.matched_by} for item in duplicates],
            },
            request=request,
        )
        # REQ-IT5-06：联系人自动建档为门店经纪人（冲突只留审计，不阻断建店）
        self._ensure_contact_broker(store, actor_id=actor_id, request=request)

        if commit:
            self.db.commit()
            self.db.refresh(store)
        else:
            self.db.flush()
        return store, duplicates, first_visit

    def _ensure_contact_broker(
        self,
        store: MerchantStore,
        *,
        actor_id: str | None,
        request: Request | None,
    ) -> None:
        """把门店联系人补成门店经纪人（REQ-IT5-06，见 ``MerchantBrokerService.ensure_contact_broker``）."""
        from services.merchant.broker import MerchantBrokerService

        MerchantBrokerService(self.db).ensure_contact_broker(store, actor_id=actor_id, request=request)

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
        source: str | None = None,
        broker_count_min: int | None = None,
        broker_count_max: int | None = None,
        created_from: date | None = None,
        created_to: date | None = None,
        origin_lng: float | None = None,
        origin_lat: float | None = None,
    ) -> MerchantStoreListResponse:
        """门店分页搜索（按数据范围过滤，默认排除已合并/已搬迁/已删除）.

        传入 ``origin_lng`` + ``origin_lat`` 时按与原点距离升序排序（REQ-IT4-02），
        并在列表项回填 ``distance_m``；未传时维持 ``updated_at`` 倒序。
        """
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
        if source:
            query = query.filter(MerchantStore.source == source)
        if created_from is not None:
            query = query.filter(func.date(MerchantStore.created_at) >= created_from)
        if created_to is not None:
            query = query.filter(func.date(MerchantStore.created_at) <= created_to)
        if broker_count_min is not None or broker_count_max is not None:
            broker_counts = (
                self.db.query(
                    MerchantBroker.store_id.label("store_id"),
                    func.count(MerchantBroker.id).label("cnt"),
                )
                .filter(MerchantBroker.bind_status == MerchantBindStatus.BOUND.value)
                .group_by(MerchantBroker.store_id)
                .subquery()
            )
            query = query.outerjoin(broker_counts, broker_counts.c.store_id == MerchantStore.id)
            if broker_count_min is not None:
                query = query.filter(func.coalesce(broker_counts.c.cnt, 0) >= broker_count_min)
            if broker_count_max is not None:
                query = query.filter(func.coalesce(broker_counts.c.cnt, 0) <= broker_count_max)

        total = query.count()
        origin = (origin_lng, origin_lat) if origin_lng is not None and origin_lat is not None else None
        if origin is not None:
            order_by = (distance_m_expr(origin[0], origin[1]).asc().nullslast(), MerchantStore.updated_at.desc())
        else:
            order_by = (MerchantStore.updated_at.desc(),)
        rows = query.order_by(*order_by).offset((page - 1) * page_size).limit(page_size).all()
        store_ids = [store.id for store, _ in rows]
        broker_counts: dict[str, int] = {}
        if store_ids:
            broker_counts = dict(
                self.db.query(MerchantBroker.store_id, func.count(MerchantBroker.id))
                .filter(
                    MerchantBroker.store_id.in_(store_ids),
                    MerchantBroker.bind_status == MerchantBindStatus.BOUND.value,
                )
                .group_by(MerchantBroker.store_id)
                .all(),
            )
        return MerchantStoreListResponse(
            items=[
                store_list_item(
                    store,
                    labels,
                    owner_employee_name=name,
                    broker_count=broker_counts.get(store.id, 0),
                    distance_m=(
                        haversine_m(origin[0], origin[1], float(store.lng), float(store.lat))
                        if origin is not None and store.lng is not None and store.lat is not None
                        else None
                    ),
                )
                for store, name in rows
            ],
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
        operator_ids = {row.operator_id for row in rows if row.operator_id}
        names: dict[str, str] = {}
        if operator_ids:
            users = self.db.query(User).filter(User.id.in_(operator_ids)).all()
            names = {str(user.id): user.nickname or user.username for user in users}
        return [
            MerchantStoreStatusLogResponse(
                id=str(row.id),
                from_status=row.from_status,
                to_status=row.to_status,
                reason=row.reason,
                operator_id=row.operator_id,
                operator_name=names.get(str(row.operator_id)) if row.operator_id else None,
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

        if req.expected_updated_at is not None and store.updated_at != req.expected_updated_at:
            msg = "数据已被他人修改，请刷新后重试"
            raise ConflictError(msg)
        self._validate_gcj02(req.lng, req.lat)
        if req.change_type in ("correct", "relocate") and not (req.change_reason or "").strip():
            msg = "地址纠错或门店搬迁必须填写变更原因"
            raise ValidationError(msg)

        if req.change_type == "relocate":
            return self._relocate(store, req, user=user, request=request)

        textual_fields = ("province", "city", "district", "business_circle", "address")
        text_changed = any(
            getattr(req, field) is not None and getattr(req, field).strip() != getattr(store, field)
            for field in textual_fields
        )
        coords_changed = (req.lng is not None and (store.lng is None or float(req.lng) != float(store.lng))) or (
            req.lat is not None and (store.lat is None or float(req.lat) != float(store.lat))
        )
        if req.change_type == "edit":
            if text_changed and not coords_changed:
                msg = "地址已变更但坐标未更新，请重新选点后再保存"
                raise ValidationError(msg)
            if coords_changed and not text_changed:
                msg = "坐标已变更但地址未更新，请确认地址后再保存"
                raise ValidationError(msg)
        if (text_changed or coords_changed) and req.change_type == "edit":
            msg = "地址或坐标发生变化，请选择地址纠错或门店搬迁"
            raise ValidationError(msg)
        region_changed = any(
            getattr(req, field) is not None and getattr(req, field).strip() != getattr(store, field)
            for field in ("province", "city", "district")
        )
        if region_changed and req.change_type != "relocate":
            msg = "跨区域变更请选择门店搬迁"
            raise ValidationError(msg)
        if coords_changed and req.change_type == "edit":
            old_lng = float(store.lng) if store.lng is not None else None
            old_lat = float(store.lat) if store.lat is not None else None
            if old_lng is not None and old_lat is not None:
                distance = haversine_m(old_lng, old_lat, float(req.lng or old_lng), float(req.lat or old_lat))
                if distance > _RELOCATE_DISTANCE_M:
                    msg = "坐标移动超过 1 公里，请选择地址纠错或门店搬迁"
                    raise ValidationError(msg)

        # 必填字段被清空必须拒绝（REQ-M01B-003 分支 2）；Pydantic 的 min_length 挡不住纯空白
        for label, value in (
            ("门店名称", req.store_name),
            ("省份", req.province),
            ("城市", req.city),
            ("区县", req.district),
            ("商圈", req.business_circle),
            ("详细地址", req.address),
            ("联系人", req.contact_name),
            ("联系电话", req.contact_phone),
        ):
            if value is not None and not value.strip():
                msg = f"{label}不能为空"
                raise ValidationError(msg)

        before = self._snapshot(store)
        updated = False

        if req.company_id is not None and req.company_id != store.company_id:
            company = self._active_company(req.company_id)
            store.company_id = company.id
            store.company_name = company.company_name
            updated = True
        if req.store_name is not None and req.store_name.strip() != store.store_name:
            store.store_name = req.store_name.strip()
            updated = True
        if req.province is not None and req.province.strip() != store.province:
            store.province = req.province.strip()
            updated = True
        if req.city is not None and req.city.strip() != store.city:
            store.city = req.city.strip()
            updated = True
        if req.district is not None and req.district.strip() != store.district:
            store.district = req.district.strip()
            updated = True
        if req.business_circle is not None and req.business_circle.strip() != store.business_circle:
            store.business_circle = req.business_circle.strip()
            updated = True
        if req.address is not None and req.address.strip() != store.address:
            store.address = req.address.strip()
            updated = True
        if req.lng is not None:
            store.lng = req.lng
            updated = True
        if req.lat is not None:
            store.lat = req.lat
            updated = True
        if req.contact_name is not None and req.contact_name.strip() != store.contact_name:
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
        if req.remark is not None and req.remark != store.remark:
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
        """门店软删除：存在拜访/绑定/线索/协议关联时拒绝（Q44）.

        重复删除按 REQ-M11-004 分支 5 幂等处理（不再抛 404）。
        """
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        ensure_store_visible(self.db, user, store)
        if store.is_deleted:
            return
        relations = (
            (
                self.db.query(MerchantVisit.id)
                .filter(MerchantVisit.store_id == store.id, MerchantVisit.is_deleted.is_(False))
                .count(),
                "拜访记录",
            ),
            (
                # REQ-IT5-06：建店自动生成的「联系人占位经纪人」不算真实关联，
                # 否则任何新建门店都会因这条系统数据而无法删除（只能停用）
                self.db.query(MerchantBrokerBinding.id)
                .join(MerchantBroker, MerchantBroker.id == MerchantBrokerBinding.broker_id)
                .filter(
                    MerchantBrokerBinding.store_id == store.id,
                    or_(
                        MerchantBroker.source != _STORE_CONTACT_BROKER_SOURCE,
                        MerchantBroker.user_id.isnot(None),
                    ),
                )
                .count(),
                "经纪人绑定",
            ),
            (
                self.db.query(Lead.id).filter(Lead.store_id == store.id, Lead.is_deleted.is_(False)).count(),
                "线索",
            ),
            (
                self.db.query(MerchantAgreement.id).filter(MerchantAgreement.store_id == store.id).count(),
                "协议",
            ),
        )
        blocked = [label for count, label in relations if count > 0]
        if blocked:
            msg = f"门店存在关联数据（{'、'.join(blocked)}），不能删除，请改用停用"
            raise ConflictError(msg)

        # REQ-IT5-06：占位经纪人不阻断删除，但删除后必须解绑，避免档案永久指向已删除门店
        from services.merchant.broker import MerchantBrokerService

        MerchantBrokerService(self.db).release_contact_brokers(store.id, operator_id=str(user.id))

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
            # AC-V01-013 要求 delete 记录 after 为空；BR-M11-014 又要求记录删除原因，
            # 因此把原因并入 before（删除后的「新状态」确实不存在，不臆造 after）
            before=before | {"delete_reason": req.reason},
            after=None,
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
        if keep.status == MerchantStoreStatus.MERGED.value:
            msg = "保留门店已是已合并状态，请选择正常门店"
            raise ValidationError(msg)
        if keep.status == MerchantStoreStatus.DISABLED.value:
            msg = "保留门店已停用，请先启用或选择其他门店"
            raise ValidationError(msg)
        if keep.company_id != merged.company_id:
            msg = "不允许跨公司合并门店"
            raise ValidationError(msg)
        # 数据范围复核（BR-M12-019）：越权门店按 403 拒绝，不泄露是否存在
        ensure_store_visible(self.db, user, keep)
        ensure_store_visible(self.db, user, merged)

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
        # 曾用门店号：需求 R-V07-12 未确认取值口径（原 store_no 还是原 store_id），
        # 且数据模型无门店编号列；此处存门店名，保证详情页「曾用门店」可读可追溯。
        merged.former_store_no = merged.store_name
        merged.is_deleted = False

        max_visit = (
            self.db.query(func.max(MerchantVisit.visited_at))
            .filter(MerchantVisit.store_id == keep.id, MerchantVisit.is_deleted.is_(False))
            .scalar()
        )
        keep.last_visit_at = max_visit

        migrated = {
            "visits": int(visit_count),
            "leads": int(lead_count),
            "agreements": int(agreement_count),
            "bindings": int(binding_count),
            "brokers": int(broker_count),
        }
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="merge",
            resource_type="merchant_store",
            resource_id=str(merged.id),
            before=before,
            after=self._snapshot(merged) | {"keep_store_id": str(keep.id), "reason": req.reason, "migrated": migrated},
            request=request,
        )
        self.db.commit()
        return migrated

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
            add_audit_log(
                self.db,
                user_id=str(user.id),
                action="review_merge",
                resource_type="merchant_store",
                resource_id=str(store.id),
                before=None,
                after={"target_store_id": req.target_store_id, "review_remark": req.remark},
                request=request,
            )
            self.db.commit()
            return store_response(store, cooperation_label_map(self.db))

        # REQ-M11-012 分支 2：必填字段缺失时拒绝转正并提示先补全
        missing = [
            label
            for label, value in (
                ("门店名称", store.store_name),
                ("省份", store.province),
                ("城市", store.city),
                ("区县", store.district),
                ("商圈", store.business_circle),
                ("详细地址", store.address),
                ("联系人", store.contact_name),
                ("联系电话", store.contact_phone),
            )
            if not (value or "").strip()
        ]
        if missing:
            msg = f"门店必填字段不完整（{'、'.join(missing)}），请先补全后再转正"
            raise ValidationError(msg)

        before = self._snapshot(store)
        store.review_status = MerchantStoreReviewStatus.APPROVED.value
        binding_skipped = None
        if store.created_by_broker_id:
            broker = self.db.query(MerchantBroker).filter(MerchantBroker.id == store.created_by_broker_id).first()
            if broker is not None and broker.bind_status == "disabled":
                # REQ-M11-012 分支 5：创建经纪人已停用 → 允许转正但不自动绑定，记录原因
                binding_skipped = "创建经纪人已停用，未自动绑定"
            elif broker is not None and broker.store_id is None:
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
            action="review_approve",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store)
            | {"review_remark": req.remark}
            | ({"broker_binding_skipped": binding_skipped} if binding_skipped else {}),
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

        # REQ-M11-012 主流程 2：待审核门店详情需展示创建经纪人、邀请员工
        created_by_broker_name = None
        inviter_employee_name = None
        if store.created_by_broker_id:
            creator = self.db.query(MerchantBroker).filter(MerchantBroker.id == store.created_by_broker_id).first()
            if creator is not None:
                created_by_broker_name = creator.name
                if creator.inviter_employee_id:
                    inviter = self.db.query(User).filter(User.id == creator.inviter_employee_id).first()
                    if inviter is not None:
                        inviter_employee_name = inviter.nickname or inviter.username

        owner_employee_name = None
        if store.owner_employee_id:
            owner = self.db.query(User).filter(User.id == store.owner_employee_id).first()
            if owner is not None:
                owner_employee_name = owner.nickname or owner.username

        merged_to_store_name = None
        if store.merged_to_store_id:
            merged_to = self.db.query(MerchantStore).filter(MerchantStore.id == store.merged_to_store_id).first()
            if merged_to is not None:
                merged_to_store_name = merged_to.store_name

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
            created_by_broker_name=created_by_broker_name,
            inviter_employee_name=inviter_employee_name,
            merged_to_store_name=merged_to_store_name,
            owner_employee_name=owner_employee_name,
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
        """合作状态变更（Q19：员工仅可改洽谈中；REQ-IT5-01：不再要求已签协议）."""
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

    def cooperation_status_options(self, user: User, store_id: str) -> MerchantStoreStatusOptionsResponse:
        """合作状态可选值（REQ-IT4-05）.

        与 ``change_cooperation_status`` 共用同一套规则裁剪，小程序只渲染不再自行推导权限：
        已合并/已搬迁不可变更；无全量权限的员工只能改为「洽谈中」。
        REQ-IT5-01：合作状态与协议完全解耦，「已合作」不再要求已签协议。
        """
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        labels = cooperation_label_map(self.db)
        items: list[MerchantStoreStatusOption] = []
        reason: str | None = None
        if store.status in {MerchantStoreStatus.MERGED.value, MerchantStoreStatus.RELOCATED.value}:
            reason = "当前门店状态不允许变更合作状态"
        else:
            privileged = ensure_scope_role(user)
            for code, label in self._active_cooperation_items():
                if code == store.cooperation_status:
                    continue
                if not privileged and code != MerchantCooperationStatus.NEGOTIATING.value:
                    continue
                items.append(MerchantStoreStatusOption(code=code, label=label))
            if not items:
                reason = "员工仅可改为洽谈中，当前已是可选的最终状态" if not privileged else "暂无可变更的合作状态"
        return MerchantStoreStatusOptionsResponse(
            current_status=store.cooperation_status,
            current_status_label=labels.get(store.cooperation_status, store.cooperation_status),
            items=items,
            reason=reason,
        )

    def _active_cooperation_items(self) -> list[tuple[str, str]]:
        """启用中的合作状态字典项（按排序值升序）."""
        rows = (
            self.db.query(BizDictItem.code, BizDictItem.label)
            .filter(BizDictItem.dict_code == COOPERATION_DICT, BizDictItem.enabled.is_(True))
            .order_by(BizDictItem.sort_order.asc(), BizDictItem.code.asc())
            .all()
        )
        return [(str(code), str(label)) for code, label in rows]

    def merge_preview(self, user: User, merged_store_id: str, keep_store_id: str) -> dict[str, int]:
        """待迁移数据量预览（REQ-M11-005 主流程 3），校验规则与合并一致."""
        keep = self._get_store(keep_store_id)
        merged = self._get_store(merged_store_id)
        if keep.id == merged.id:
            msg = "保留门店与被合并门店不能相同"
            raise ValidationError(msg)
        if merged.status == MerchantStoreStatus.MERGED.value:
            msg = "被合并门店已是已合并状态"
            raise ValidationError(msg)
        if keep.status == MerchantStoreStatus.MERGED.value:
            msg = "保留门店已是已合并状态，请选择正常门店"
            raise ValidationError(msg)
        if keep.status == MerchantStoreStatus.DISABLED.value:
            msg = "保留门店已停用，请先启用或选择其他门店"
            raise ValidationError(msg)
        if keep.company_id != merged.company_id:
            msg = "不允许跨公司合并门店"
            raise ValidationError(msg)
        ensure_store_visible(self.db, user, keep)
        ensure_store_visible(self.db, user, merged)
        return {
            "visits": self.db.query(MerchantVisit)
            .filter(MerchantVisit.store_id == merged.id, MerchantVisit.is_deleted.is_(False))
            .count(),
            "leads": self.db.query(Lead).filter(Lead.store_id == merged.id).count(),
            "agreements": self.db.query(MerchantAgreement).filter(MerchantAgreement.store_id == merged.id).count(),
            "bindings": self.db.query(MerchantBrokerBinding)
            .filter(MerchantBrokerBinding.store_id == merged.id, MerchantBrokerBinding.status == "active")
            .count(),
            "brokers": self.db.query(MerchantBroker).filter(MerchantBroker.store_id == merged.id).count(),
        }

    def change_activation_status(
        self,
        user: User,
        store_id: str,
        req: MerchantStoreActivationRequest,
        *,
        request: Request | None = None,
    ) -> MerchantStoreResponse:
        """门店停用/启用（REQ-M11-003 状态流转：正常 ↔ 停用）.

        停用后按 BR-M11-008 禁止新建拜访/绑定（由 visit/broker 服务校验 status）。
        """
        store = self._get_store(store_id)
        ensure_store_visible(self.db, user, store)
        if store.status in {MerchantStoreStatus.MERGED.value, MerchantStoreStatus.RELOCATED.value}:
            msg = "已合并/已搬迁门店不可停用或启用"
            raise ValidationError(msg)
        target = req.target_status
        if target == store.status:
            msg = "门店状态未发生变化"
            raise ConflictError(msg)

        before = self._snapshot(store)
        store.status = target
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="disable" if target == MerchantStoreStatus.DISABLED.value else "enable",
            resource_type="merchant_store",
            resource_id=str(store.id),
            before=before,
            after=self._snapshot(store) | {"reason": req.reason},
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

    # -------------------- 区域 / 商圈字典 --------------------
    def districts(self) -> list[str]:
        """区域候选（REQ-IT2-01：取字典启用项；字典为空时回退业务数据聚合）."""
        values = RegionDictService(self.db).active_names(RegionDictType.DISTRICT.value)
        if values:
            return values
        return self._legacy_districts()

    def _legacy_districts(self) -> list[str]:
        """回退实现：小区主数据 + 已建门店聚合（字典为空时才用）."""
        values: list[str] = []
        community_query = self.db.query(Community.district).filter(Community.district.isnot(None))
        values.extend(row[0] for row in community_query.distinct().limit(200).all())

        store_query = self.db.query(MerchantStore.district).filter(MerchantStore.is_deleted.is_(False))
        values.extend(row[0] for row in store_query.distinct().limit(200).all())

        deduped = sorted({value.strip() for value in values if value and value.strip()})
        return deduped[:100]

    def business_circles(self, *, district: str | None = None) -> list[str]:
        """商圈候选（REQ-IT2-01：取字典启用项；字典为空时回退业务数据聚合）."""
        values = RegionDictService(self.db).active_business_circles(district)
        if values:
            return values
        return self._legacy_business_circles(district)

    def _legacy_business_circles(self, district: str | None) -> list[str]:
        """回退实现：小区商圈 + 已建门店商圈聚合（字典为空时才用）."""
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

    @staticmethod
    def _validate_gcj02(lng: float | None, lat: float | None) -> None:
        """坐标必须落在 GCJ-02 中国大陆包络内（M09-001：系统统一 GCJ-02）.

        后台支持手填经纬度，若不校验会把 WGS-84 或明显错误的点落到地图之外；
        需求未给出更细的坐标系判定，这里只做包络拦截并提示改用高德坐标拾取器。
        """
        if lng is None and lat is None:
            return
        if lng is None or lat is None:
            msg = "经纬度必须成对填写"
            raise ValidationError(msg)
        if not (_GCJ02_LNG_MIN <= lng <= _GCJ02_LNG_MAX and _GCJ02_LAT_MIN <= lat <= _GCJ02_LAT_MAX):
            msg = "经纬度不在中国大陆范围（GCJ-02），请使用高德坐标拾取器取点"
            raise ValidationError(msg)

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
