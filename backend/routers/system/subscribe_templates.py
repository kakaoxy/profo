"""小程序订阅消息模板 ID 配置路由.

仅管理员可读写（CurrentAdminUserDep，配置类操作与待办规则配置
「仅管理员可编辑」口径一致）。
"""

from fastapi import APIRouter

from dependencies.auth import CurrentAdminUserDep, DbSessionDep
from schemas.subscribe_template import (
    SubscribeTemplatesResponse,
    SubscribeTemplatesUpdateRequest,
)
from services.system import subscribe_templates

router = APIRouter(prefix="/subscribe-templates", tags=["system"])


@router.get("")
def get_subscribe_templates(
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> SubscribeTemplatesResponse:
    """读取三个订阅消息模板的 DB 配置值、env 兜底值与生效状态."""
    return subscribe_templates.get_subscribe_templates(db)


@router.put("")
def update_subscribe_templates(
    req: SubscribeTemplatesUpdateRequest,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> SubscribeTemplatesResponse:
    """全量保存三个模板 ID（strip 后落库，留空 = 清除 DB 值回退 env）."""
    return subscribe_templates.save_subscribe_templates(db, req, operator_id=str(current_user.id))
