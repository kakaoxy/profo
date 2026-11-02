"""电子合作协议服务（V05）：模板、发起、签署、归档、作废与到期事件.

REQ-IT5-03：取消审核环节——员工发起即进入待签署，商户用微信登录 + 分享码自助签署。
"""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import Request
from sqlalchemy import func
from sqlalchemy.orm import Session

from constants.merchant import MerchantBindStatus
from models.merchant import (
    MerchantAgreement,
    MerchantAgreementTemplate,
    MerchantBroker,
    MerchantCompany,
    MerchantStore,
)
from models.user.user import User
from schemas.merchant import (
    AgreementCreateRequest,
    AgreementExpiringEvent,
    AgreementListResponse,
    AgreementMerchantSignRequest,
    AgreementResponse,
    AgreementScanUploadRequest,
    AgreementSignRequest,
    AgreementSignView,
    AgreementSupplementCreate,
    AgreementTemplateCreate,
    AgreementTemplateResponse,
    AgreementTemplateUpdate,
    AgreementVoidRequest,
)
from services.merchant.agreement_pdf import generate_agreement_pdf
from services.merchant.audit import add_audit_log
from services.merchant.scope import ensure_scope_role, ensure_store_visible, store_scope_condition
from services.merchant.store import MerchantStoreService
from services.system.exceptions import (
    ConflictError,
    PermissionDeniedError,
    ResourceNotFoundError,
    ValidationError,
)
from utils.crypto import hash_phone
from utils.formatters import mask_phone

logger = logging.getLogger(__name__)

STATUS_NOT_INITIATED = "not_initiated"
STATUS_PENDING_SIGN = "pending_sign"
STATUS_SIGNED = "signed"
STATUS_EXPIRED = "expired"
STATUS_VOIDED = "voided"

STATUS_LABELS: dict[str, str] = {
    STATUS_NOT_INITIATED: "未发起",
    STATUS_PENDING_SIGN: "待签署",
    STATUS_SIGNED: "已签署",
    STATUS_EXPIRED: "已过期",
    STATUS_VOIDED: "已作废",
}


def _now() -> datetime:
    """带时区当前时间."""
    return datetime.now(timezone.utc)


