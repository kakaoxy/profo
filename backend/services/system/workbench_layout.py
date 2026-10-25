"""工作台布局服务（迭代二 SPEC §6.2 / K11–K16）.

**三级 fallback**（K11）：用户覆盖（``user_preferences`` ns=``workbench.layout``）
→ 角色默认（``system_configs`` key = ``workbench_role_layouts``）→ 代码兜底
（``WORKBENCH_ROLE_DEFAULTS``）。三级都要过**权限过滤**（K15）。

**容错**（K12/K16）：缺行、JSON 损坏、未知 widget key 一律降级而非报错——
读取路径永远可用（照抄 ``services/projects/todo_board_config.py`` 的范式）。
"""

import json
import logging
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Role, SystemConfig, User, UserPreference
from models.user.preference import NAMESPACE_WORKBENCH_LAYOUT
from services.system.permission import permission_service
from services.system.workbench_registry import (
    WORKBENCH_ROLE_DEFAULTS,
    WORKBENCH_WIDGETS,
    WidgetSpec,
)
from settings import settings

logger = logging.getLogger(__name__)

# 布局条目只允许这三个字段（K14：不存 span）
_ENTRY_FIELDS: tuple[str, ...] = ("key", "order", "enabled")

# order 间隔（K14）
_ORDER_STEP = 10


def _role_code_of(db: Session, user: User) -> str:
    """当前用户的主角色 code（非内置角色回退 user，保证布局永不空）."""
    if user.role_id is None:
        return "user"
    code = db.query(Role.code).filter(Role.id == user.role_id).scalar()
    if code in WORKBENCH_ROLE_DEFAULTS:
        return code
    return "user"


def _sanitize_entries(raw: Any) -> list[dict[str, Any]]:
    """把任意输入收敛为合法条目列表（丢弃未知 key 与非法字段，K16）."""
    if not isinstance(raw, list):
        return []
    entries: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in raw:
        if not isinstance(item, dict):
            continue
        key = item.get("key")
        if not isinstance(key, str) or key not in WORKBENCH_WIDGETS:
            if isinstance(key, str) and key:
                logger.warning("工作台布局含未注册 widget key，已丢弃：%s", key)
            continue
        if key in seen:
            continue
        seen.add(key)
        order = item.get("order")
        if not isinstance(order, int) or isinstance(order, bool):
            order = _ORDER_STEP * (len(entries) + 1)
        entries.append(
            {
                "key": key,
                "order": order,
                "enabled": bool(item.get("enabled", True)),
            }
        )
    entries.sort(key=lambda e: (e["order"], e["key"]))
    return entries


def _default_entries(role_code: str) -> list[dict[str, Any]]:
    """代码兜底布局（第三级）."""
    keys = WORKBENCH_ROLE_DEFAULTS.get(role_code, WORKBENCH_ROLE_DEFAULTS["user"])
    return [{"key": key, "order": _ORDER_STEP * (idx + 1), "enabled": True} for idx, key in enumerate(keys)]


def _role_entries_from_config(db: Session, role_code: str) -> list[dict[str, Any]] | None:
    """从 system_configs 读角色默认布局（第二级）；缺行/损坏返回 None."""
    row = db.query(SystemConfig).filter(SystemConfig.key == settings.workbench_role_layouts_key).first()
    if row is None or not row.value:
        return None
    try:
        payload = json.loads(row.value)
    except (TypeError, ValueError):
        logger.warning("工作台角色布局配置 JSON 损坏，回退代码兜底")
        return None
    if not isinstance(payload, dict):
        return None
    roles = payload.get("roles")
    if not isinstance(roles, dict):
        return None
    raw = roles.get(role_code)
    if raw is None:
        return None
    entries = _sanitize_entries(raw)
    return entries or None


def _user_entries(db: Session, user_id: str) -> list[dict[str, Any]] | None:
    """读用户覆盖布局（第一级）；缺行/损坏返回 None."""
    row = (
        db.query(UserPreference)
        .filter(
            UserPreference.user_id == user_id,
            UserPreference.namespace == NAMESPACE_WORKBENCH_LAYOUT,
        )
        .first()
    )
    if row is None or not isinstance(row.value, dict):
        return None
    entries = _sanitize_entries(row.value.get("widgets"))
    return entries or None


def _filter_by_permission(
    db: Session,
    user: User,
    entries: list[dict[str, Any]],
    role_code: str,
) -> list[dict[str, Any]]:
    """剔除无权 / 非本角色可见的 widget（K15 + 设计稿矩阵）.

    判定 = ``permission`` **与** ``roles`` 都满足才保留：
    - ``permission``：用户是否持有该权限码（布局不能授予权限）；
    - ``roles``：该 widget 是否属于当前角色视角（``user`` 恰好持有 ``ledger:read``，
      只靠权限码会让业务员看到「资金概览」，与设计稿矩阵冲突，见注册表 docstring）。

    无权条目**整条剔除**（不保留 ``enabled=false``），避免前端出现越权暗示。
    """
    codes = permission_service.get_user_permission_codes(db, user)
    result: list[dict[str, Any]] = []
    for entry in entries:
        spec = WORKBENCH_WIDGETS.get(entry["key"])
        if spec is None:
            continue
        if spec.permission and spec.permission not in codes:
            logger.debug("用户 %s 无权 widget %s，已剔除", user.id, entry["key"])
            continue
        if role_code not in spec.roles:
            logger.debug("widget %s 不属于角色 %s 视角，已剔除", entry["key"], role_code)
            continue
        result.append(entry)
    return result


