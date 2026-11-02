"""商户（公司）服务（V02 REQ-M01A-001/002）."""

from datetime import datetime, timezone

from fastapi import Request
from sqlalchemy.orm import Session

from constants.merchant import MerchantCompanyStatus
from models.merchant import MerchantCompany
from schemas.merchant import (
    MerchantCompanyCreate,
    MerchantCompanyDeleteRequest,
    MerchantCompanyListResponse,
    MerchantCompanyUpdate,
)
from services.merchant.audit import add_audit_log
from services.merchant.serializers import company_response
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError


class MerchantCompanyService:
    """公司主数据服务."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get(self, company_id: str, *, include_disabled: bool = True) -> MerchantCompany:
        """按 ID 取公司（已软删的按不存在处理）."""
        company = (
            self.db.query(MerchantCompany)
            .filter(MerchantCompany.id == company_id, MerchantCompany.deleted_at.is_(None))
            .first()
        )
        if company is None:
            msg = "公司不存在"
            raise ResourceNotFoundError(msg)
        if not include_disabled and company.status != MerchantCompanyStatus.NORMAL.value:
            msg = "公司已停用"
            raise ValidationError(msg)
        return company

    def search(
        self,
        keyword: str | None,
        *,
        include_disabled: bool = False,
        limit: int = 20,
    ) -> MerchantCompanyListResponse:
        """按名称搜索公司；空关键词不发起全量查询（REQ-M01A-002 分支 3）."""
        keyword = (keyword or "").strip()
        if not keyword:
            return MerchantCompanyListResponse(items=[], total=0)

        query = self.db.query(MerchantCompany).filter(
            MerchantCompany.company_name.ilike(f"%{keyword}%"), MerchantCompany.deleted_at.is_(None)
        )
        if not include_disabled:
            query = query.filter(MerchantCompany.status == MerchantCompanyStatus.NORMAL.value)
        total = query.count()
        companies = query.order_by(MerchantCompany.created_at.desc()).limit(limit).all()
        return MerchantCompanyListResponse(items=[company_response(c) for c in companies], total=total)

    def paginate(
        self,
        keyword: str | None,
        *,
        include_disabled: bool = False,
        page: int = 1,
        page_size: int = 20,
    ) -> MerchantCompanyListResponse:
        """管理端公司分页列表（REQ-IT1-05）：keyword 为空返回全部，按创建时间倒序."""
        keyword = (keyword or "").strip()
        query = self.db.query(MerchantCompany).filter(MerchantCompany.deleted_at.is_(None))
        if keyword:
            query = query.filter(MerchantCompany.company_name.ilike(f"%{keyword}%"))
        if not include_disabled:
            query = query.filter(MerchantCompany.status == MerchantCompanyStatus.NORMAL.value)
        total = query.count()
        page = max(page, 1)
        companies = (
            query.order_by(MerchantCompany.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
        )
        return MerchantCompanyListResponse(
            items=[company_response(c) for c in companies],
            total=total,
            page=page,
            page_size=page_size,
        )

    def list_all(self, *, include_disabled: bool = True, limit: int = 100) -> list[MerchantCompany]:
        """管理端公司列表（下拉选项用）."""
        query = self.db.query(MerchantCompany).filter(MerchantCompany.deleted_at.is_(None))
        if not include_disabled:
            query = query.filter(MerchantCompany.status == MerchantCompanyStatus.NORMAL.value)
        return query.order_by(MerchantCompany.company_name.asc()).limit(limit).all()

    def create(
        self,
        req: MerchantCompanyCreate,
        *,
        operator_id: str | None,
        request: Request | None = None,
    ) -> MerchantCompany:
        """创建公司（同名只提示不阻断，R-V02-02 待确认前按允许同名实现）."""
        name = req.company_name.strip()
        if not name:
            msg = "公司名称不能为空"
            raise ValidationError(msg)

        company = MerchantCompany(
            company_name=name,
            status=MerchantCompanyStatus.NORMAL.value,
            contact_name=req.contact_name,
            contact_phone=req.contact_phone,
            remark=req.remark,
        )
        self.db.add(company)
        self.db.flush()

        add_audit_log(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="merchant_company",
            resource_id=str(company.id),
            before=None,
            after=self._snapshot(company),
            request=request,
        )
        self.db.commit()
        self.db.refresh(company)
        return company

    def update(
        self,
        company_id: str,
        req: MerchantCompanyUpdate,
        *,
        operator_id: str | None,
        request: Request | None = None,
    ) -> MerchantCompany:
        """更新公司；停用后不可再被新建门店选择（BR-M01A-003）."""
        company = self.get(company_id)
        before = self._snapshot(company)
        updated = False

        if req.company_name is not None:
            name = req.company_name.strip()
            if not name:
                msg = "公司名称不能为空"
                raise ValidationError(msg)
            if name != company.company_name:
                company.company_name = name
                self._sync_store_company_name(company.id, name)
                updated = True
        if req.status is not None and req.status != company.status:
            company.status = req.status
            updated = True
        if req.contact_name is not None:
            company.contact_name = req.contact_name
            updated = True
        if req.contact_phone is not None:
            company.contact_phone = req.contact_phone
            updated = True
        if req.remark is not None:
            company.remark = req.remark
            updated = True

        if not updated:
            msg = "没有需要更新的字段"
            raise ConflictError(msg)

        add_audit_log(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="merchant_company",
            resource_id=str(company.id),
            before=before,
            after=self._snapshot(company),
            request=request,
        )
        self.db.commit()
        self.db.refresh(company)
        return company

    def soft_delete(
        self,
        company_id: str,
        req: MerchantCompanyDeleteRequest,
        *,
        operator_id: str | None,
        request: Request | None = None,
    ) -> None:
        """公司软删除（REQ-IT7-02）.

        公司下有未删除门店时拒绝删除，避免门店指向已删公司；重复删除幂等。
        """
        from models.merchant import MerchantStore

        company = self.db.query(MerchantCompany).filter(MerchantCompany.id == company_id).first()
        if company is None:
            msg = "公司不存在"
            raise ResourceNotFoundError(msg)
        if company.deleted_at is not None:
            return
        store_count = (
            self.db.query(MerchantStore.id)
            .filter(MerchantStore.company_id == company.id, MerchantStore.is_deleted.is_(False))
            .count()
        )
        if store_count > 0:
            msg = f"公司下仍有 {store_count} 家门店，不能删除，请先处理门店或改用停用"
            raise ConflictError(msg)

        before = self._snapshot(company)
        company.deleted_at = datetime.now(timezone.utc)
        company.deleted_by = operator_id
        add_audit_log(
            self.db,
            user_id=operator_id,
            action="delete",
            resource_type="merchant_company",
            resource_id=str(company.id),
            # 与门店删除一致：删除后不存在「新状态」，原因并入 before
            before=before | {"delete_reason": req.reason},
            after=None,
            request=request,
        )
        self.db.commit()

    def _sync_store_company_name(self, company_id: str, company_name: str) -> None:
        """公司改名后同步门店冗余 company_name（BR-M01B-013）."""
        from models.merchant import MerchantStore

        self.db.query(MerchantStore).filter(MerchantStore.company_id == company_id).update(
            {MerchantStore.company_name: company_name},
            synchronize_session=False,
        )

    @staticmethod
    def _snapshot(company: MerchantCompany) -> dict:
        return {
            "company_name": company.company_name,
            "status": company.status,
            "contact_name": company.contact_name,
            "contact_phone": company.contact_phone,
            "remark": company.remark,
        }


__all__ = ["MerchantCompanyService"]
