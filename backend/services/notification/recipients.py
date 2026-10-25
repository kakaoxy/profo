"""收件人解析（迭代二 SPEC §7.2）.

K3 收件人最小化：``Audience`` 三类条件之一必须非空，否则 ``ValueError``
（禁止默认全员广播）。

**反查能力是本期新增的**：审计确认全仓原本没有「按角色码 / 权限码反查用户」
的查询（``services/system/user/core.py`` 只按 ``Role.code`` 过滤，不支持权限码），
故本模块直接写只读 SQLAlchemy 查询（仍在 Service 层，未越层到 Router）。
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import Permission, Role, User, role_permissions, user_roles


@dataclass(frozen=True, slots=True)
class Audience:
    """收件人范围（三类条件的并集）.

    Attributes:
        user_ids: 直接指定的用户ID
        role_codes: 角色码（含附加角色）
        permission_codes: 权限码（主角色 + 附加角色的权限并集）

    """

    user_ids: tuple[str, ...] = ()
    role_codes: tuple[str, ...] = ()
    permission_codes: tuple[str, ...] = ()

    def is_empty(self) -> bool:
        """三类条件是否全空."""
        return not (self.user_ids or self.role_codes or self.permission_codes)


def resolve_recipients(db: Session, audience: Audience) -> list[str]:
    """解析收件人用户ID列表（并集去重，按 id 排序保证幂等）.

    Args:
        db: 数据库会话
        audience: 收件人范围

    Returns:
        排序后的用户ID列表（仅 ``status='active'`` 且具备后台身份的用户）。

    Raises:
        ValueError: audience 三类条件全空（K3）。

    """
    if audience.is_empty():
        msg = "audience 不能为空：user_ids / role_codes / permission_codes 至少提供一项（K3）"
        raise ValueError(msg)

    user_ids: set[str] = set(audience.user_ids)

    if audience.role_codes:
        user_ids |= _user_ids_by_role_codes(db, list(audience.role_codes))

    if audience.permission_codes:
        user_ids |= _user_ids_by_permission_codes(db, list(audience.permission_codes))

    if not user_ids:
        return []

    # 统一过滤：仅 active 且具备后台身份（admin/operator/user）的用户可收站内信
    active_ids = [
        row[0]
        for row in db.execute(
            select(User.id)
            .join(Role, Role.id == User.role_id)
            .where(
                User.id.in_(user_ids),
                User.status == "active",
                Role.code.in_(("admin", "operator", "user")),
            )
        ).all()
    ]
    return sorted(active_ids)


def _user_ids_by_role_codes(db: Session, role_codes: list[str]) -> set[str]:
    """按角色码反查用户（主角色 + 附加角色 ``user_roles``）."""
    result: set[str] = set()

    main = db.execute(select(User.id).join(Role, Role.id == User.role_id).where(Role.code.in_(role_codes))).all()
    result.update(row[0] for row in main)

    # 附加角色（user_roles 关联表）
    extra = db.execute(
        select(user_roles.c.user_id).join(Role, Role.id == user_roles.c.role_id).where(Role.code.in_(role_codes))
    ).all()
    result.update(row[0] for row in extra)
    return result


def _user_ids_by_permission_codes(db: Session, permission_codes: list[str]) -> set[str]:
    """按权限码反查用户（主角色 + 附加角色的权限并集）."""
    result: set[str] = set()

    # 主角色 → role_permissions → permissions
    main = db.execute(
        select(User.id)
        .join(role_permissions, role_permissions.c.role_id == User.role_id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .where(Permission.code.in_(permission_codes))
    ).all()
    result.update(row[0] for row in main)

    # 附加角色 → role_permissions → permissions
    extra = db.execute(
        select(user_roles.c.user_id)
        .join(role_permissions, role_permissions.c.role_id == user_roles.c.role_id)
        .join(Permission, Permission.id == role_permissions.c.permission_id)
        .where(Permission.code.in_(permission_codes))
    ).all()
    result.update(row[0] for row in extra)
    return result


__all__ = ["Audience", "resolve_recipients"]