def get_layout(db: Session, user: User) -> dict[str, Any]:
    """读取当前用户生效的工作台布局.

    Args:
        db: 数据库会话
        user: 当前用户

    Returns:
        ``{"source": "user"|"role"|"fallback", "widgets": [{key, order, enabled}]}``

    """
    role_code = _role_code_of(db, user)

    source = "fallback"
    entries = _user_entries(db, user.id)
    if entries is not None:
        source = "user"
    else:
        entries = _role_entries_from_config(db, role_code)
        if entries is not None:
            source = "role"
        else:
            entries = _default_entries(role_code)

    return {"source": source, "widgets": _filter_by_permission(db, user, entries, role_code)}


def save_user_layout(db: Session, user: User, widgets: list[dict[str, Any]]) -> dict[str, Any]:
    """保存用户个人布局（K13）.

    Args:
        db: 数据库会话
        user: 当前用户
        widgets: 前端提交的条目（key/order/enabled 可缺省）

    Returns:
        保存后的生效布局（``source="user"``）。

    """
    entries = _sanitize_entries(widgets)
    payload = {"version": 1, "widgets": entries}
    row = (
        db.query(UserPreference)
        .filter(
            UserPreference.user_id == user.id,
            UserPreference.namespace == NAMESPACE_WORKBENCH_LAYOUT,
        )
        .first()
    )
    try:
        if row is None:
            db.add(UserPreference(user_id=user.id, namespace=NAMESPACE_WORKBENCH_LAYOUT, value=payload))
        else:
            row.value = payload
        db.commit()
    except IntegrityError:
        # 并发首写：唯一约束兜底，回滚后改更新
        db.rollback()
        row = (
            db.query(UserPreference)
            .filter(
                UserPreference.user_id == user.id,
                UserPreference.namespace == NAMESPACE_WORKBENCH_LAYOUT,
            )
            .first()
        )
        if row is None:
            raise
        row.value = payload
        db.commit()

    return get_layout(db, user)


def reset_user_layout(db: Session, user: User) -> dict[str, Any]:
    """重置为角色默认（删除用户覆盖）."""
    deleted = (
        db.query(UserPreference)
        .filter(
            UserPreference.user_id == user.id,
            UserPreference.namespace == NAMESPACE_WORKBENCH_LAYOUT,
        )
        .delete(synchronize_session=False)
    )
    if deleted:
        db.commit()
    return get_layout(db, user)


def get_role_layouts(db: Session) -> dict[str, Any]:
    """读取三角色默认布局 + widget 注册表（管理端用）."""
    row = db.query(SystemConfig).filter(SystemConfig.key == settings.workbench_role_layouts_key).first()
    stored: dict[str, Any] = {}
    if row is not None and row.value:
        try:
            payload = json.loads(row.value)
            if isinstance(payload, dict) and isinstance(payload.get("roles"), dict):
                stored = payload["roles"]
        except (TypeError, ValueError):
            logger.warning("工作台角色布局配置 JSON 损坏，使用代码兜底")

    roles: dict[str, list[dict[str, Any]]] = {}
    for role_code in WORKBENCH_ROLE_DEFAULTS:
        raw = stored.get(role_code)
        entries = _sanitize_entries(raw) if raw is not None else []
        roles[role_code] = entries or _default_entries(role_code)

    return {"roles": roles, "widgets": [_widget_payload(spec) for spec in WORKBENCH_WIDGETS.values()]}


def save_role_layouts(db: Session, roles: dict[str, list[dict[str, Any]]], operator_id: str) -> dict[str, Any]:
    """保存三角色默认布局到 system_configs（全量 upsert）.

    Args:
        db: 数据库会话
        roles: 角色 → 条目列表
        operator_id: 操作人（写入 updated_by_id 审计）

    Returns:
        保存后的完整响应（与 ``get_role_layouts`` 同构）。

    """
    sanitized: dict[str, list[dict[str, Any]]] = {}
    for role_code in WORKBENCH_ROLE_DEFAULTS:
        if role_code in roles:
            sanitized[role_code] = _sanitize_entries(roles[role_code])

    payload = json.dumps({"version": 1, "roles": sanitized}, ensure_ascii=False)
    row = db.query(SystemConfig).filter(SystemConfig.key == settings.workbench_role_layouts_key).first()
    try:
        if row is None:
            db.add(
                SystemConfig(
                    key=settings.workbench_role_layouts_key,
                    value=payload,
                    updated_by_id=operator_id,
                )
            )
        else:
            row.value = payload
            row.updated_by_id = operator_id
        db.commit()
    except IntegrityError:
        db.rollback()
        row = db.query(SystemConfig).filter(SystemConfig.key == settings.workbench_role_layouts_key).first()
        if row is None:
            raise
        row.value = payload
        row.updated_by_id = operator_id
        db.commit()

    return get_role_layouts(db)


def _widget_payload(spec: WidgetSpec) -> dict[str, Any]:
    """Widget 注册表对外形态."""
    return {
        "key": spec.key,
        "label": spec.label,
        "description": spec.description,
        "permission": spec.permission,
        "default_span": spec.default_span,
    }


__all__ = [
    "get_layout",
    "get_role_layouts",
    "reset_user_layout",
    "save_role_layouts",
    "save_user_layout",
]
