"""后台钥匙管理 Schema（管理密码/普通密码/审计日志）."""

from datetime import date, datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ManagerKeyResponse(BaseModel):
    """管理密码概要（不显密文）."""

    model_config = ConfigDict(from_attributes=True)

    set: bool
    updated_at: datetime | None = None
    updated_by_name: str | None = None


class NormalKeyCounts(BaseModel):
    """普通密码组状态计数."""

    active: int = 0
    pending: int = 0
    disabled: int = 0


class NormalKeyItem(BaseModel):
    """普通密码组条目（不显密文）."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    seq: int = 0  # 房源内稳定序号（创建时递增分配，删除其他组不影响）
    status: str
    effective_date: date | None = None
    confirmed_at: datetime | None = None
    disabled_at: datetime | None = None
    created_by_name: str | None = None
    created_at: datetime
    updated_at: datetime
    share_active: bool = False  # 是否被进行中分享引用
    share_count: int = 0  # 历史分享总次数（含已回收/已过期）
    last_shared_at: datetime | None = None  # 最近一次被分享时间


class GeneratedNormalKeyItem(NormalKeyItem):
    """生成结果条目（生成即揭示明文：业务流程=生成后在门锁逐组录入；生成日志已留痕）."""

    password: str


class KeysDetailResponse(BaseModel):
    """房源钥匙详情（管理密码 + 普通密码列表 + 计数）."""

    manager_key: ManagerKeyResponse
    normal_keys: list[NormalKeyItem]
    counts: NormalKeyCounts
    key_note: str | None = None  # 带看注意事项(房源级,实时展示于经纪人分享页)


class NormalKeyGenerateResponse(BaseModel):
    """系统随机生成/换一批响应：本次生成的待录入组（含明文） + 最新钥匙详情."""

    keys: list[GeneratedNormalKeyItem]
    detail: KeysDetailResponse


class KeySummaryResponse(BaseModel):
    """右栏钥匙管理卡三行概要（不显密文）."""

    manager_key: ManagerKeyResponse
    normal_active_count: int = 0
    normal_pending_count: int = 0
    normal_disabled_count: int = 0
    normal_updated_at: datetime | None = None
    normal_updated_by_name: str | None = None
    active_share_count: int = 0
    total_view_count: int = 0
    key_note: str | None = None  # 带看注意事项(admin 右栏钥匙管理卡展示行)


class ManagerKeyPutRequest(BaseModel):
    """管理密码录入/修改请求."""

    password: str = Field(min_length=1, max_length=50, description="管理密码明文")


class KeyNoteUpdateRequest(BaseModel):
    """带看注意事项录入/修改请求（空串表示清空）."""

    note: str = Field(default="", max_length=200, description="注意事项内容，≤200 字")


class KeyRevealResponse(BaseModel):
    """明文揭示响应（仅查看动作返回，触发留痕）."""

    password: str


class NormalKeyBatchCreateRequest(BaseModel):
    """普通密码手动批量录入请求（路径一：即录即生效）."""

    # 单条明文长度上限 50（与 EncryptedString(50) 及单条录入/修改同口径）：
    # 缺此约束时超长明文在 ORM 绑定期抛 ValueError，表现为 500「数据库错误」而非可读的 422
    passwords: list[Annotated[str, Field(max_length=50)]] = Field(
        min_length=1, max_length=20, description="密码明文列表"
    )
    effective_date: date | None = Field(None, description="生效日期，默认今日")


class NormalKeyGenerateRequest(BaseModel):
    """系统随机生成请求（路径二：生成即待录入）."""

    count: int = Field(ge=1, le=20, description="生成组数")


class NormalKeyRegenerateRequest(BaseModel):
    """换一批请求：替换未标记（待录入）组."""

    count: int | None = Field(None, ge=1, le=20, description="新组数，默认与被替换组数一致")


class NormalKeyBatchConfirmRequest(BaseModel):
    """批量标记已录入请求."""

    ids: list[UUID] = Field(min_length=1, max_length=50)


class NormalKeyUpdateRequest(BaseModel):
    """普通密码修改/停用请求."""

    password: str | None = Field(None, min_length=1, max_length=50)
    status: Literal["disabled"] | None = None  # 仅支持停用（单向）


class ShareReferencedItem(BaseModel):
    """引用被删密码组的进行中分享提示."""

    share_id: UUID
    token: str


class NormalKeyBatchDeleteResponse(BaseModel):
    """批量删除响应（含分享引用提示数据）."""

    deleted_count: int
    deleted_ids: list[UUID]
    share_referenced: list[ShareReferencedItem]


class KeyLogItem(BaseModel):
    """钥匙审计日志条目."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    action: str
    actor_type: str
    actor_id: str | None = None
    actor_name: str | None = None
    detail: dict | None = None


class KeyLogListResponse(BaseModel):
    """房源全量审计日志列表（倒序）."""

    items: list[KeyLogItem]
