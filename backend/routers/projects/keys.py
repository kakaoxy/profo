"""后台钥匙管理路由（/projects/{project_id}/keys…，aud=admin）.

Router 禁 ORM：权限过滤与留痕全部在 Service 层（KeyService.ensure_key_access）。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Request
from pydantic import UUID4

from dependencies.auth import CurrentInternalUserDep
from dependencies.keys import KeyServiceDep
from schemas.keys import (
    KeyLogListResponse,
    KeyNoteUpdateRequest,
    KeyRevealResponse,
    KeysDetailResponse,
    KeySummaryResponse,
    ManagerKeyPutRequest,
    NormalKeyBatchConfirmRequest,
    NormalKeyBatchCreateRequest,
    NormalKeyBatchDeleteResponse,
    NormalKeyGenerateRequest,
    NormalKeyGenerateResponse,
    NormalKeyRegenerateRequest,
    NormalKeyUpdateRequest,
)
from utils.common import RateLimits, limiter

router = APIRouter(tags=["project-keys"])


@router.get("/{project_id}/keys/summary")
def get_keys_summary(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeySummaryResponse:
    """右栏钥匙管理卡三行概要（不显密文）."""
    return service.get_summary(project_id, current_user)


@router.get("/{project_id}/keys")
def get_keys_detail(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeysDetailResponse:
    """房源钥匙详情（管理密码 + 普通密码列表 + 计数）."""
    return service.get_detail(project_id, current_user)


@router.put("/{project_id}/keys/manager")
def put_manager_key(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    data: ManagerKeyPutRequest,
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeysDetailResponse:
    """管理密码录入/修改（密文落库 + 留痕）."""
    service.put_manager_key(project_id, current_user, data)
    return service.get_detail(project_id, current_user)


@router.put("/{project_id}/keys/note")
def put_key_note(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    data: KeyNoteUpdateRequest,
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeysDetailResponse:
    """带看注意事项录入/修改（房源级，实时展示于经纪人分享页；空串清空）."""
    return service.put_key_note(project_id, current_user, data)


@router.post("/{project_id}/keys/manager/reveal")
@limiter.limit(RateLimits.KEY_REVEAL)
def reveal_manager_key(
    request: Request,
    project_id: Annotated[UUID4, Path(description="项目ID")],
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeyRevealResponse:
    """查看管理密码明文（解密 + 留痕）."""
    return service.reveal_manager_key(project_id, current_user)


@router.post("/{project_id}/keys/normal/batch")
def create_normal_batch(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    data: NormalKeyBatchCreateRequest,
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeysDetailResponse:
    """普通密码手动批量录入（即录即生效，生效日期默认今日）."""
    return service.create_normal_batch(project_id, current_user, data)


@router.post("/{project_id}/keys/normal/generate")
def generate_normal(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    data: NormalKeyGenerateRequest,
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> NormalKeyGenerateResponse:
    """系统随机生成 6 位数字（生成即落库「待录入」并返回明文，供门锁逐组录入）."""
    return service.generate_normal(project_id, current_user, data)


@router.post("/{project_id}/keys/normal/regenerate")
def regenerate_normal(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    data: NormalKeyRegenerateRequest,
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> NormalKeyGenerateResponse:
    """换一批：整批替换未标记（待录入）组为新生成组（返回明文）."""
    return service.regenerate_normal(project_id, current_user, data)


@router.post("/{project_id}/keys/normal/batch-confirm")
def batch_confirm_normal(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    data: NormalKeyBatchConfirmRequest,
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeysDetailResponse:
    """批量标记已录入（生效时间=标记日）."""
    return service.batch_confirm_normal(project_id, current_user, data)


@router.post("/{project_id}/keys/normal/batch-delete")
def batch_delete_normal(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    ids: list[UUID4],
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> NormalKeyBatchDeleteResponse:
    """批量删除（返回分享引用提示数据；删除后分享页该组显示「密码已失效」）.

    注意：字面路径必须声明在 POST /normal/{key_id} 参数路由之前，避免被遮蔽。
    """
    return service.batch_delete_normal(project_id, current_user, ids)


@router.post("/{project_id}/keys/normal/{key_id}/confirm")
def confirm_normal(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    key_id: Annotated[UUID4, Path(description="密码组ID")],
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeysDetailResponse:
    """单组标记已录入."""
    return service.confirm_normal(project_id, key_id, current_user)


@router.patch("/{project_id}/keys/normal/{key_id}")
@router.post("/{project_id}/keys/normal/{key_id}")
def update_normal(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    key_id: Annotated[UUID4, Path(description="密码组ID")],
    data: NormalKeyUpdateRequest,
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeysDetailResponse:
    """普通密码修改/停用.

    同时暴露 PATCH 与 POST：wx.request 对 PATCH 的真机兼容性存疑
    （开发者工具可用），小程序端用 POST 别名保证可用性。
    """
    return service.update_normal(project_id, key_id, current_user, data)


@router.post("/{project_id}/keys/normal/{key_id}/reveal")
@limiter.limit(RateLimits.KEY_REVEAL)
def reveal_normal_key(
    request: Request,
    project_id: Annotated[UUID4, Path(description="项目ID")],
    key_id: Annotated[UUID4, Path(description="密码组ID")],
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeyRevealResponse:
    """查看普通密码明文（解密 + 留痕）."""
    return service.reveal_normal(project_id, key_id, current_user)


@router.get("/{project_id}/keys/logs")
def get_keys_logs(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    service: KeyServiceDep,
    current_user: CurrentInternalUserDep,
) -> KeyLogListResponse:
    """房源全量审计日志（倒序）."""
    return service.get_logs(project_id, current_user)
