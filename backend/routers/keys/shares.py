"""小程序员工端钥匙分享路由（/keys…，aud=c）.

C 端令牌认证（CurrentCEmployeeUserDep 复核后台身份：admin/operator/user 任一）；
产品口径（2026-10-09）：钥匙管理对所有有权限的人开放，细粒度权限过滤
（admin 全量 / 相关人五字段匹配）与留痕在 Service 层（ensure_key_access）。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query
from pydantic import UUID4

from dependencies.auth import CurrentCEmployeeUserDep
from dependencies.keys import KeyShareServiceDep, KeySummaryServiceDep
from schemas.keys import (
    KeyShareActionResponse,
    KeyShareCreatedResponse,
    KeyShareCreateRequest,
    KeyShareDetailResponse,
    KeyShareExtendRequest,
    KeyShareListResponse,
    KeysPropertiesResponse,
    KeysSummaryResponse,
)

router = APIRouter(prefix="/keys", tags=["keys"])


@router.get("/properties")
def list_key_properties(
    current_user: CurrentCEmployeeUserDep,
    service: KeyShareServiceDep,
) -> KeysPropertiesResponse:
    """我可操作的房源 + 钥匙徽章聚合（不显密文）."""
    return service.list_my_properties(current_user)


@router.get("/summary")
def get_keys_summary(
    current_user: CurrentCEmployeeUserDep,
    service: KeySummaryServiceDep,
) -> KeysSummaryResponse:
    """指标 hero 区三指标聚合（总量 + 周二周期新增，设计稿 docs/2026-10-10）.

    字面路径 /summary 必须声明在 /shares/{share_id} 之前，避免被参数路由遮蔽。
    """
    return service.get_summary(current_user)


@router.post("/shares")
def create_share(
    data: KeyShareCreateRequest,
    current_user: CurrentCEmployeeUserDep,
    service: KeyShareServiceDep,
) -> KeyShareCreatedResponse:
    """生成分享（默认有效期 1 天；仅可选「有效」普通密码组）."""
    return service.create_share(current_user, data)


@router.get("/shares")
def list_shares(
    current_user: CurrentCEmployeeUserDep,
    service: KeyShareServiceDep,
    status: Annotated[str | None, Query(description="状态过滤: active/expired/revoked")] = None,
) -> KeyShareListResponse:
    """我的分享记录列表（含已查看 n/m 聚合）."""
    return service.list_shares(current_user, status)


@router.get("/shares/{share_id}")
def get_share_detail(
    share_id: Annotated[UUID4, Path(description="分享ID")],
    current_user: CurrentCEmployeeUserDep,
    service: KeyShareServiceDep,
) -> KeyShareDetailResponse:
    """分享详情（逐房源查看进度 + 查看记录时间线）."""
    return service.get_share_detail(current_user, share_id)


@router.post("/shares/{share_id}/revoke")
def revoke_share(
    share_id: Annotated[UUID4, Path(description="分享ID")],
    current_user: CurrentCEmployeeUserDep,
    service: KeyShareServiceDep,
) -> KeyShareActionResponse:
    """回收分享（硬失效）."""
    return service.revoke_share(current_user, share_id)


@router.post("/shares/{share_id}/extend")
def extend_share(
    share_id: Annotated[UUID4, Path(description="分享ID")],
    data: KeyShareExtendRequest,
    current_user: CurrentCEmployeeUserDep,
    service: KeyShareServiceDep,
) -> KeyShareActionResponse:
    """延长分享有效期."""
    return service.extend_share(current_user, share_id, data)
