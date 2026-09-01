"""获客中心员工身份过滤.

员工维度统计（TOP 榜 / 员工漏斗下钻）的统一口径：仅统计具备后台身份的
用户（主角色或附加角色命中 BACKEND_ROLE_CODES，与
AuthService.has_backend_identity 同口径）。C 端用户（customer）的
分享/归因记录不计入员工维度统计。
"""

from sqlalchemy import ColumnElement, exists, or_, select
from sqlalchemy.orm import Session, aliased

from constants.role_codes import BACKEND_ROLE_CODES
from models import Lead, Role, User, user_roles


def internal_creator_exists() -> ColumnElement:
    """Lead.creator 为内部员工（主/附加角色命中后台角色）的 EXISTS 表达式.

    口径与 ``resolve_backend_employee_ids`` / ``AuthService.has_backend_identity``
    一致。用于把内部员工经 C 端链路上报的估价/房源单线索从「外部客户线索」
    统计中剔除，保证列表、漏斗、总览口径一致。

    """
    backend_codes = list(BACKEND_ROLE_CODES)
    creator = aliased(User)
    primary = exists(
        select(1)
        .select_from(creator)
        .join(Role, Role.id == creator.role_id)
        .where(creator.id == Lead.creator_id, Role.code.in_(backend_codes)),
    )
    additional = exists(
        select(1)
        .select_from(user_roles)
        .join(Role, Role.id == user_roles.c.role_id)
        .where(user_roles.c.user_id == Lead.creator_id, Role.code.in_(backend_codes)),
    )
    return or_(primary, additional)


def resolve_backend_employee_ids(db: Session, employee_ids: list[str]) -> set[str]:
    """批量解析具备后台身份的用户ID集合.

    Args:
        db: 数据库会话
        employee_ids: 待过滤的用户ID列表

    Returns:
        命中后台身份的用户ID集合；入参为空时返回空集合

    """
    if not employee_ids:
        return set()
    # 主角色命中
    primary_ids = {
        row[0]
        for row in (
            db.query(User.id)
            .join(Role, User.role_id == Role.id)
            .filter(User.id.in_(employee_ids), Role.code.in_(BACKEND_ROLE_CODES))
            .all()
        )
    }
    remaining = [eid for eid in employee_ids if eid not in primary_ids]
    if not remaining:
        return primary_ids
    # 附加角色命中
    additional_ids = {
        row[0]
        for row in (
            db.query(User.id)
            .join(user_roles, user_roles.c.user_id == User.id)
            .join(Role, user_roles.c.role_id == Role.id)
            .filter(User.id.in_(remaining), Role.code.in_(BACKEND_ROLE_CODES))
            .all()
        )
    }
    return primary_ids | additional_ids
