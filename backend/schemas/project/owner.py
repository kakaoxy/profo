"""项目业主相关Schema."""

from datetime import datetime

from pydantic import UUID4, AliasChoices, BaseModel, ConfigDict, Field


class OwnerBase(BaseModel):
    """业主基础字段."""

    owner_name: str | None = Field(None, max_length=100, description="业主姓名")
    owner_phone: str | None = Field(None, max_length=20, description="业主联系方式")
    owner_id_card: str | None = Field(None, max_length=18, description="业主身份证号")
    bank_name: str | None = Field(None, max_length=100, description="开户行")
    bank_card_number: str | None = Field(None, max_length=50, description="银行卡号")
    relation_type: str = Field(default="业主", description="关系类型")
    owner_info: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class OwnerCreate(OwnerBase):
    """创建业主请求."""

    project_id: UUID4 = Field(description="项目ID")


class OwnerUpdate(BaseModel):
    """更新业主请求."""

    owner_name: str | None = None
    owner_phone: str | None = None
    owner_id_card: str | None = None
    bank_name: str | None = None
    bank_card_number: str | None = None
    relation_type: str | None = None
    owner_info: str | None = None

    model_config = ConfigDict(from_attributes=True)


class OwnerResponse(OwnerBase):
    """业主响应."""

    id: UUID4 = Field(description="业主ID")
    project_id: UUID4 = Field(description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class OwnerListResponse(BaseModel):
    """业主列表响应."""

    items: list[OwnerResponse]
    total: int


class OwnerInlineCreate(BaseModel):
    """项目创建时内联的业主数据（不含 project_id）."""

    owner_name: str | None = Field(None, max_length=100, description="业主姓名")
    owner_phone: str | None = Field(None, max_length=20, description="业主联系方式")
    owner_id_card: str | None = Field(None, max_length=18, description="业主身份证号")
    bank_name: str | None = Field(None, max_length=100, description="开户行")
    bank_card_number: str | None = Field(None, max_length=50, description="银行卡号")
    relation_type: str | None = Field(None, description="关系类型")
    owner_info: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class OwnerInlineUpdate(BaseModel):
    """项目更新时内联的业主数据（含可选 id 用于 diff 同步）."""

    id: str | None = Field(None, description="业主ID（提供时更新对应记录，否则新增）")
    owner_name: str | None = Field(
        None,
        validation_alias=AliasChoices("owner_name", "ownerName"),
        max_length=100,
        description="业主姓名",
    )
    owner_phone: str | None = Field(
        None,
        validation_alias=AliasChoices("owner_phone", "ownerPhone"),
        max_length=20,
        description="业主联系方式",
    )
    owner_id_card: str | None = Field(
        None,
        validation_alias=AliasChoices("owner_id_card", "ownerIdCard"),
        max_length=18,
        description="业主身份证号",
    )
    bank_name: str | None = Field(
        None,
        validation_alias=AliasChoices("bank_name", "bankName"),
        max_length=100,
        description="开户行",
    )
    bank_card_number: str | None = Field(
        None,
        validation_alias=AliasChoices("bank_card_number", "bankCardNumber"),
        max_length=50,
        description="银行卡号",
    )
    relation_type: str | None = Field(
        None,
        validation_alias=AliasChoices("relation_type", "relationType"),
        description="关系类型",
    )
    owner_info: str | None = Field(
        None,
        validation_alias=AliasChoices("owner_info", "ownerInfo"),
        description="备注",
    )

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
