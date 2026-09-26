"""经纪人端（免登录/访客态）钥匙分享 Schema."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PublicKeyShareItem(BaseModel):
    """分享页房源条目（掩码，不返回密文/明文）."""

    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    project_name: str
    address: str
    key_id: UUID
    key_deleted: bool  # 密码组已删除或已停用 → 前端显示「密码已失效，请联系分享人」
    key_note: str | None = None  # 该房源的带看注意事项(实时读取，前端聚合展示于分享页中部)
    viewed: bool  # 当前登录经纪人是否已查看过明文
    last_viewed_at: datetime | None = None


class PublicKeyShareResponse(BaseModel):
    """免登录分享页响应.

    status=revoked 时为回收态（D2），不返回任何密码条目；
    is_expired 为派生的过期标记——过期后密码一律不可查看（reveal 拒绝），
    仅延长有效期可恢复；页内条目仍返回掩码列表供查看涉及房源。
    """

    status: str  # active | revoked
    is_expired: bool
    expires_at: datetime | None = None
    revoked_at: datetime | None = None
    sharer_name: str
    items_count: int
    viewed_by_me_count: int
    items: list[PublicKeyShareItem]


class PublicKeyShareRevealResponse(BaseModel):
    """经纪人查看明文响应（需 C 端登录，调用即留痕）."""

    key_id: UUID
    project_id: UUID
    project_name: str
    password: str
