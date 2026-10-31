"""经纪人档案与门店绑定服务（V04）."""

from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from constants.merchant import (
    MerchantBindingRecordStatus,
    MerchantBindSource,
    MerchantBindStatus,
    MerchantStoreStatus,
)
from models.merchant import (
    MerchantBroker,
    MerchantBrokerBinding,
    MerchantStore,
    MerchantStoreQRCode,
)
from models.recruit import RecruitLead
from models.user.user import User
from schemas.merchant import (
    BindingApprovalRequest,
    BrokerAdminCreate,
    BrokerAdminUpdate,
    BrokerBindingResponse,
    BrokerBindRequest,
    BrokerChangeRequest,
    BrokerListResponse,
    BrokerMyStoreResponse,
    BrokerRegisterRequest,
    BrokerRegisterResult,
    BrokerResponse,
    BrokerStatusChangeRequest,
    BrokerUnbindRequest,
    BrokerUpdateRequest,
    MerchantDuplicateCandidate,
    MerchantStoreCreate,
)
from services.merchant.audit import add_audit_log
from services.merchant.broker_qr import MerchantBrokerQRCodeService
from services.merchant.serializers import (
    broker_binding_response,
    broker_list_item,
    broker_my_store,
    broker_response,
    cooperation_label_map,
)
from services.system.auth import AuthService
from services.system.exceptions import (
    ConflictError,
    PermissionDeniedError,
    ResourceNotFoundError,
    ValidationError,
)
from utils.crypto import hash_phone


def _now() -> datetime:
    """带时区当前时间."""
    return datetime.now(timezone.utc)