class MerchantAgreementService:
    """电子协议服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # -------------------- 模板 --------------------
    def list_templates(self, *, include_disabled: bool = True) -> list[AgreementTemplateResponse]:
        """协议模板列表."""
        query = self.db.query(MerchantAgreementTemplate)
        if not include_disabled:
            query = query.filter(MerchantAgreementTemplate.status == "enabled")
        rows = query.order_by(MerchantAgreementTemplate.created_at.desc()).all()
        return [self._template_response(row) for row in rows]

    def create_template(
        self,
        req: AgreementTemplateCreate,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> AgreementTemplateResponse:
        """新建模板."""
        template = MerchantAgreementTemplate(
            template_name=req.template_name.strip(),
            cooperation_type=req.cooperation_type.strip(),
            content=req.content,
            version=req.version,
            status="enabled",
        )
        self.db.add(template)
        self.db.flush()
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="merchant_agreement_template",
            resource_id=str(template.id),
            before=None,
            after=self._template_snapshot(template),
            request=request,
        )
        self.db.commit()
        self.db.refresh(template)
        return self._template_response(template)

    def update_template(
        self,
        template_id: str,
        req: AgreementTemplateUpdate,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> AgreementTemplateResponse:
        """编辑模板；停用不影响已发起协议."""
        template = self._get_template(template_id)
        before = self._template_snapshot(template)
        for field in ("template_name", "cooperation_type", "content", "version", "status"):
            value = getattr(req, field)
            if value is not None:
                setattr(template, field, value)
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="merchant_agreement_template",
            resource_id=str(template.id),
            before=before,
            after=self._template_snapshot(template),
            request=request,
        )
        self.db.commit()
        self.db.refresh(template)
        return self._template_response(template)

    # -------------------- 发起/审核 --------------------
    def create(
        self,
        user: User,
        req: AgreementCreateRequest,
        *,
        request: Request | None = None,
    ) -> AgreementResponse:
        """发起协议：直接进入待签署并生成商户签署分享码（REQ-IT5-03，不再需要审核）."""
        privileged = ensure_scope_role(user)
        template = self._get_template(req.template_id)
        if template.status != "enabled":
            msg = "协议模板已停用"
            raise ValidationError(msg)

        store: MerchantStore | None = None
        company: MerchantCompany | None = None
        if req.subject_type == "store":
            store = self._get_store(req.store_id or "")
            ensure_store_visible(self.db, user, store)
            if store.status != "normal":
                msg = "门店已停用/已合并/已搬迁，不能发起协议"
                raise ValidationError(msg)
            self._validate_store_signer(
                req.signer_name,
                req.signer_phone,
                store=store,
                privileged=privileged,
            )
            subject_name = store.store_name
            company = (
                self.db.query(MerchantCompany)
                .filter(MerchantCompany.id == store.company_id, MerchantCompany.deleted_at.is_(None))
                .first()
            )
        else:
            if not privileged:
                msg = "仅管理员/运营可发起公司主体协议"
                raise PermissionDeniedError(msg)
            company = (
                self.db.query(MerchantCompany)
                .filter(MerchantCompany.id == req.company_id, MerchantCompany.deleted_at.is_(None))
                .with_for_update()
                .first()
            )
            if company is None:
                msg = "公司不存在"
                raise ResourceNotFoundError(msg)
            if company.status != "normal":
                msg = "公司已停用，不能发起协议"
                raise ValidationError(msg)
            self._validate_signer(
                req.signer_name,
                req.signer_phone,
                expected_name=company.contact_name,
                expected_phone=company.contact_phone,
                privileged=True,
            )
            subject_name = company.company_name

        if req.expire_at is not None and req.expire_at <= _now():
            msg = "到期时间必须晚于当前时间"
            raise ValidationError(msg)
        if req.agreement_no and self._agreement_no_exists(req.agreement_no):
            msg = "协议编号已存在"
            raise ConflictError(msg)

        agreement = MerchantAgreement(
            store_id=store.id if store is not None else None,
            # BR-M04-005：签约主体二选一——门店主体协议不得同时写 company_id
            company_id=company.id if req.subject_type == "company" and company is not None else None,
            subject_type=req.subject_type,
            agreement_no=req.agreement_no,
            template_id=template.id,
            status=STATUS_PENDING_SIGN,
            sign_code=str(uuid.uuid4()),
            signer_name=req.signer_name.strip(),
            signer_phone=req.signer_phone,
            expire_at=req.expire_at,
            attachment_urls=req.attachment_urls,
            supplement_agreement_ids=[],
            created_by_id=str(user.id),
            remark=req.remark,
        )
        self.db.add(agreement)
        self.db.flush()
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="create",
            resource_type="merchant_agreement",
            resource_id=str(agreement.id),
            before=None,
            after=self._snapshot(agreement) | {"subject_name": subject_name},
            request=request,
        )
        self.db.commit()
        self.db.refresh(agreement)
        return self._response(agreement, store=store, company=company, template_name=template.template_name)

    # -------------------- 签署/扫描件/作废 --------------------
    def sign(
        self,
        agreement_id: str,
        req: AgreementSignRequest,
        *,
        signer_id: str,
        privileged: bool = False,
        request: Request | None = None,
    ) -> AgreementResponse:
        """手写签名并生成 PDF；门店主体签署后联动“已合作”."""
        agreement = self._get_agreement(agreement_id)
        self._ensure_signable(agreement)
        self._validate_signer(
            req.signer_name,
            req.signer_phone,
            expected_name=agreement.signer_name,
            expected_phone=agreement.signer_phone,
            privileged=privileged,
            reason=req.reason,
            require_proxy_reason=True,
        )
        template = self._get_template(agreement.template_id or "")
        store, company = self._subject_entities(agreement)
        subject_name = (
            store.store_name if store is not None else (company.company_name if company is not None else None)
        )

        signed_at = _now()
        file_url = generate_agreement_pdf(
            agreement_id=str(agreement.id),
            title=template.template_name,
            content=template.content,
            signer_name=req.signer_name,
            signer_phone=req.signer_phone,
            signed_at=signed_at,
            signature_url=req.signature_url,
            subject_name=subject_name,
        )
        before = self._snapshot(agreement)
        agreement.signed_at = signed_at
        agreement.file_url = file_url
        agreement.status = STATUS_SIGNED
        self._link_store_cooperation(agreement, store, operator_id=signer_id, request=request)
        add_audit_log(
            self.db,
            user_id=signer_id,
            action="update",
            resource_type="merchant_agreement",
            resource_id=str(agreement.id),
            before=before,
            after=self._snapshot(agreement),
            request=request,
        )
        self.db.commit()
        self.db.refresh(agreement)
        return self._response(agreement)

    # -------------------- 商户自助签署（REQ-IT5-03） --------------------
    def merchant_sign_view(self, agreement_id: str, code: str) -> AgreementSignView:
        """商户打开分享链接后的核对视图（需商户微信登录后调用）."""
        agreement = self._get_by_sign_code(agreement_id, code)
        template = self._get_template(agreement.template_id or "") if agreement.template_id else None
        reason = self._unsignable_reason(agreement)
        return AgreementSignView(
            id=str(agreement.id),
            agreement_no=agreement.agreement_no,
            subject_type=agreement.subject_type,
            subject_name=self._subject_name(agreement),
            template_name=template.template_name if template is not None else None,
            content=template.content if template is not None else None,
            signer_name=agreement.signer_name,
            signer_phone_masked=mask_phone(agreement.signer_phone),
            expire_at=agreement.expire_at,
            status=agreement.status,
            status_label=STATUS_LABELS.get(agreement.status, agreement.status),
            can_sign=reason is None,
            reason=reason,
        )

    def merchant_sign(
        self,
        agreement_id: str,
        code: str,
        req: AgreementMerchantSignRequest,
        *,
        signer_user_id: str,
        request: Request | None = None,
    ) -> AgreementResponse:
        """商户自助签署：校验分享码 → 生成 PDF → 置已签署（门店主体联动已合作）."""
        agreement = self._get_by_sign_code(agreement_id, code)
        self._ensure_signable(agreement, allow_not_initiated=True)
        template = self._get_template(agreement.template_id or "") if agreement.template_id else None
        store, company = self._subject_entities(agreement)
        subject_name = (
            store.store_name if store is not None else (company.company_name if company is not None else None)
        )

        signed_at = _now()
        file_url = generate_agreement_pdf(
            agreement_id=str(agreement.id),
            title=template.template_name if template is not None else "合作协议",
            content=template.content if template is not None else "",
            signer_name=req.signer_name,
            signer_phone=req.signer_phone,
            signed_at=signed_at,
            signature_url=req.signature_url,
            subject_name=subject_name,
        )
        before = self._snapshot(agreement)
        agreement.signer_name = req.signer_name.strip()
        agreement.signer_phone = req.signer_phone
        agreement.signed_at = signed_at
        agreement.file_url = file_url
        agreement.status = STATUS_SIGNED
        self._link_store_cooperation(agreement, store, operator_id=signer_user_id, request=request)
        add_audit_log(
            self.db,
            user_id=signer_user_id,
            action="update",
            resource_type="merchant_agreement",
            resource_id=str(agreement.id),
            before=before,
            after=self._snapshot(agreement) | {"sign_channel": "merchant_self"},
            request=request,
        )
        self.db.commit()
        self.db.refresh(agreement)
        return self._response(agreement)

    def upload_scan(
        self,
        agreement_id: str,
        req: AgreementScanUploadRequest,
        *,
        operator_id: str,
        privileged: bool = True,
        request: Request | None = None,
    ) -> AgreementResponse:
        """上传线下盖章扫描件，协议置已签署."""
        agreement = self._get_agreement(agreement_id)
        self._ensure_signable(agreement, allow_not_initiated=True)
        self._validate_signer(
            req.signer_name,
            req.signer_phone,
            expected_name=agreement.signer_name,
            expected_phone=agreement.signer_phone,
            privileged=privileged,
            reason=req.reason,
            require_proxy_reason=True,
        )
        before = self._snapshot(agreement)
        agreement.file_url = req.file_url
        agreement.signed_at = req.signed_at or _now()
        agreement.status = STATUS_SIGNED
        store, _company = self._subject_entities(agreement)
        self._link_store_cooperation(agreement, store, operator_id=operator_id, request=request)
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="merchant_agreement",
            resource_id=str(agreement.id),
            before=before,
            after=self._snapshot(agreement) | ({"sign_reason": req.reason} if req.reason else {}),
            request=request,
        )
        self.db.commit()
        self.db.refresh(agreement)
        return self._response(agreement)

    def void(
        self,
        agreement_id: str,
        req: AgreementVoidRequest,
        *,
        operator_id: str,
        request: Request | None = None,
    ) -> AgreementResponse:
        """作废协议（保留文件与历史）."""
        agreement = self._get_agreement(agreement_id)
        if agreement.status == STATUS_VOIDED:
            msg = "协议已作废"
            raise ConflictError(msg)
        before = self._snapshot(agreement)
        agreement.status = STATUS_VOIDED
        agreement.void_reason = req.reason
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="merchant_agreement",
            resource_id=str(agreement.id),
            before=before,
            after=self._snapshot(agreement),
            request=request,
        )
        self.db.commit()
        self.db.refresh(agreement)
        return self._response(agreement)

    def add_supplement(
        self,
        user: User,
        parent_id: str,
        req: AgreementSupplementCreate,
        *,
        request: Request | None = None,
    ) -> AgreementResponse:
        """新增补充协议：独立记录并关联原协议."""
        parent = self._get_agreement(parent_id)
        if parent.status == STATUS_VOIDED:
            msg = "原协议已作废，不能新增补充协议"
            raise ValidationError(msg)
        if parent.company_id:
            company = (
                self.db.query(MerchantCompany)
                .filter(MerchantCompany.id == parent.company_id, MerchantCompany.deleted_at.is_(None))
                .with_for_update()
                .first()
            )
            if company is None:
                msg = "公司已删除，不能新增补充协议"
                raise ValidationError(msg)
        self._ensure_visible(user, parent)
        child = MerchantAgreement(
            store_id=parent.store_id,
            company_id=parent.company_id,
            subject_type=parent.subject_type,
            template_id=parent.template_id,
            parent_agreement_id=parent.id,
            status=STATUS_SIGNED if req.file_url else STATUS_PENDING_SIGN,
            sign_code=str(uuid.uuid4()),
            signer_name=req.signer_name or parent.signer_name,
            signer_phone=req.signer_phone or parent.signer_phone,
            file_url=req.file_url,
            remark=req.remark,
            created_by_id=str(user.id),
            attachment_urls=[],
            supplement_agreement_ids=[],
        )
        self.db.add(child)
        self.db.flush()
        ids = list(parent.supplement_agreement_ids or [])
        ids.append(str(child.id))
        parent.supplement_agreement_ids = ids
        add_audit_log(
            self.db,
            user_id=str(user.id),
            action="create",
            resource_type="merchant_agreement",
            resource_id=str(child.id),
            before=None,
            after=self._snapshot(child),
            request=request,
        )
        self.db.commit()
        self.db.refresh(child)
        return self._response(child)

    # -------------------- 查询 --------------------
    def search(
        self,
        user: User,
        *,
        page: int,
        page_size: int,
        store_id: str | None = None,
        company_id: str | None = None,
        status: str | None = None,
        agreement_no: str | None = None,
        expire_from: date | None = None,
        expire_to: date | None = None,
    ) -> AgreementListResponse:
        """协议分页列表（按门店数据范围过滤，公司主体仅 privileged 可见）."""
        privileged = ensure_scope_role(user)
        query = self.db.query(MerchantAgreement)
        if not privileged:
            scope = store_scope_condition(self.db, user)
            visible_ids = (
                [row.id for row in self.db.query(MerchantStore.id).filter(scope).all()] if scope is not None else []
            )
            query = query.filter(
                MerchantAgreement.store_id.in_(visible_ids),
                MerchantAgreement.subject_type == "store",
            )
        if store_id:
            query = query.filter(MerchantAgreement.store_id == store_id)
        if company_id:
            query = query.filter(MerchantAgreement.company_id == company_id)
        if status:
            query = query.filter(MerchantAgreement.status == status)
        if agreement_no:
            query = query.filter(MerchantAgreement.agreement_no.ilike(f"%{agreement_no}%"))
        if expire_from is not None:
            query = query.filter(func.date(MerchantAgreement.expire_at) >= expire_from)
        if expire_to is not None:
            query = query.filter(func.date(MerchantAgreement.expire_at) <= expire_to)

        total = query.count()
        # BR-M04-022：默认按签署时间倒序（未签署的按创建时间兜底）
        rows = (
            query.order_by(
                MerchantAgreement.signed_at.desc().nulls_last(),
                MerchantAgreement.created_at.desc(),
            )
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        return AgreementListResponse(
            items=[self._response(row) for row in rows],
            total=total,
            page=page,
            page_size=page_size,
        )

    def get(self, user: User, agreement_id: str) -> AgreementResponse:
        """协议详情（校验数据范围；待签署协议缺分享码时补齐，便于员工分享）."""
        agreement = self._get_agreement(agreement_id)
        self._ensure_visible(user, agreement)
        if agreement.sign_code is None and agreement.status == STATUS_PENDING_SIGN:
            agreement.sign_code = str(uuid.uuid4())
            self.db.commit()
            self.db.refresh(agreement)
        return self._response(agreement)

    # -------------------- 到期扫描（V09 事件源） --------------------
    def scan_expiring(self, *, days: int = 30, now: datetime | None = None) -> list[AgreementExpiringEvent]:
        """扫描已签署且距到期 ≤N 天的协议，返回提醒事件."""
        current = now or _now()
        deadline = current + timedelta(days=days)
        rows = (
            self.db.query(MerchantAgreement)
            .filter(
                MerchantAgreement.status == STATUS_SIGNED,
                MerchantAgreement.expire_at.isnot(None),
                MerchantAgreement.expire_at <= deadline,
                MerchantAgreement.expire_at > current,
            )
            .all()
        )
        return [
            AgreementExpiringEvent(
                agreement_id=str(row.id),
                subject_type=row.subject_type,
                store_id=str(row.store_id) if row.store_id else None,
                company_id=str(row.company_id) if row.company_id else None,
                subject_name=self._subject_name(row),
                expire_at=row.expire_at,
            )
            for row in rows
        ]

    def expire_due(self, *, now: datetime | None = None) -> int:
        """将已到期的已签署协议置为已过期，返回更新条数."""
        current = now or _now()
        rows = (
            self.db.query(MerchantAgreement)
            .filter(
                MerchantAgreement.status == STATUS_SIGNED,
                MerchantAgreement.expire_at.isnot(None),
                MerchantAgreement.expire_at <= current,
            )
            .all()
        )
        for row in rows:
            row.status = STATUS_EXPIRED
        if rows:
            self.db.commit()
        return len(rows)

    # -------------------- 内部辅助 --------------------
    def _get_template(self, template_id: str) -> MerchantAgreementTemplate:
        template = self.db.query(MerchantAgreementTemplate).filter(MerchantAgreementTemplate.id == template_id).first()
        if template is None:
            msg = "协议模板不存在"
            raise ResourceNotFoundError(msg)
        return template

    def _get_store(self, store_id: str) -> MerchantStore:
        store = self.db.query(MerchantStore).filter(MerchantStore.id == store_id).first()
        if store is None or store.is_deleted:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        return store

    def _get_agreement(self, agreement_id: str) -> MerchantAgreement:
        agreement = self.db.query(MerchantAgreement).filter(MerchantAgreement.id == agreement_id).first()
        if agreement is None:
            msg = "协议不存在"
            raise ResourceNotFoundError(msg)
        return agreement

    def _get_by_sign_code(self, agreement_id: str, code: str) -> MerchantAgreement:
        """按分享码取协议（分享码是唯一凭证，缺失即视为链接失效）."""
        agreement = self._get_agreement(agreement_id)
        if agreement.sign_code is None:
            # 不信任调用方传入的 code：历史行若缺分享码，只能由员工在后台详情获取（get 会补齐）
            msg = "签署链接无效或已失效"
            raise PermissionDeniedError(msg)
        if code != agreement.sign_code:
            msg = "签署链接无效或已失效"
            raise PermissionDeniedError(msg)
        return agreement

    def _unsignable_reason(self, agreement: MerchantAgreement) -> str | None:
        """返回不可签署的原因；None 表示可签."""
        if agreement.status == STATUS_VOIDED:
            return "协议已作废"
        if agreement.status == STATUS_SIGNED:
            return "协议已签署"
        if agreement.status == STATUS_EXPIRED:
            return "协议已过期"
        if agreement.expire_at is not None and agreement.expire_at <= _now():
            return "协议已到期"
        return None

    def _subject_entities(self, agreement: MerchantAgreement) -> tuple[MerchantStore | None, MerchantCompany | None]:
        store = None
        company = None
        if agreement.store_id:
            store = self.db.query(MerchantStore).filter(MerchantStore.id == agreement.store_id).first()
        if agreement.company_id:
            company = self.db.query(MerchantCompany).filter(MerchantCompany.id == agreement.company_id).first()
        return store, company

    def _subject_name(self, agreement: MerchantAgreement) -> str | None:
        store, company = self._subject_entities(agreement)
        if store is not None:
            return store.store_name
        if company is not None:
            return company.company_name
        return None

    def _ensure_visible(self, user: User, agreement: MerchantAgreement) -> None:
        if ensure_scope_role(user):
            return
        if agreement.subject_type != "store" or not agreement.store_id:
            msg = "无权查看该协议"
            raise PermissionDeniedError(msg)
        store = self.db.query(MerchantStore).filter(MerchantStore.id == agreement.store_id).first()
        if store is None:
            msg = "门店不存在"
            raise ResourceNotFoundError(msg)
        ensure_store_visible(self.db, user, store)

    def _ensure_signable(
        self,
        agreement: MerchantAgreement,
        *,
        allow_not_initiated: bool = False,
    ) -> None:
        if agreement.status == STATUS_VOIDED:
            msg = "协议已作废，不能签署"
            raise ValidationError(msg)
        if agreement.status in {STATUS_EXPIRED, STATUS_SIGNED}:
            msg = "协议已签署/已过期，不能重复签署"
            raise ConflictError(msg)
        if agreement.status == STATUS_NOT_INITIATED and not allow_not_initiated:
            msg = "协议未进入待签署状态"
            raise ValidationError(msg)
        if agreement.expire_at is not None and agreement.expire_at <= _now():
            msg = "协议已到期，不能签署"
            raise ValidationError(msg)

    def _validate_store_signer(
        self,
        signer_name: str,
        signer_phone: str,
        *,
        store: MerchantStore,
        privileged: bool,
    ) -> None:
        """门店主体签署人校验：门店联系人，或该门店当前有效绑定的经纪人（REQ-IT5-04）.

        员工发起协议时签署人来自门店经纪人下拉（REQ-IT5-04），因此除门店联系人外，
        还必须放行本店经纪人；其他任意姓名/手机号仍拒绝，避免员工冒名发起。
        """
        if not store.contact_name or not store.contact_phone:
            return
        name = signer_name.strip()
        phone = signer_phone.replace(" ", "").replace("-", "").strip()
        if name == store.contact_name.strip() and phone == store.contact_phone.replace(" ", "").replace("-", ""):
            return
        if privileged:
            return
        broker = (
            self.db.query(MerchantBroker.id)
            .filter(
                MerchantBroker.store_id == store.id,
                MerchantBroker.bind_status == MerchantBindStatus.BOUND.value,
                MerchantBroker.phone_hash == hash_phone(phone),
                MerchantBroker.name == name,
            )
            .first()
        )
        if broker is not None:
            return
        msg = "签署人必须为门店联系人或门店经纪人；如需代签请联系运营"
        raise ValidationError(msg)

    def _validate_signer(
        self,
        signer_name: str,
        signer_phone: str,
        *,
        expected_name: str | None,
        expected_phone: str | None,
        privileged: bool,
        reason: str | None = None,
        require_proxy_reason: bool = False,
    ) -> None:
        """签署人必须与主体联系人一致；运营代签须填写代签原因."""
        if not expected_name or not expected_phone:
            return
        name_ok = signer_name.strip() == expected_name.strip()
        phone_ok = signer_phone.replace(" ", "").replace("-", "") == expected_phone.replace(" ", "").replace("-", "")
        if name_ok and phone_ok:
            return
        if not privileged:
            msg = "签署人必须为门店/公司联系人；如需代签请联系运营"
            raise ValidationError(msg)
        if require_proxy_reason and not (reason or "").strip():
            msg = "代签必须填写代签原因"
            raise ValidationError(msg)

    def _link_store_cooperation(
        self,
        agreement: MerchantAgreement,
        store: MerchantStore | None,
        *,
        operator_id: str | None,
        request: Request | None,
    ) -> None:
        """门店主体协议签署后联动合作状态（公司主体不回写，R-V05-08）."""
        if store is None or agreement.subject_type != "store":
            return
        MerchantStoreService(self.db).set_cooperation_status_system(
            store,
            "cooperated",
            reason="电子合作协议签署完成",
            operator_id=operator_id,
            request=request,
        )

    def _agreement_no_exists(self, agreement_no: str) -> bool:
        return (
            self.db.query(MerchantAgreement.id).filter(MerchantAgreement.agreement_no == agreement_no).first()
            is not None
        )

    def _template_response(self, template: MerchantAgreementTemplate) -> AgreementTemplateResponse:
        return AgreementTemplateResponse(
            id=str(template.id),
            template_name=template.template_name,
            cooperation_type=template.cooperation_type,
            content=template.content,
            version=template.version,
            status=template.status,
            created_at=template.created_at,
            updated_at=template.updated_at,
        )

    def _response(
        self,
        agreement: MerchantAgreement,
        *,
        store: MerchantStore | None = None,
        company: MerchantCompany | None = None,
        template_name: str | None = None,
    ) -> AgreementResponse:
        if store is None and company is None:
            store, company = self._subject_entities(agreement)
        if template_name is None and agreement.template_id:
            template = (
                self.db.query(MerchantAgreementTemplate)
                .filter(MerchantAgreementTemplate.id == agreement.template_id)
                .first()
            )
            template_name = template.template_name if template is not None else None
        subject_name = (
            store.store_name if store is not None else (company.company_name if company is not None else None)
        )
        return AgreementResponse(
            id=str(agreement.id),
            store_id=str(agreement.store_id) if agreement.store_id else None,
            company_id=str(agreement.company_id) if agreement.company_id else None,
            subject_type=agreement.subject_type,
            subject_name=subject_name,
            agreement_no=agreement.agreement_no,
            template_id=str(agreement.template_id) if agreement.template_id else None,
            template_name=template_name,
            parent_agreement_id=str(agreement.parent_agreement_id) if agreement.parent_agreement_id else None,
            status=agreement.status,
            sign_code=agreement.sign_code,
            void_reason=agreement.void_reason,
            signer_name=agreement.signer_name,
            signer_phone_masked=mask_phone(agreement.signer_phone),
            signed_at=agreement.signed_at,
            expire_at=agreement.expire_at,
            file_url=agreement.file_url,
            attachment_urls=agreement.attachment_urls or [],
            supplement_agreement_ids=agreement.supplement_agreement_ids or [],
            remark=agreement.remark,
            created_at=agreement.created_at,
            updated_at=agreement.updated_at,
        )

    @staticmethod
    def _template_snapshot(template: MerchantAgreementTemplate) -> dict:
        return {
            "template_name": template.template_name,
            "cooperation_type": template.cooperation_type,
            "content": template.content,
            "version": template.version,
            "status": template.status,
        }

    @staticmethod
    def _snapshot(agreement: MerchantAgreement) -> dict:
        return {
            "store_id": str(agreement.store_id) if agreement.store_id else None,
            "company_id": str(agreement.company_id) if agreement.company_id else None,
            "subject_type": agreement.subject_type,
            "agreement_no": agreement.agreement_no,
            "template_id": str(agreement.template_id) if agreement.template_id else None,
            "status": agreement.status,
            "sign_code": agreement.sign_code,
            "void_reason": agreement.void_reason,
            "signer_name": agreement.signer_name,
            "signer_phone": agreement.signer_phone,
            "signed_at": agreement.signed_at.isoformat() if agreement.signed_at else None,
            "expire_at": agreement.expire_at.isoformat() if agreement.expire_at else None,
            "file_url": agreement.file_url,
            "remark": agreement.remark,
        }


__all__ = [
    "STATUS_EXPIRED",
    "STATUS_NOT_INITIATED",
    "STATUS_PENDING_SIGN",
    "STATUS_SIGNED",
    "STATUS_VOIDED",
    "MerchantAgreementService",
]
