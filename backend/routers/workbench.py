"""角色化工作台路由（迭代二 SPEC §6.2）.

权限设计：
- 读取自己的布局：后台身份即可（``CurrentBackendIdentityUserDep``）；
- 写入/重置自己的布局：后台身份，但 **user 角色返回 403**（D-07：设计稿对该角色
  隐藏「定制」入口，后端必须同样硬拦，否则只是前端藏入口）；
- 角色默认布局读写：``workbench:manage``（仅 admin，v97 种子）。
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from dependencies.auth import CurrentBackendIdentityUserDep, DbSessionDep, WorkbenchManagePermDep
from models import User
from schemas.workbench import (
    WorkbenchConfigResponse,
    WorkbenchLayoutUpdateRequest,
    WorkbenchRoleLayoutsResponse,
    WorkbenchRoleLayoutsUpdateRequest,
)
from services.system import workbench_layout
from services.system.exceptions import PermissionDeniedError, ResourceNotFoundError
from services.system.operation_log import operation_log_service
from settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/workbench", tags=["workbench"])


def _require_workbench_enabled() -> None:
    """`WORKBENCH_LAYOUT_ENABLED=false` → 404（SPEC 验收 A12 的回退逃生阀）.

    用 404 而非 403：前端 `getWorkbenchLayout` 把「取不到配置」统一视为降级
    信号 → 回落 LegacyDashboard（v0 单套仪表盘）。这让**后端 settings 成为
    开关的唯一事实源**——前端不再需要一个平行的 NEXT_PUBLIC_* 变量，
    避免两处配置漂移（配了一边没配另一边导致半开状态）。
    """
    if not settings.workbench_layout_enabled:
        msg = "角色工作台未启用"
        raise ResourceNotFoundError(msg)


def _require_customizable(current_user: CurrentBackendIdentityUserDep) -> User:
    """User 角色不可自定义布局（D-07）.

    Raises:
        PermissionDeniedError: 当前用户主角色为 user（403）。

    """
    role_code = current_user.role.code if current_user.role else None
    if role_code == "user":
        msg = "业务员角色不支持自定义工作台布局"
        raise PermissionDeniedError(msg)
    return current_user


# 可自定义布局的用户依赖（admin/operator）
WorkbenchCustomizableUserDep = Annotated[User, Depends(_require_customizable)]


@router.get("/config", summary="读取当前用户生效的工作台布局", dependencies=[Depends(_require_workbench_enabled)])
def get_config(
    db: DbSessionDep,
    current_user: CurrentBackendIdentityUserDep,
) -> WorkbenchConfigResponse:
    """三级 fallback + 权限过滤后的生效布局."""
    return WorkbenchConfigResponse(**workbench_layout.get_layout(db, current_user))


@router.put("/config", summary="保存个人工作台布局", dependencies=[Depends(_require_workbench_enabled)])
def update_config(
    req: WorkbenchLayoutUpdateRequest,
    db: DbSessionDep,
    current_user: WorkbenchCustomizableUserDep,
) -> WorkbenchConfigResponse:
    """保存个人覆盖布局（user 角色 403，D-07）."""
    result = workbench_layout.save_user_layout(
        db,
        current_user,
        [w.model_dump() for w in req.widgets],
    )
    return WorkbenchConfigResponse(**result)


@router.delete("/config", summary="重置为角色默认布局", dependencies=[Depends(_require_workbench_enabled)])
def reset_config(
    db: DbSessionDep,
    current_user: WorkbenchCustomizableUserDep,
) -> WorkbenchConfigResponse:
    """删除个人覆盖，回退角色默认（user 角色 403，D-07）."""
    return WorkbenchConfigResponse(**workbench_layout.reset_user_layout(db, current_user))


@router.get(
    "/role-layouts",
    summary="读取三角色默认布局（workbench:manage）",
    dependencies=[Depends(_require_workbench_enabled)],
)
def get_role_layouts(
    db: DbSessionDep,
    _current_user: WorkbenchManagePermDep,
) -> WorkbenchRoleLayoutsResponse:
    """管理端读取角色默认布局 + widget 注册表."""
    return WorkbenchRoleLayoutsResponse(**workbench_layout.get_role_layouts(db))


@router.put(
    "/role-layouts",
    summary="保存三角色默认布局（workbench:manage）",
    dependencies=[Depends(_require_workbench_enabled)],
)
def update_role_layouts(
    req: WorkbenchRoleLayoutsUpdateRequest,
    db: DbSessionDep,
    current_user: WorkbenchManagePermDep,
    request: Request,
) -> WorkbenchRoleLayoutsResponse:
    """保存角色默认布局并写审计日志."""
    result = workbench_layout.save_role_layouts(
        db,
        {role: [w.model_dump() for w in entries] for role, entries in req.roles.items()},
        operator_id=str(current_user.id),
    )
    # 审计：布局变更可追溯（SPEC §9.2）
    operation_log_service.log_action(
        db,
        user_id=str(current_user.id),
        action="workbench.role_layout.update",
        resource_type="workbench",
        after={"roles": {role: [w["key"] for w in entries] for role, entries in result["roles"].items()}},
        request=request,
    )
    return WorkbenchRoleLayoutsResponse(**result)


__all__ = ["router"]