class MerchantBrokerService:
    """经纪人档案与绑定服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # -------------------- 经纪人自助 --------------------
    def get_my_broker(self, user: User) -> MerchantBroker | None:
        """按关联 users.id 取当前经纪人档案."""
        return self.db.query(MerchantBroker).filter(MerchantBroker.user_id == str(user.id)).first()

    def my_profile(self, user: User) -> BrokerResponse | None:
        """当前登录用户的经纪人档案响应."""
        broker = self.get_my_broker(user)
        if broker is None:
            return None
        return self._response(broker)

    def _require_my_broker(self, user: User) -> MerchantBroker:
        broker = self.get_my_broker(user)
        if broker is None:
            msg = "尚未完成经纪人认证"
            raise ResourceNotFoundError(msg)
        if broker.bind_status == MerchantBindStatus.DISABLED.value:
            msg = "经纪人档案已停用，请联系运营"
            raise PermissionDeniedError(msg)
        return broker

    def register(
        self,
        user: User,
        req: BrokerRegisterRequest,
        *,
        request: Request | None = None,
    ) -> BrokerRegisterResult:
        """经纪人认证建档；手机号必须已在 users 绑定，可选二维码自动绑定."""
        if AuthService.has_backend_identity(user):
            msg = "内部员工不能注册为门店经纪人"
            raise PermissionDeniedError(msg)
        if not user.phone:
            msg = "请先完善手机号码后再进行经纪人认证"
            raise ValidationError(msg)
        phone = user.phone
        phone_hash = hash_phone(phone)

        broker = self.db.query(MerchantBroker).filter(MerchantBroker.phone_hash == phone_hash).first()
        created = False
        if broker is not None:
            if broker.user_id and broker.user_id != str(user.id):
                msg = "该手机号已被其他账号认证为经纪人"
                raise ConflictError(msg)
            if broker.bind_status == MerchantBindStatus.DISABLED.value:
                msg = "经纪人档案已停用，请联系运营"
                raise PermissionDeniedError(msg)
            if broker.user_id is None:
                broker.user_id = str(user.id)
        else:
            broker = MerchantBroker(
                user_id=str(user.id),
                name=req.name,
                phone=phone,
                phone_hash=phone_hash,
                bind_status=MerchantBindStatus.UNBOUND.value,
                source="self_apply",
                bind_source=MerchantBindSource.NONE.value,
            )
            self.db.add(broker)
            created = True

        qr_reason = None
        qr_token: MerchantStoreQRCode | None = None
        if req.qrcode_code:
            resolved = MerchantBrokerQRCodeService(self.db).resolve(req.qrcode_code)
            if resolved.valid:
                qr_token = MerchantBrokerQRCodeService(self.db).get_valid_token(req.qrcode_code)
            else:
                qr_reason = resolved.reason

        inviter_id: str | None = None
        bind_source = MerchantBindSource.NONE.value
        if qr_token is not None:
            inviter_id = str(qr_token.inviter_employee_id)
            bind_source = MerchantBindSource.QRCODE.value
        elif req.referrer:
            referrer = self.db.query(User).filter(User.id == req.referrer).first()
            if referrer is not None and AuthService.has_backend_identity(referrer):
                inviter_id = str(referrer.id)
                bind_source = MerchantBindSource.SHARE.value

        if inviter_id and not broker.inviter_employee_id:
            broker.inviter_employee_id = inviter_id
            broker.bind_source = bind_source

        self._match_recruit_lead(broker)
        self.db.flush()

        auto_bound = False
        if qr_token is not None:
            if broker.store_id and broker.store_id != qr_token.store_id:
                qr_reason = "已绑定其他门店，请先解绑或换绑"
            elif broker.store_id is None:
                store = self.db.query(MerchantStore).filter(MerchantStore.id == qr_token.store_id).first()
                if store is not None and store.status == MerchantStoreStatus.NORMAL.value:
                    self._activate_binding(
                        broker,
                        store,
                        bind_source=MerchantBindSource.QRCODE.value,
                        inviter_employee_id=inviter_id,
                        approved_by=None,
                    )
                    auto_bound = True
                    qr_reason = None

        action = "create" if created else "update"
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action=action,
            resource_type="merchant_broker",
            resource_id=str(broker.id),
            before=None,
            after=self._snapshot(broker),
            request=request,
        )
        self.db.commit()
        self.db.refresh(broker)
        return BrokerRegisterResult(
            broker=self._response(broker),
            my_store=self.my_store(user),
            auto_bound=auto_bound,
            qr_invalid_reason=qr_reason,
        )

    def update_me(
        self,
        user: User,
        req: BrokerUpdateRequest,
        *,
        request: Request | None = None,
    ) -> BrokerResponse:
        """经纪人修改姓名/手机号/备注（手机号需已在用户侧完成验证）."""
        broker = self._require_my_broker(user)
        before = self._snapshot(broker)
        if req.name is not None:
            broker.name = req.name.strip()
        if req.phone is not None:
            if not user.phone or req.phone != user.phone:
                msg = "手机号变更请先在“完善手机号码”流程完成验证"
                raise ValidationError(msg)
            broker.phone = req.phone
            broker.phone_hash = hash_phone(req.phone)
        if req.remark is not None:
            broker.remark = req.remark
        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            msg = "手机号已被其他经纪人使用"
            raise ConflictError(msg) from exc

        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="update",
            resource_type="merchant_broker",
            resource_id=str(broker.id),
            before=before,
            after=self._snapshot(broker),
            request=request,
        )
        self.db.commit()
        self.db.refresh(broker)
        return self._response(broker)

    def my_store(self, user: User) -> BrokerMyStoreResponse | None:
        """经纪人当前有效绑定门店（只读，不含内部跟进信息）."""
        broker = self.get_my_broker(user)
        if broker is None or not broker.store_id:
            return None
        store = self.db.query(MerchantStore).filter(MerchantStore.id == broker.store_id).first()
        if store is None or store.is_deleted:
            return None
        return broker_my_store(
            store,
            cooperation_label_map(self.db),
            bind_status=broker.bind_status,
            bound_at=broker.bound_at,
        )

    def bind_initial(
        self,
        user: User,
        req: BrokerBindRequest,
        *,
        request: Request | None = None,
    ) -> BrokerResponse:
        """首次绑定门店（免审直接生效，D3-A/Q22）."""
        broker = self._require_my_broker(user)
        store = self._selectable_store(req.store_id, allow_pending=False)
        if broker.store_id == store.id:
            return self._response(broker)
        if broker.store_id:
            msg = "经纪人已有有效绑定门店，请先解绑或申请换绑"
            raise ConflictError(msg)
        self._activate_binding(
            broker,
            store,
            bind_source=MerchantBindSource.MANUAL.value,
            inviter_employee_id=broker.inviter_employee_id,
            approved_by=None,
        )
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="bind",
            resource_type="merchant_broker_binding",
            resource_id=str(broker.id),
            before=None,
            after={"broker_id": str(broker.id), "store_id": str(store.id)},
            request=request,
        )
        self.db.commit()
        self.db.refresh(broker)
        return self._response(broker)

    def request_change(
        self,
        user: User,
        req: BrokerChangeRequest,
        *,
        request: Request | None = None,
    ) -> BrokerBindingResponse:
        """换绑申请（运营审核通过后生效，审核前原绑定持续有效）."""
        broker = self._require_my_broker(user)
        if not broker.store_id:
            msg = "当前没有绑定门店，请直接绑定"
            raise ValidationError(msg)
        if req.store_id == broker.store_id:
            msg = "新门店不能与原门店相同"
            raise ValidationError(msg)
        store = self._selectable_store(req.store_id, allow_pending=False)
        self._ensure_no_pending(broker.id)
        binding = MerchantBrokerBinding(
            broker_id=broker.id,
            store_id=store.id,
            status=MerchantBindingRecordStatus.PENDING.value,
            reason=req.reason.strip(),
            bind_source=MerchantBindSource.MANUAL.value,
            inviter_employee_id=broker.inviter_employee_id,
            store_name_snapshot=store.store_name,
        )
        self.db.add(binding)
        self.db.flush()
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="bind",
            resource_type="merchant_broker_binding",
            resource_id=str(binding.id),
            before=None,
            after={"broker_id": str(broker.id), "store_id": str(store.id), "request": "change"},
            request=request,
        )
        self.db.commit()
        self.db.refresh(binding)
        return broker_binding_response(binding)

    def request_unbind(
        self,
        user: User,
        req: BrokerUnbindRequest,
        *,
        request: Request | None = None,
    ) -> BrokerBindingResponse:
        """解绑申请（运营审核通过后生效）."""
        broker = self._require_my_broker(user)
        if not broker.store_id:
            msg = "当前没有绑定门店"
            raise ValidationError(msg)
        store = self.db.query(MerchantStore).filter(MerchantStore.id == broker.store_id).first()
        if store is None:
            msg = "绑定门店不存在"
            raise ResourceNotFoundError(msg)
        self._ensure_no_pending(broker.id)
        binding = MerchantBrokerBinding(
            broker_id=broker.id,
            store_id=store.id,
            status=MerchantBindingRecordStatus.PENDING.value,
            reason=req.reason.strip(),
            bind_source=broker.bind_source,
            inviter_employee_id=broker.inviter_employee_id,
            store_name_snapshot=store.store_name,
        )
        self.db.add(binding)
        self.db.flush()
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="unbind",
            resource_type="merchant_broker_binding",
            resource_id=str(binding.id),
            before=None,
            after={"broker_id": str(broker.id), "store_id": str(store.id), "request": "unbind"},
            request=request,
        )
        self.db.commit()
        self.db.refresh(binding)
        return broker_binding_response(binding)

    def list_pending_bindings(self) -> list[BrokerBindingResponse]:
        """后台待审核换绑/解绑申请列表."""
        rows = (
            self.db.query(MerchantBrokerBinding, MerchantBroker.name)
            .join(MerchantBroker, MerchantBroker.id == MerchantBrokerBinding.broker_id)
            .filter(MerchantBrokerBinding.status == MerchantBindingRecordStatus.PENDING.value)
            .order_by(MerchantBrokerBinding.applied_at.asc())
            .all()
        )
        return [broker_binding_response(row, broker_name=name) for row, name in rows]

    def get_admin(self, broker_id: str) -> BrokerResponse:
        """后台经纪人详情."""
        return self._response(self._get_broker(broker_id))

    def create_store_for_broker(
        self,
        user: User,
        req: MerchantStoreCreate,
        *,
        request: Request | None = None,
    ) -> tuple[MerchantStore, list[MerchantDuplicateCandidate]]:
        """经纪人注册时创建门店（review_status=pending），并自动绑定该门店."""
        broker = self._require_my_broker(user)
        from services.merchant.store import MerchantStoreService

        if req.owner_employee_id is None:
            req.owner_employee_id = broker.inviter_employee_id
        store, duplicates, _first_visit = MerchantStoreService(self.db).create(
            req,
            actor_id=str(user.id),
            source="broker",
            is_privileged=False,
            created_by_broker_id=str(broker.id),
            request=request,
        )
        if broker.store_id is None:
            self._activate_binding(
                broker,
                store,
                bind_source=MerchantBindSource.QRCODE.value,
                inviter_employee_id=broker.inviter_employee_id,
                approved_by=None,
            )
            self.db.commit()
        return store, duplicates

    def history(self, user: User) -> list[BrokerBindingResponse]:
        """经纪人绑定历史（按申请时间倒序）."""
        broker = self._require_my_broker(user)
        rows = (
            self.db.query(MerchantBrokerBinding)
            .filter(MerchantBrokerBinding.broker_id == broker.id)
            .order_by(MerchantBrokerBinding.applied_at.desc())
            .all()
        )
        return [broker_binding_response(row) for row in rows]

    # -------------------- 运营审批/后台 --------------------
    def approve_binding(
        self,
        binding_id: str,
        req: BindingApprovalRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BrokerBindingResponse:
        """审批换绑/解绑申请（通过后原绑定失效，历史保留）."""
        binding = self.db.query(MerchantBrokerBinding).filter(MerchantBrokerBinding.id == binding_id).first()
        if binding is None:
            msg = "绑定申请不存在"
            raise ResourceNotFoundError(msg)
        if binding.status != MerchantBindingRecordStatus.PENDING.value:
            msg = "该申请已处理"
            raise ConflictError(msg)
        broker = self.db.query(MerchantBroker).filter(MerchantBroker.id == binding.broker_id).first()
        if broker is None:
            msg = "经纪人不存在"
            raise ResourceNotFoundError(msg)

        binding.approved_at = _now()
        binding.approved_by = operator_id
        if not req.approve:
            binding.status = MerchantBindingRecordStatus.REJECTED.value
            binding.reason = f"{binding.reason or ''}；审核拒绝：{req.remark or ''}".strip("；")
            self.db.commit()
            self.db.refresh(binding)
            return broker_binding_response(binding)

        if broker.store_id == binding.store_id:
            self._unbind_current(broker, operator_id=operator_id)
            binding.status = MerchantBindingRecordStatus.UNBOUND.value
            binding.unbound_at = _now()
        else:
            store = self._selectable_store(binding.store_id, allow_pending=True)
            self._unbind_active_bindings(broker.id)
            binding.status = MerchantBindingRecordStatus.ACTIVE.value
            broker.store_id = store.id
            broker.bind_status = MerchantBindStatus.BOUND.value
            broker.bound_at = _now()
            broker.unbound_at = None
            broker.bind_source = binding.bind_source

        add_audit_log(
            self.db,
            user_id=operator_id,
            action="bind",
            resource_type="merchant_broker_binding",
            resource_id=str(binding.id),
            before=None,
            after={"broker_id": str(broker.id), "store_id": str(binding.store_id), "status": binding.status},
            request=request,
        )
        self.db.commit()
        self.db.refresh(binding)
        return broker_binding_response(binding)

    def list_admin(
        self,
        *,
        page: int,
        page_size: int,
        keyword: str | None = None,
        store_id: str | None = None,
        bind_status: str | None = None,
    ) -> BrokerListResponse:
        """后台经纪人列表（姓名/手机号哈希/门店/状态筛选）."""
        query = self.db.query(MerchantBroker)
        keyword = (keyword or "").strip()
        if keyword:
            conditions = [MerchantBroker.name.ilike(f"%{keyword}%")]
            if keyword.isdigit():
                conditions.append(MerchantBroker.phone_hash == hash_phone(keyword))
            query = query.filter(or_(*conditions))
        if store_id:
            query = query.filter(MerchantBroker.store_id == store_id)
        if bind_status:
            query = query.filter(MerchantBroker.bind_status == bind_status)

        total = query.count()
        rows = query.order_by(MerchantBroker.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        store_rows = {
            row.id: row.store_name
            for row in self.db.query(MerchantStore.id, MerchantStore.store_name)
            .filter(MerchantStore.id.in_([b.store_id for b in rows if b.store_id]))
            .all()
        }
        lead_counts = self._recommendation_counts([b.id for b in rows])
        return BrokerListResponse(
            items=[
                broker_list_item(
                    broker,
                    store_name=store_rows.get(broker.store_id) if broker.store_id else None,
                    recommendation_count=lead_counts.get(broker.id, 0),
                )
                for broker in rows
            ],
            total=total,
            page=page,
            page_size=page_size,
        )

    def create_admin(
        self,
        req: BrokerAdminCreate,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BrokerResponse:
        """后台新建经纪人（手机号加密 + phone_hash 唯一）."""
        phone_hash = hash_phone(req.phone)
        if self.db.query(MerchantBroker.id).filter(MerchantBroker.phone_hash == phone_hash).first():
            msg = "手机号已存在经纪人档案"
            raise ConflictError(msg)
        broker = MerchantBroker(
            user_id=None,
            name=req.name.strip(),
            phone=req.phone,
            phone_hash=phone_hash,
            bind_status=MerchantBindStatus.UNBOUND.value,
            source="backoffice",
            bind_source=MerchantBindSource.NONE.value,
            remark=req.remark,
        )
        self.db.add(broker)
        self.db.flush()
        if req.store_id:
            store = self._selectable_store(req.store_id, allow_pending=True)
            self._activate_binding(
                broker,
                store,
                bind_source=MerchantBindSource.BACKOFFICE.value,
                inviter_employee_id=None,
                approved_by=operator_id,
            )
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="merchant_broker",
            resource_id=str(broker.id),
            before=None,
            after=self._snapshot(broker),
            request=request,
        )
        self.db.commit()
        self.db.refresh(broker)
        return self._response(broker)

    def update_admin(
        self,
        broker_id: str,
        req: BrokerAdminUpdate,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BrokerResponse:
        """后台编辑经纪人姓名/手机号/备注."""
        broker = self._get_broker(broker_id)
        before = self._snapshot(broker)
        if req.name is not None:
            broker.name = req.name.strip()
        if req.phone is not None:
            new_hash = hash_phone(req.phone)
            existing = (
                self.db.query(MerchantBroker.id)
                .filter(MerchantBroker.phone_hash == new_hash, MerchantBroker.id != broker.id)
                .first()
            )
            if existing:
                msg = "手机号已被其他经纪人使用"
                raise ConflictError(msg)
            broker.phone = req.phone
            broker.phone_hash = new_hash
        if req.remark is not None:
            broker.remark = req.remark
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="merchant_broker",
            resource_id=str(broker.id),
            before=before,
            after=self._snapshot(broker),
            request=request,
        )
        self.db.commit()
        self.db.refresh(broker)
        return self._response(broker)

    def change_status_admin(
        self,
        broker_id: str,
        req: BrokerStatusChangeRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BrokerResponse:
        """后台停用/启用经纪人；停用时自动解绑当前门店（R-V07-03 建议口径）."""
        broker = self._get_broker(broker_id)
        before = self._snapshot(broker)
        if req.target_status == MerchantBindStatus.DISABLED.value:
            if broker.store_id:
                self._unbind_current(broker, operator_id=operator_id)
            broker.bind_status = MerchantBindStatus.DISABLED.value
        else:
            broker.bind_status = MerchantBindStatus.UNBOUND.value
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="disable" if req.target_status == MerchantBindStatus.DISABLED.value else "enable",
            resource_type="merchant_broker",
            resource_id=str(broker.id),
            before=before,
            after=self._snapshot(broker) | {"reason": req.reason},
            request=request,
        )
        self.db.commit()
        self.db.refresh(broker)
        return self._response(broker)

    def force_unbind(
        self,
        broker_id: str,
        reason: str,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> BrokerResponse:
        """后台强制解绑（保留历史，写审计）."""
        broker = self._get_broker(broker_id)
        if not broker.store_id:
            msg = "经纪人当前没有绑定门店"
            raise ValidationError(msg)
        before = self._snapshot(broker)
        self._unbind_current(broker, operator_id=operator_id, reason=reason)
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="unbind",
            resource_type="merchant_broker",
            resource_id=str(broker.id),
            before=before,
            after=self._snapshot(broker),
            request=request,
        )
        self.db.commit()
        self.db.refresh(broker)
        return self._response(broker)

    # -------------------- 对外只读接口 --------------------
    def list_store_brokers_for_user(self, user: User, store_id: str) -> list[BrokerResponse]:
        """线索录入门店→经纪人联动（校验门店数据范围）."""
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        from services.merchant.scope import ensure_store_visible

        ensure_store_visible(self.db, user, store)
        return [self._response(row) for row in self.effective_brokers_for_store(store_id)]

    def search_active_brokers(self, keyword: str, *, limit: int = 20) -> list[BrokerResponse]:
        """按姓名/手机号哈希搜索启用经纪人（未选门店时的线索归属入口）."""
        keyword = keyword.strip()
        if not keyword:
            return []
        conditions = [MerchantBroker.name.ilike(f"%{keyword}%")]
        if keyword.isdigit():
            conditions.append(MerchantBroker.phone_hash == hash_phone(keyword))
        rows = (
            self.db.query(MerchantBroker)
            .filter(
                or_(*conditions),
                MerchantBroker.bind_status != MerchantBindStatus.DISABLED.value,
            )
            .order_by(MerchantBroker.name.asc())
            .limit(limit)
            .all()
        )
        return [self._response(row) for row in rows]

    def effective_brokers_for_store(self, store_id: str) -> list[MerchantBroker]:
        """门店当前有效绑定且未停用的经纪人（V06/V07/V08 消费）."""
        return (
            self.db.query(MerchantBroker)
            .filter(
                MerchantBroker.store_id == store_id,
                MerchantBroker.bind_status == MerchantBindStatus.BOUND.value,
            )
            .order_by(MerchantBroker.name.asc())
            .all()
        )

    def effective_count_by_stores(self, store_ids: list[str]) -> dict[str, int]:
        """各门店有效经纪人数（仅 bound 且未停用）."""
        if not store_ids:
            return {}
        rows = (
            self.db.query(MerchantBroker.store_id, func.count(MerchantBroker.id))
            .filter(
                MerchantBroker.store_id.in_(store_ids),
                MerchantBroker.bind_status == MerchantBindStatus.BOUND.value,
            )
            .group_by(MerchantBroker.store_id)
            .all()
        )
        return {str(store_id): int(count) for store_id, count in rows}

    # -------------------- 内部辅助 --------------------
    def _get_broker(self, broker_id: str) -> MerchantBroker:
        broker = self.db.query(MerchantBroker).filter(MerchantBroker.id == broker_id).first()
        if broker is None:
            msg = "经纪人不存在"
            raise ResourceNotFoundError(msg)
        return broker

    def _response(self, broker: MerchantBroker) -> BrokerResponse:
        store_name = None
        if broker.store_id:
            store = self.db.query(MerchantStore).filter(MerchantStore.id == broker.store_id).first()
            store_name = store.store_name if store is not None else None
        return broker_response(broker, store_name=store_name)

    def _selectable_store(self, store_id: str, *, allow_pending: bool) -> MerchantStore:
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        if store.status != MerchantStoreStatus.NORMAL.value:
            msg = "门店已停用/已合并/已搬迁，不能绑定"
            raise ValidationError(msg)
        if not allow_pending and store.review_status != "approved":
            msg = "门店待审核，暂不可选择绑定"
            raise ValidationError(msg)
        return store

    def _activate_binding(
        self,
        broker: MerchantBroker,
        store: MerchantStore,
        *,
        bind_source: str,
        inviter_employee_id: str | None,
        approved_by: str | None,
    ) -> MerchantBrokerBinding:
        """将经纪人绑定到门店并写入已生效历史."""
        self._unbind_active_bindings(broker.id)
        binding = MerchantBrokerBinding(
            broker_id=broker.id,
            store_id=store.id,
            status=MerchantBindingRecordStatus.ACTIVE.value,
            applied_at=_now(),
            approved_at=_now(),
            approved_by=approved_by,
            bind_source=bind_source,
            inviter_employee_id=inviter_employee_id,
            store_name_snapshot=store.store_name,
        )
        self.db.add(binding)
        broker.store_id = store.id
        broker.bind_status = MerchantBindStatus.BOUND.value
        broker.bound_at = _now()
        broker.unbound_at = None
        broker.bind_source = bind_source
        return binding

    def _unbind_current(self, broker: MerchantBroker, *, operator_id: str, reason: str | None = None) -> None:
        """解除当前绑定（历史置已解绑）."""
        self._unbind_active_bindings(broker.id, reason=reason, operator_id=operator_id)
        broker.store_id = None
        broker.bind_status = MerchantBindStatus.UNBOUND_AFTER.value
        broker.unbound_at = _now()

    def _unbind_active_bindings(
        self,
        broker_id: str,
        *,
        reason: str | None = None,
        operator_id: str | None = None,
    ) -> None:
        rows = (
            self.db.query(MerchantBrokerBinding)
            .filter(
                MerchantBrokerBinding.broker_id == broker_id,
                MerchantBrokerBinding.status == MerchantBindingRecordStatus.ACTIVE.value,
            )
            .all()
        )
        for row in rows:
            row.status = MerchantBindingRecordStatus.UNBOUND.value
            row.unbound_at = _now()
            if reason:
                row.reason = reason
            if operator_id:
                row.approved_by = operator_id

    def _ensure_no_pending(self, broker_id: str) -> None:
        pending = (
            self.db.query(MerchantBrokerBinding.id)
            .filter(
                MerchantBrokerBinding.broker_id == broker_id,
                MerchantBrokerBinding.status == MerchantBindingRecordStatus.PENDING.value,
            )
            .first()
        )
        if pending:
            msg = "已有待审核的绑定申请，请等待运营处理"
            raise ConflictError(msg)

    def _match_recruit_lead(self, broker: MerchantBroker) -> None:
        """按 phone_hash 匹配招募线索（只读关联，N02）."""
        lead = (
            self.db.query(RecruitLead)
            .filter(RecruitLead.phone_hash == broker.phone_hash)
            .order_by(RecruitLead.created_at.desc())
            .first()
        )
        if lead is not None:
            broker.recruit_lead_id = str(lead.id)

    def _recommendation_counts(self, broker_ids: list[str]) -> dict[str, int]:
        """经纪人推荐线索数（V06 上线前返回 0）."""
        try:
            from models.lead import Lead
        except ImportError:
            return {}
        if not broker_ids:
            return {}
        has_column = hasattr(Lead, "broker_id")
        if not has_column:
            return {}
        rows = (
            self.db.query(Lead.broker_id, func.count(Lead.id))
            .filter(Lead.broker_id.in_(broker_ids), Lead.is_deleted.is_(False))
            .group_by(Lead.broker_id)
            .all()
        )
        return {str(broker_id): int(count) for broker_id, count in rows}

    @staticmethod
    def _snapshot(broker: MerchantBroker) -> dict:
        return {
            "user_id": str(broker.user_id) if broker.user_id else None,
            "name": broker.name,
            "phone": broker.phone,
            "store_id": str(broker.store_id) if broker.store_id else None,
            "bind_status": broker.bind_status,
            "source": broker.source,
            "inviter_employee_id": str(broker.inviter_employee_id) if broker.inviter_employee_id else None,
            "bind_source": broker.bind_source,
            "recruit_lead_id": str(broker.recruit_lead_id) if broker.recruit_lead_id else None,
            "remark": broker.remark,
        }


__all__ = ["MerchantBrokerService"]
