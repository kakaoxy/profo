"""通知偏好读写（迭代二 SPEC §6.1 / K5）.

存储：``user_preferences(namespace='notification.preferences')``，
``value = {"categories": {"lead": {"in_app": true, "wechat": false}, ...}}``。

**缺行 = 默认全开**（K5：使行为与迭代一现状一致）；``system``/``security`` 的
``in_app`` 恒为 True，关闭请求由 Service 层拒 400（本模块给 ``in_app_locked``）。
"""

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import User, UserPreference
from models.user.preference import NAMESPACE_NOTIFICATION_PREFS
from services.notification.events import (
    CATEGORY_META,
    CATEGORY_TEMPLATE_KEY,
    is_closeable_category,
)
from services.system import subscribe_templates

logger = logging.getLogger(__name__)

# 两条渠道（顺序稳定，前端按此渲染列）
_CHANNELS: tuple[str, ...] = ("in_app", "wechat")


def _default_categories() -> dict[str, dict[str, bool]]:
    """默认偏好：全开，但 ``marketing`` 仅微信（无站内信，K6）."""
    result: dict[str, dict[str, bool]] = {}
    for category in CATEGORY_META:
        wechat_only = bool(CATEGORY_META[category]["wechat_only"])
        result[category] = {"in_app": not wechat_only, "wechat": True}
    return result


def load_preferences(db: Session, user_id: str) -> dict[str, dict[str, bool]]:
    """读取用户偏好（缺行/坏 JSON → 默认全开）.

    Args:
        db: 数据库会话
        user_id: 用户ID

    Returns:
        分类 → 渠道开关的完整字典（8 个分类齐全）。

    """
    row = (
        db.query(UserPreference)
        .filter(
            UserPreference.user_id == user_id,
            UserPreference.namespace == NAMESPACE_NOTIFICATION_PREFS,
        )
        .first()
    )
    result = _default_categories()
    if row is None or not isinstance(row.value, dict):
        return result

    raw = row.value.get("categories")
    if not isinstance(raw, dict):
        return result

    for category, channels in raw.items():
        if category not in result or not isinstance(channels, dict):
            continue
        for channel in _CHANNELS:
            value = channels.get(channel)
            if isinstance(value, bool):
                result[category][channel] = value
        # 不可关闭的分类强制回到 True（防手工改库写入非法值）
        if not is_closeable_category(category):
            result[category]["in_app"] = True
    return result


def load_preferences_batch(db: Session, user_ids: list[str]) -> dict[str, dict[str, dict[str, bool]]]:
    """批量读取偏好（单次查询，缺行即默认）.

    Args:
        db: 数据库会话
        user_ids: 用户ID列表

    Returns:
        用户ID → 偏好字典；未出现在结果中的用户使用 ``_default_categories()``。

    """
    if not user_ids:
        return {}
    rows = (
        db.query(UserPreference)
        .filter(
            UserPreference.user_id.in_(user_ids),
            UserPreference.namespace == NAMESPACE_NOTIFICATION_PREFS,
        )
        .all()
    )
    by_user = {r.user_id: r for r in rows}
    result: dict[str, dict[str, dict[str, bool]]] = {}
    for uid in user_ids:
        row = by_user.get(uid)
        prefs = _default_categories()
        if row is not None and isinstance(row.value, dict):
            raw = row.value.get("categories")
            if isinstance(raw, dict):
                for category, channels in raw.items():
                    if category not in prefs or not isinstance(channels, dict):
                        continue
                    for channel in _CHANNELS:
                        value = channels.get(channel)
                        if isinstance(value, bool):
                            prefs[category][channel] = value
                    if not is_closeable_category(category):
                        prefs[category]["in_app"] = True
        result[uid] = prefs
    return result


