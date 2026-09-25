"""小程序员工端钥匙分享路由（/keys…，aud=c）.

C 端令牌认证（CurrentCInternalUserDep 复核 admin/operator）；
权限过滤（ensure_key_access）与留痕在 Service 层。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query
from pydantic import UUID4

from dependencies.auth import CurrentCInternalUserDep
from dependencies.keys import KeyShareServiceDep
from schemas.keys import (
    KeyShareActionResponse,
    KeyShareCreatedResponse,
    KeyShareCreateRequest,
    KeyShareDetailResponse,
    KeyShareExtendRequest,
    KeyShareListResponse,
    KeysPropertiesResponse,
)

router = APIRouter(prefix="/keys", tags=["keys"])


@router.get("/properties")
def list_key_properties(
    current_user: CurrentCInternalUserDep,
    service: KeyShareServiceDep,
) -> KeysPropertiesResponse:
    """我可操作的房源 + 钥匙徽章聚合（不显密文）."""
    return service.list_my_properties(current_user)


@router.post("/shares")
def create_share(
    data: KeyShareCreateRequest,
    current_user: CurrentCInternalUserDep,
    service: KeyShareServiceDep,
) -> KeyShareCreatedResponse:
    """生成分享（默认有效期 1 天；仅可选「有效」普通密码组）."""
    return service.create_share(current_user, data)


@router.get("/shares")
def list_shares(
    current_user: CurrentCInternalUserDep,
    service: KeyShareServiceDep,
    status: Annotated[str | None, Query(description="状态过滤: active/expired/revoked")] = None,
) -> KeyShareListResponse:
    """我的分享记录列表（含已查看 n/m 聚合）."""
    return service.list_shares(current_user, status)


@router.get("/shares/{share_id}")
def get_share_detail(
    share_id: Annotated[UUID4, Path(description="分享ID")],
    current_user: CurrentCInternalUserDep,
    service: KeyShareServiceDep,
) -> KeyShareDetailResponse:
    """分享详情（逐房源查看进度 + 查看记录时间线）."""
    return service.get_share_detail(current_user, share_id)


@router.post("/shares/{share_id}/revoke")
def revoke_share(
    share_id: Annotated[UUID4, Path(description="分享ID")],
    current_user: CurrentCInternalUserDep,
    service: KeyShareServiceDep,
) -> KeyShareActionResponse:
    """回收分享（硬失效）."""
    return service.revoke_share(current_user, share_id)


@router.post("/shares/{share_id}/extend")
def extend_share(
    share_id: Annotated[UUID4, Path(description="分享ID")],
    data: KeyShareExtendRequest,
    current_user: CurrentCInternalUserDep,
    service: KeyShareServiceDep,
) -> KeyShareActionResponse:
    """延长分享有效期."""
    return service.extend_share(current_user, share_id, data)
