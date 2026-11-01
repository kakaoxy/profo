"""商户域数据范围（V01 REQ-M12-003 / D9 / Q48）.

- admin / operator：全量；
- user：本人拓展（``merchant_stores.owner_employee_id``）或本人拜访过的门店；
- 其他角色（customer）：无商户域数据，拒绝访问。
"""

from sqlalchemy import or_
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from models.merchant import MerchantStore, MerchantVisit
from models.user.user import User
from services.system.exceptions import PermissionDeniedError

FULL_SCOPE_ROLES: frozenset[str] = frozenset({"admin", "operator"})
LIMITED_SCOPE_ROLE = "user"


def role_codes(user: User) -> set[str]:
    """用户主角色 + 附加角色代码集合."""
    codes: set[str] = set()
    if user.role and user.role.code:
        codes.add(user.role.code)
    for item in user.roles or []:
        if item.code:
            codes.add(item.code)
    return codes


def is_full_scope(user: User) -> bool:
    """Admin / operator 拥有全量数据范围."""
    return bool(role_codes(user) & FULL_SCOPE_ROLES)


def ensure_scope_role(user: User) -> bool:
    """校验角色可进入商户域，返回是否全量范围.

    Raises:
        PermissionDeniedError: customer 或无角色用户

    """
    codes = role_codes(user)
    if codes & FULL_SCOPE_ROLES:
        return True
    if LIMITED_SCOPE_ROLE in codes:
        return False
    msg = "无权访问商户域数据"
    raise PermissionDeniedError(msg)


def store_scope_condition(db: Session, user: User) -> ColumnElement[bool] | None:
    """返回门店列表/详情的数据范围条件；None 表示全量."""
    if ensure_scope_role(user):
        return None

    visit_exists = (
        db.query(MerchantVisit.id)
        .filter(
            MerchantVisit.store_id == MerchantStore.id,
            MerchantVisit.employee_id == user.id,
            MerchantVisit.is_deleted.is_(False),
        )
        .exists()
    )
    return or_(MerchantStore.owner_employee_id == user.id, visit_exists)


def visible_store_ids(db: Session, user: User) -> ColumnElement[str] | None:
    """可见门店 id 子查询（用于把数据范围传递到门店下属数据，REQ-M12-003）.

    Returns:
        ``Select`` 子查询；``None`` 表示全量范围（admin/operator）。

    """
    condition = store_scope_condition(db, user)
    if condition is None:
        return None
    return db.query(MerchantStore.id).filter(condition).scalar_subquery()


def ensure_store_visible(db: Session, user: User, store: MerchantStore) -> None:
    """按 ID 访问门店时的越权校验（BR-M12-019：403，不泄露是否存在）."""
    if ensure_scope_role(user):
        return

    if store.owner_employee_id == user.id:
        return

    has_visit = (
        db.query(MerchantVisit.id)
        .filter(
            MerchantVisit.store_id == store.id,
            MerchantVisit.employee_id == user.id,
            MerchantVisit.is_deleted.is_(False),
        )
        .first()
    )
    if has_visit is not None:
        return

    msg = "无权访问该门店"
    raise PermissionDeniedError(msg)


__all__ = [
    "FULL_SCOPE_ROLES",
    "ensure_scope_role",
    "ensure_store_visible",
    "is_full_scope",
    "role_codes",
    "store_scope_condition",
]