def save_preferences(db: Session, user_id: str, categories: dict[str, dict[str, bool]]) -> None:
    """保存偏好（全量 upsert；并发保存回退为后写覆盖，不 500）.

    Args:
        db: 数据库会话
        user_id: 用户ID
        categories: 分类 → 渠道开关（调用方已校验不可关闭分类）

    Raises:
        ValueError: 尝试关闭不可关闭分类的站内信（K5）。

    """
    for category, channels in categories.items():
        if not is_closeable_category(category) and channels.get("in_app") is False:
            msg = "系统与安全通知不可关闭"
            raise ValueError(msg)

    payload = {"version": 1, "categories": categories}
    row = (
        db.query(UserPreference)
        .filter(
            UserPreference.user_id == user_id,
            UserPreference.namespace == NAMESPACE_NOTIFICATION_PREFS,
        )
        .first()
    )
    try:
        if row is None:
            db.add(
                UserPreference(
                    user_id=user_id,
                    namespace=NAMESPACE_NOTIFICATION_PREFS,
                    value=payload,
                )
            )
        else:
            row.value = payload
        db.commit()
    except IntegrityError:
        # 并发首写：唯一约束兜底，回滚后改为更新既有行
        db.rollback()
        row = (
            db.query(UserPreference)
            .filter(
                UserPreference.user_id == user_id,
                UserPreference.namespace == NAMESPACE_NOTIFICATION_PREFS,
            )
            .first()
        )
        if row is None:
            raise
        row.value = payload
        db.commit()


def allow(prefs: dict[str, dict[str, bool]], category: str, channel: str) -> bool:
    """判断某用户在该分类该渠道是否放行（缺分类视为放行）.

    Args:
        prefs: 单个用户的偏好字典
        category: 通知分类
        channel: 渠道（in_app / wechat）

    Returns:
        True 表示放行。

    """
    category_prefs = prefs.get(category)
    if not isinstance(category_prefs, dict):
        return True
    return bool(category_prefs.get(channel, True))


def wechat_available(db: Session, user: User) -> bool:
    """微信渠道是否对该用户可用（已绑定微信 + 至少 1 个模板已配置）.

    Args:
        db: 数据库会话
        user: 当前用户

    Returns:
        True 表示微信列可用。

    """
    if not _user_wechat_bound(db, user):
        return False
    return any(subscribe_templates.resolve_template_id(db, key) for key in _template_keys())


def template_status(db: Session) -> dict[str, bool]:
    """各分类绑定的微信模板是否已配置（K18：未配置 → 该分类微信开关置灰）.

    Args:
        db: 数据库会话

    Returns:
        分类 → 模板是否可用；无独立模板的分类为 False。

    """
    cache: dict[str, bool] = {}
    result: dict[str, bool] = {}
    for category, template_key in CATEGORY_TEMPLATE_KEY.items():
        if template_key is None:
            result[category] = False
            continue
        if template_key not in cache:
            cache[template_key] = bool(subscribe_templates.resolve_template_id(db, template_key))
        result[category] = cache[template_key]
    return result


def template_missing_count(db: Session) -> int:
    """5 个模板中未配置的个数（偏好页横幅文案，SPEC D-06）.

    Args:
        db: 数据库会话

    Returns:
        未配置模板个数（0~5）。

    """
    return sum(1 for key in _template_keys() if not subscribe_templates.resolve_template_id(db, key))


def _template_keys() -> tuple[str, ...]:
    """订阅模板 key 全集（唯一来源：subscribe_templates.TEMPLATE_KEYS）."""
    return tuple(subscribe_templates.TEMPLATE_KEYS)


def _user_wechat_bound(db: Session, user: User) -> bool:
    """用户是否已绑定微信（含经合并临时账号的间接绑定）.

    与 ``services/system/user/core.py::_attach_wechat_bound`` 同口径，
    但只针对单个用户，避免为一次判断拉起批量查询。
    """
    from services.system.openid import resolve_user_openids

    return bool(resolve_user_openids(db, user.id))


__all__ = [
    "allow",
    "load_preferences",
    "load_preferences_batch",
    "save_preferences",
    "template_missing_count",
    "template_status",
    "wechat_available",
]
