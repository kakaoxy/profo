"""电子合作协议 Schemas（V05；REQ-IT5-03 起取消审核、新增商户签署视图）."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class AgreementTemplateCreate(BaseModel):
    """新建协议模板."""

    template_name: str = Field(min_length=1, max_length=200)
    cooperation_type: str = Field(min_length=1, max_length=50)
    content: str = Field(min_length=1, description="协议正文")
    version: str = Field(default="v1", max_length=50)


class AgreementTemplateUpdate(BaseModel):
    """编辑协议模板."""

    template_name: str | None = Field(default=None, min_length=1, max_length=200)
    cooperation_type: str | None = Field(default=None, min_length=1, max_length=50)
    content: str | None = Field(default=None, min_length=1)
    version: str | None = Field(default=None, max_length=50)
    status: Literal["enabled", "disabled"] | None = None


class AgreementTemplateResponse(BaseModel):
    """协议模板响应."""

    id: str
    template_name: str
    cooperation_type: str
    content: str
    version: str
    status: str
    created_at: datetime
    updated_at: datetime


class AgreementCreateRequest(BaseModel):
    """发起协议请求（门店主体或公司主体二选一）."""

    subject_type: Literal["store", "company"]
    store_id: str | None = Field(default=None, max_length=36)
    company_id: str | None = Field(default=None, max_length=36)
    template_id: str = Field(min_length=1, max_length=36)
    agreement_no: str | None = Field(default=None, max_length=100)
    signer_name: str = Field(min_length=1, max_length=50)
    signer_phone: str = Field(min_length=1, max_length=20)
    expire_at: datetime | None = None
    remark: str | None = Field(default=None, max_length=500)
    attachment_urls: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def _subject_required(self) -> "AgreementCreateRequest":
        if self.subject_type == "store" and not self.store_id:
            msg = "门店主体协议必须选择门店"
            raise ValueError(msg)
        if self.subject_type == "company" and not self.company_id:
            msg = "公司主体协议必须选择公司"
            raise ValueError(msg)
        return self

    @field_validator("signer_phone")
    @classmethod
    def _strip_phone(cls, value: str) -> str:
        return value.replace(" ", "").replace("-", "").strip()


class AgreementSignRequest(BaseModel):
    """手写签名提交请求（签名 PNG 由文件服务上传）."""

    signer_name: str = Field(min_length=1, max_length=50)
    signer_phone: str = Field(min_length=1, max_length=20)
    signature_url: str = Field(min_length=1, max_length=1000, description="签名图片地址")
    reason: str | None = Field(default=None, max_length=500, description="代签原因（签署人与联系人信息不一致时必填）")


class AgreementScanUploadRequest(BaseModel):
    """线下盖章扫描件上传请求."""

    file_url: str = Field(min_length=1, max_length=1000)
    signer_name: str = Field(min_length=1, max_length=50)
    signer_phone: str = Field(min_length=1, max_length=20)
    signed_at: datetime | None = None
    reason: str | None = Field(default=None, max_length=500, description="代签原因（签署人与联系人信息不一致时必填）")


class AgreementVoidRequest(BaseModel):
    """作废协议请求."""

    reason: str = Field(min_length=1, max_length=500)


class AgreementSupplementCreate(BaseModel):
    """新增补充协议（关联原协议）."""

    file_url: str | None = Field(default=None, max_length=1000, description="补充协议文件地址")
    remark: str = Field(min_length=1, max_length=500, description="补充说明")
    signer_name: str | None = Field(default=None, max_length=50)
    signer_phone: str | None = Field(default=None, max_length=20)


class AgreementResponse(BaseModel):
    """协议响应."""

    id: str
    store_id: str | None
    company_id: str | None
    subject_type: str
    subject_name: str | None
    agreement_no: str | None
    template_id: str | None
    template_name: str | None
    parent_agreement_id: str | None
    status: str
    sign_code: str | None = Field(default=None, description="商户签署分享码（员工侧拼分享链接用）")
    void_reason: str | None = None
    signer_name: str | None
    signer_phone_masked: str | None
    signed_at: datetime | None
    expire_at: datetime | None
    file_url: str | None
    attachment_urls: list[str]
    supplement_agreement_ids: list[str]
    remark: str | None
    created_at: datetime
    updated_at: datetime


class AgreementSignView(BaseModel):
    """商户签署视图（REQ-IT5-03：商户微信登录 + 分享码进入，仅展示核对信息）."""

    id: str
    agreement_no: str | None
    subject_type: str
    subject_name: str | None
    template_name: str | None
    content: str | None = Field(default=None, description="协议正文（格式条款，原样展示）")
    signer_name: str | None
    signer_phone_masked: str | None
    expire_at: datetime | None
    status: str
    status_label: str
    can_sign: bool
    reason: str | None = Field(default=None, description="不可签署的原因说明")


class AgreementMerchantSignRequest(BaseModel):
    """商户签署提交（手写签名图 + 确认信息）."""

    signer_name: str = Field(min_length=1, max_length=50)
    signer_phone: str = Field(min_length=1, max_length=20)
    signature_url: str = Field(min_length=1, max_length=1000, description="签名图片地址")
    confirmed: bool = Field(description="商户已核对协议与自身信息")

    @field_validator("signer_phone")
    @classmethod
    def _strip_phone(cls, value: str) -> str:
        return value.replace(" ", "").replace("-", "").strip()

    @model_validator(mode="after")
    def _must_confirm(self) -> "AgreementMerchantSignRequest":
        if not self.confirmed:
            msg = "请先核对协议内容与商户信息"
            raise ValueError(msg)
        return self


class AgreementListResponse(BaseModel):
    """协议分页列表."""

    items: list[AgreementResponse]
    total: int
    page: int
    page_size: int


class AgreementExpiringEvent(BaseModel):
    """协议到期提醒事件（V05 生产，V09 消费）."""

    agreement_id: str
    subject_type: str
    store_id: str | None
    company_id: str | None
    subject_name: str | None
    expire_at: datetime


__all__ = [
    "AgreementCreateRequest",
    "AgreementExpiringEvent",
    "AgreementListResponse",
    "AgreementMerchantSignRequest",
    "AgreementResponse",
    "AgreementScanUploadRequest",
    "AgreementSignRequest",
    "AgreementSignView",
    "AgreementSupplementCreate",
    "AgreementTemplateCreate",
    "AgreementTemplateResponse",
    "AgreementTemplateUpdate",
    "AgreementVoidRequest",
]
